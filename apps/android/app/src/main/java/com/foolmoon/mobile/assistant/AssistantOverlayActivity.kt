package com.foolmoon.mobile.assistant

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CropFree
import androidx.compose.material.icons.filled.OpenInFull
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.foolmoon.mobile.FoolmoonApp
import com.foolmoon.mobile.agent.FoolmoonAccessibilityService
import com.foolmoon.mobile.agent.ScreenElementNode
import com.foolmoon.mobile.network.PcLinkState
import com.foolmoon.mobile.ui.MainActivity
import com.foolmoon.mobile.ui.components.BbotCompanionFace
import com.foolmoon.mobile.ui.components.CircleToSearchOverlay
import com.foolmoon.mobile.ui.components.CompanionMood
import com.foolmoon.mobile.ui.components.GeminiThinkingShimmerBar
import com.foolmoon.mobile.ui.components.GeminiVoiceWaveOrb
import com.foolmoon.mobile.ui.components.SyncedLyricsBar
import com.foolmoon.mobile.ui.components.geminiSweepBrush
import com.foolmoon.mobile.ui.components.rememberGeminiAuraPhase
import com.foolmoon.mobile.ui.theme.FoolmoonColors
import com.foolmoon.mobile.ui.theme.FoolmoonTheme
import org.json.JSONObject
import java.util.Locale

/**
 * Gemini-style floating translucent bottom-sheet overlay summoned over ANY Android app via:
 * - Default Digital Assistant gesture / power-button hold
 * - "Hey Foolmoon" wake word detection
 * - Quick Settings Tile or in-app voice orb
 */
class AssistantOverlayActivity : ComponentActivity() {

    companion object {
        const val EXTRA_AUTO_LISTEN = "auto_listen"
        const val EXTRA_INITIAL_PROMPT = "initial_prompt"
        const val EXTRA_SCREEN_CONTEXT = "screen_context"
        const val EXTRA_FROM_WAKE_WORD = "from_wake_word"
    }

    private var speechRecognizer: SpeechRecognizer? = null
    private val isListeningState = mutableStateOf(false)
    private val livePartialState = mutableStateOf("")
    private val micLevelState = mutableStateOf(0f)
    private var capturedScreenContext: String = ""

    private val micPermLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startVoiceCapture()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as FoolmoonApp
        app.bridge.connectIfPaired()
        handleLaunchIntent(intent)

        setContent {
            FoolmoonTheme {
                OverlayScreen(
                    app = app,
                    isListening = isListeningState.value,
                    partialTranscript = livePartialState.value,
                    micLevel = micLevelState.value,
                    initialScreenContext = capturedScreenContext,
                    onToggleMic = { toggleVoiceCapture() },
                    onSendPrompt = { text, withScreen ->
                        stopVoiceCapture()
                        app.bridge.sendPrompt(
                            prompt = text,
                            includeScreenContext = withScreen,
                            assistContext = if (withScreen) capturedScreenContext else null
                        )
                    },
                    onOpenFullApp = {
                        startActivity(Intent(this, MainActivity::class.java))
                        finish()
                    },
                    onDismiss = { finish() }
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleLaunchIntent(intent)
    }

    override fun onDestroy() {
        stopVoiceCapture()
        super.onDestroy()
    }

    private fun handleLaunchIntent(intent: Intent?) {
        val app = application as FoolmoonApp
        capturedScreenContext = intent?.getStringExtra(EXTRA_SCREEN_CONTEXT).orEmpty()
        val initialPrompt = intent?.getStringExtra(EXTRA_INITIAL_PROMPT).orEmpty().trim()
        val autoListen = intent?.getBooleanExtra(EXTRA_AUTO_LISTEN, true) ?: true

        if (initialPrompt.isNotEmpty()) {
            app.bridge.sendPrompt(
                initialPrompt,
                includeScreenContext = capturedScreenContext.isNotBlank(),
                assistContext = capturedScreenContext
            )
        } else if (autoListen) {
            ensureMicAndListen()
        }
    }

    private fun toggleVoiceCapture() {
        if (isListeningState.value) stopVoiceCapture() else ensureMicAndListen()
    }

    private fun ensureMicAndListen() {
        val hasPerm = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        if (hasPerm) startVoiceCapture() else micPermLauncher.launch(Manifest.permission.RECORD_AUDIO)
    }

    private fun startVoiceCapture() {
        val app = application as FoolmoonApp
        app.voicePlayer.stop()
        if (!SpeechRecognizer.isRecognitionAvailable(this)) return

        runCatching { speechRecognizer?.destroy() }
        livePartialState.value = ""
        isListeningState.value = true

        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {
                    micLevelState.value = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f)
                }
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {
                    isListeningState.value = false
                    micLevelState.value = 0f
                }
                override fun onError(error: Int) {
                    isListeningState.value = false
                    micLevelState.value = 0f
                }
                override fun onResults(results: Bundle?) {
                    isListeningState.value = false
                    micLevelState.value = 0f
                    val best = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty().trim()
                    if (best.isNotEmpty()) {
                        livePartialState.value = best
                        app.bridge.sendPrompt(
                            prompt = best,
                            includeScreenContext = capturedScreenContext.isNotBlank(),
                            assistContext = capturedScreenContext
                        )
                    }
                }
                override fun onPartialResults(partialResults: Bundle?) {
                    val partial = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                    if (partial.isNotBlank()) livePartialState.value = partial
                }
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
        }

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
        }
        runCatching { speechRecognizer?.startListening(intent) }
    }

    private fun stopVoiceCapture() {
        isListeningState.value = false
        micLevelState.value = 0f
        runCatching {
            speechRecognizer?.stopListening()
            speechRecognizer?.destroy()
        }
        speechRecognizer = null
    }
}

