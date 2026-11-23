package com.foolmoon.mobile.wakeword

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.app.NotificationCompat
import com.foolmoon.mobile.FoolmoonApp
import com.foolmoon.mobile.R
import com.foolmoon.mobile.assistant.AssistantOverlayActivity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.Locale

/**
 * Battery-conscious Foreground Service listening continuously for the wake phrase
 * ("Hey Foolmoon" or custom phrase) using on-device offline speech recognition,
 * and summoning the Gemini-style [AssistantOverlayActivity] immediately on detection.
 */
class WakeWordForegroundService : Service() {

    companion object {
        private const val CHANNEL_ID = "foolmoon_wakeword_channel"
        private const val NOTIF_ID = 4201

        private val _running = MutableStateFlow(false)
        val running: StateFlow<Boolean> = _running.asStateFlow()

        private val _lastHeard = MutableStateFlow("")
        val lastHeard: StateFlow<String> = _lastHeard.asStateFlow()

        fun start(context: Context) {
            val intent = Intent(context, WakeWordForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, WakeWordForegroundService::class.java))
        }
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var listening = false
    private var destroyed = false
    private var restartBackoffMs = 600L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        ensureChannel()
        val notif = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            startForeground(NOTIF_ID, notif)
        }
        _running.value = true
        mainHandler.post { initAndListen() }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onDestroy() {
        destroyed = true
        _running.value = false
        mainHandler.removeCallbacksAndMessages(null)
        runCatching {
            recognizer?.stopListening()
            recognizer?.destroy()
        }
        recognizer = null
        super.onDestroy()
    }

    private fun initAndListen() {
        if (destroyed) return
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            _lastHeard.value = "Speech recognition unavailable on this device"
            return
        }
        runCatching { recognizer?.destroy() }
        recognizer = SpeechRecognizer.createSpeechRecognizer(this).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {
                    listening = true
                    restartBackoffMs = 500L
                }

                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {
                    listening = false
                }

                override fun onError(error: Int) {
                    listening = false
                    val delayMs = when (error) {
                        SpeechRecognizer.ERROR_NO_MATCH,
                        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> 400L
                        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> 1_200L
                        else -> (restartBackoffMs * 2).coerceAtMost(6_000L).also { restartBackoffMs = it }
                    }
                    scheduleRestart(delayMs)
                }

                override fun onResults(results: Bundle?) {
                    listening = false
                    val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
                    if (!inspectCandidates(matches)) {
                        scheduleRestart(350L)
                    }
                }

                override fun onPartialResults(partialResults: Bundle?) {
                    val partials = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
                    inspectCandidates(partials)
                }

                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
        }
        startListenPass()
    }

    private fun inspectCandidates(candidates: List<String>): Boolean {
        val phrase = (application as FoolmoonApp).prefs.wakePhrase
        for (text in candidates) {
            if (text.isBlank()) continue
            _lastHeard.value = text
            val match = WakeWordMatcher.match(text, phrase)
            if (match.matched) {
                triggerAssistantOverlay(match.trailingCommand)
                scheduleRestart(3_500L)
                return true
            }
        }
        return false
    }

    private fun triggerAssistantOverlay(trailingCommand: String) {
        runCatching { recognizer?.cancel() }
        listening = false
        runCatching {
            val vib = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vib?.vibrate(VibrationEffect.createOneShot(45L, VibrationEffect.DEFAULT_AMPLITUDE))
            }
        }
        val launch = Intent(this, AssistantOverlayActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra(AssistantOverlayActivity.EXTRA_AUTO_LISTEN, trailingCommand.isBlank())
            putExtra(AssistantOverlayActivity.EXTRA_INITIAL_PROMPT, trailingCommand)
            putExtra(AssistantOverlayActivity.EXTRA_FROM_WAKE_WORD, true)
        }
        startActivity(launch)
    }

    private fun startListenPass() {
        if (destroyed || listening) return
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
        }
        runCatching { recognizer?.startListening(intent) }
            .onFailure { scheduleRestart(2_000L) }
    }

    private fun scheduleRestart(delayMs: Long) {
        if (destroyed) return
        mainHandler.removeCallbacksAndMessages(null)
        mainHandler.postDelayed({ startListenPass() }, delayMs)
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            val ch = NotificationChannel(
                CHANNEL_ID,
                "Foolmoon Wake Word",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Listens for 'Hey Foolmoon' hands-free activation"
                setShowBadge(false)
            }
            nm.createNotificationChannel(ch)
        }
    }

    private fun buildNotification(): Notification {
        val openIntent = Intent(this, AssistantOverlayActivity::class.java).apply {
            putExtra(AssistantOverlayActivity.EXTRA_AUTO_LISTEN, true)
        }
        val pi = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val phrase = (application as FoolmoonApp).prefs.wakePhrase
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_foolmoon_monochrome)
            .setContentTitle("Foolmoon Assistant active")
            .setContentText("Say \"$phrase\" or tap to summon")
            .setOngoing(true)
            .setContentIntent(pi)
            .build()
    }
}
