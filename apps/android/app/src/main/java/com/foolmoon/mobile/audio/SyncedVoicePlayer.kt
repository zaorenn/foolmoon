package com.foolmoon.mobile.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.speech.tts.TextToSpeech
import android.util.Base64
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONArray
import java.io.File
import java.util.Locale
import kotlin.math.abs
import kotlin.math.sin

data class CaptionWord(
    val word: String,
    val startMs: Int,
    val endMs: Int
)

data class VoicePlaybackSnapshot(
    val speaking: Boolean = false,
    val sentence: String = "",
    val words: List<CaptionWord> = emptyList(),
    val elapsedMs: Int = 0,
    val audioLevel: Float = 0f,
    val provider: String = ""
)

class SyncedVoicePlayer(private val appContext: Context) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val _snapshot = MutableStateFlow(VoicePlaybackSnapshot())
    val snapshot: StateFlow<VoicePlaybackSnapshot> = _snapshot.asStateFlow()

    private var activePlayer: MediaPlayer? = null
    private var progressJob: Job? = null
    private var fallbackTts: TextToSpeech? = null
    private var fallbackReady = false

    init {
        fallbackTts = TextToSpeech(appContext.applicationContext) { code ->
            fallbackReady = code == TextToSpeech.SUCCESS
            if (fallbackReady) {
                fallbackTts?.language = Locale.getDefault()
            }
        }
    }

    fun playBase64Wav(base64Audio: String, rawSentence: String, timingsJson: JSONArray?, provider: String) {
        stop()
        val cleanText = cleanCaption(rawSentence)
        val wordList = decodeWordTimings(timingsJson, cleanText)
        try {
            val wavData = Base64.decode(base64Audio, Base64.DEFAULT)
            val cacheWav = File(appContext.cacheDir, "fm_reply_${System.currentTimeMillis()}.wav")
            cacheWav.writeBytes(wavData)

            val player = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
                setDataSource(cacheWav.absolutePath)
                setOnCompletionListener {
                    cacheWav.delete()
                    stop()
                }
                setOnErrorListener { _, _, _ ->
                    cacheWav.delete()
                    stop()
                    true
                }
                prepare()
                start()
            }
            activePlayer = player
            val startWall = System.currentTimeMillis()
            _snapshot.value = VoicePlaybackSnapshot(
                speaking = true,
                sentence = cleanText,
                words = wordList,
                elapsedMs = 0,
                audioLevel = 0.45f,
                provider = provider
            )
            progressJob = scope.launch {
                while (isActive && activePlayer?.isPlaying == true) {
                    val ms = runCatching { activePlayer?.currentPosition ?: 0 }.getOrDefault(0)
                    val sec = (System.currentTimeMillis() - startWall) / 1000.0
                    val amp = (0.30 + 0.56 * abs(sin(sec * 10.2))).toFloat().coerceIn(0f, 1f)
                    _snapshot.value = _snapshot.value.copy(elapsedMs = ms, audioLevel = amp)
                    delay(45L)
                }
            }
        } catch (_: Exception) {
            speakOnDevice(cleanText)
        }
    }

    fun speakOnDevice(rawText: String) {
        stop()
        val clean = cleanCaption(rawText)
        if (clean.isBlank()) return
        val estimated = approximateWordTimings(clean)
        val totalMs = estimated.lastOrNull()?.endMs ?: 1600
        if (fallbackReady) {
            fallbackTts?.speak(clean, TextToSpeech.QUEUE_FLUSH, null, "fm_tts_${System.currentTimeMillis()}")
        }
        val startWall = System.currentTimeMillis()
        _snapshot.value = VoicePlaybackSnapshot(
            speaking = true,
            sentence = clean,
            words = estimated,
            elapsedMs = 0,
            audioLevel = 0.4f,
            provider = "on-device"
        )
        progressJob = scope.launch {
            while (isActive) {
                val elapsed = (System.currentTimeMillis() - startWall).toInt()
                if (elapsed > totalMs + 350 && fallbackTts?.isSpeaking != true) break
                val amp = (0.25 + 0.5 * abs(sin(elapsed / 105.0))).toFloat()
                _snapshot.value = _snapshot.value.copy(elapsedMs = elapsed, audioLevel = amp)
                delay(50L)
            }
            _snapshot.value = VoicePlaybackSnapshot()
        }
    }

    fun stop() {
        progressJob?.cancel()
        progressJob = null
        runCatching {
            activePlayer?.stop()
            activePlayer?.release()
        }
        activePlayer = null
        runCatching { fallbackTts?.stop() }
        _snapshot.value = VoicePlaybackSnapshot()
    }

    private fun cleanCaption(text: String): String = text
        .replace(Regex("\\[([^\\]]+)\\]\\([^)]+\\)"), "$1")
        .replace(Regex("(?m)^\\s*(?:#{1,6}\\s+|>\\s*|[-*+]\\s+)"), "")
        .replace(Regex("(?:\\*{1,3}|_{1,3}|~~|`+)"), "")
        .replace(Regex("\\s+"), " ")
        .trim()

    private fun decodeWordTimings(json: JSONArray?, fallback: String): List<CaptionWord> {
        if (json == null || json.length() == 0) return approximateWordTimings(fallback)
        val list = mutableListOf<CaptionWord>()
        for (i in 0 until json.length()) {
            val item = json.optJSONObject(i) ?: continue
            val word = cleanCaption(item.optString("word"))
            if (word.isEmpty()) continue
            list.add(CaptionWord(word, item.optInt("startMs", 0), item.optInt("endMs", 240)))
        }
        return list.ifEmpty { approximateWordTimings(fallback) }
    }

    private fun approximateWordTimings(sentence: String): List<CaptionWord> {
        val parts = sentence.split(Regex("\\s+")).filter { it.isNotBlank() }
        var t = 0
        return parts.map { token ->
            val len = (145 + token.length * 35).coerceIn(170, 620)
            val w = CaptionWord(token, t, t + len)
            t += len + 20
            w
        }
    }
}