@Composable
private fun OverlayScreen(
    app: FoolmoonApp,
    isListening: Boolean,
    partialTranscript: String,
    micLevel: Float,
    initialScreenContext: String,
    onToggleMic: () -> Unit,
    onSendPrompt: (String, Boolean) -> Unit,
    onOpenFullApp: () -> Unit,
    onDismiss: () -> Unit
) {
    val pcStatus by app.bridge.pcStatus.collectAsState()
    val busy by app.bridge.busy.collectAsState()
    val statusLine by app.bridge.statusLine.collectAsState()
    val turns by app.bridge.turns.collectAsState()
    val playback by app.voicePlayer.snapshot.collectAsState()

    var draft by remember { mutableStateOf("") }
    var askScreen by remember { mutableStateOf(initialScreenContext.isNotBlank()) }
    var showCircleSearch by remember { mutableStateOf(false) }
    var capturedBmp by remember { mutableStateOf<Bitmap?>(FoolmoonAccessibilityService.lastCapturedBitmap) }
    var capturedNodes by remember { mutableStateOf<List<ScreenElementNode>>(FoolmoonAccessibilityService.lastCapturedNodes) }

    val mood = when {
        playback.speaking -> CompanionMood.SPEAKING
        isListening -> CompanionMood.LISTENING
        busy -> CompanionMood.THINKING
        else -> CompanionMood.IDLE
    }
    val activeAudio = if (playback.speaking) playback.audioLevel else micLevel
    val latestAssistant = turns.lastOrNull { it.role == "assistant" }?.content.orEmpty()
    val auraPhase = rememberGeminiAuraPhase(2400)

    Box(modifier = Modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clickable(
                    indication = null,
                    interactionSource = remember { MutableInteractionSource() },
                    onClick = onDismiss
                ),
            contentAlignment = Alignment.BottomCenter
        ) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 10.dp, vertical = 12.dp)
                    .navigationBarsPadding()
                    .imePadding()
                    .clickable(
                        indication = null,
                        interactionSource = remember { MutableInteractionSource() },
                        onClick = {}
                    )
                    .border(
                        width = 1.8.dp,
                        brush = geminiSweepBrush(auraPhase, alpha = 0.92f),
                        shape = RoundedCornerShape(28.dp)
                    ),
                shape = RoundedCornerShape(28.dp),
                color = FoolmoonColors.SurfaceCard.copy(alpha = 0.96f),
                tonalElevation = 14.dp
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        BbotCompanionFace(mood = mood, audioLevel = activeAudio, size = 46.dp)
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Foolmoon",
                                color = FoolmoonColors.Cream,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold
                            )
                            val computeTag = if (pcStatus.linkState == PcLinkState.CONNECTED) {
                                "PC GPU · ${pcStatus.activeModel.ifBlank { pcStatus.pcName }}"
                            } else {
                                "Mobil Asistan"
                            }
                            Text(
                                text = "$computeTag · $statusLine",
                                color = if (pcStatus.linkState == PcLinkState.CONNECTED) FoolmoonColors.Emerald else FoolmoonColors.Muted,
                                fontSize = 11.sp,
                                maxLines = 1
                            )
                        }
                        IconButton(onClick = onOpenFullApp) {
                            Icon(Icons.Default.OpenInFull, contentDescription = "Tam uygulamayı aç", tint = FoolmoonColors.Muted)
                        }
                        IconButton(onClick = onDismiss) {
                            Icon(Icons.Default.Close, contentDescription = "Kapat", tint = FoolmoonColors.Muted)
                        }
                    }

                    if (busy) {
                        GeminiThinkingShimmerBar(label = "Yanıt hazırlanıyor…")
                    } else {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(16.dp))
                                .background(FoolmoonColors.Obsidian.copy(alpha = 0.72f))
                                .padding(12.dp)
                        ) {
                            val fallback = when {
                                isListening && partialTranscript.isNotBlank() -> "“$partialTranscript”"
                                isListening -> "Dinliyorum… konuşun veya bir komut verin"
                                latestAssistant.isNotBlank() -> latestAssistant.take(300)
                                else -> "Ekranı seçip arayabilir, ekrandaki içerik hakkında soru sorabilir veya birini arayabilirsiniz."
                            }
                            SyncedLyricsBar(playback = playback, fallbackText = fallback)
                        }
                    }

                    // Gemini-style quick pills inside overlay
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        AssistChip(
                            onClick = {
                                val svc = FoolmoonAccessibilityService.current()
                                if (svc != null && capturedNodes.isEmpty()) {
                                    svc.captureScreenSnapshot { bmp, nodes ->
                                        capturedBmp = bmp
                                        capturedNodes = nodes
                                        showCircleSearch = true
                                    }
                                } else {
                                    showCircleSearch = true
                                }
                            },
                            label = { Text("Seç & Ara", fontSize = 11.sp) },
                            leadingIcon = { Icon(Icons.Default.CropFree, contentDescription = null, modifier = Modifier.size(14.dp), tint = FoolmoonColors.LunarGold) }
                        )
                        AssistChip(
                            onClick = { askScreen = !askScreen },
                            label = { Text(if (askScreen) "Ekran Bağlamı Açık" else "Ekranı Sor", fontSize = 11.sp) },
                            leadingIcon = {
                                Icon(
                                    Icons.Default.Visibility,
                                    contentDescription = null,
                                    modifier = Modifier.size(14.dp),
                                    tint = if (askScreen) FoolmoonColors.Crimson else FoolmoonColors.SkyGlow
                                )
                            }
                        )
                        AssistChip(
                            onClick = {
                                app.bridge.executeAndRecordLocalAction(
                                    userLabel = "Telefon çeviriciyi aç",
                                    action = "dial_number",
                                    params = JSONObject()
                                )
                            },
                            label = { Text("Birini Ara", fontSize = 11.sp) },
                            leadingIcon = { Icon(Icons.Default.Call, contentDescription = null, modifier = Modifier.size(14.dp), tint = FoolmoonColors.Emerald) }
                        )
                        if (playback.speaking) {
                            AssistChip(
                                onClick = { app.voicePlayer.stop() },
                                label = { Text("Durdur", fontSize = 11.sp) },
                                leadingIcon = { Icon(Icons.Default.Stop, contentDescription = null, modifier = Modifier.size(14.dp)) }
                            )
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = draft,
                            onValueChange = { draft = it },
                            placeholder = { Text("Foolmoon'a sor…", fontSize = 13.sp, color = FoolmoonColors.Muted) },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(22.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = FoolmoonColors.Crimson,
                                unfocusedBorderColor = FoolmoonColors.Border,
                                focusedTextColor = FoolmoonColors.Cream,
                                unfocusedTextColor = FoolmoonColors.Cream
                            )
                        )

                        if (draft.isNotBlank()) {
                            IconButton(
                                onClick = {
                                    val text = draft.trim()
                                    draft = ""
                                    onSendPrompt(text, askScreen)
                                },
                                modifier = Modifier
                                    .size(46.dp)
                                    .clip(CircleShape)
                                    .background(FoolmoonColors.Crimson)
                            ) {
                                Icon(Icons.Default.Send, contentDescription = "Gönder", tint = Color.White)
                            }
                        } else {
                            GeminiVoiceWaveOrb(
                                isListening = isListening,
                                isSpeaking = playback.speaking,
                                isThinking = busy,
                                audioLevel = activeAudio,
                                size = 46.dp,
                                onClick = onToggleMic
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(2.dp))
                }
            }
        }

        AnimatedVisibility(
            visible = showCircleSearch,
            enter = fadeIn(),
            exit = fadeOut()
        ) {
            CircleToSearchOverlay(
                capturedBitmap = capturedBmp,
                capturedNodes = capturedNodes,
                fallbackScreenText = initialScreenContext.ifBlank { FoolmoonAccessibilityService.lastCapturedSummary },
                onDismiss = { showCircleSearch = false },
                onAskAboutSelection = { selectedText, userQuestion ->
                    showCircleSearch = false
                    app.bridge.sendPrompt(
                        prompt = userQuestion,
                        includeScreenContext = true,
                        assistContext = "Ekranda Seçilen Bölge:\n$selectedText"
                    )
                },
                onSearchWeb = { query ->
                    showCircleSearch = false
                    app.bridge.executeAndRecordLocalAction(
                        userLabel = "Web'de ara: $query",
                        action = "search_web",
                        params = JSONObject().put("query", query)
                    )
                },
                onCallTarget = { number ->
                    showCircleSearch = false
                    app.bridge.executeAndRecordLocalAction(
                        userLabel = "Ara: $number",
                        action = "call_contact",
                        params = JSONObject().put("phone", number)
                    )
                }
            )
        }
    }
}
