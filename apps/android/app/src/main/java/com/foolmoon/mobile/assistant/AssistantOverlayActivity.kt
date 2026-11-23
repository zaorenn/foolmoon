package com.foolmoon.mobile.assistant

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Mic
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.foolmoon.mobile.FoolmoonApp
import com.foolmoon.mobile.network.PcLinkState
import com.foolmoon.mobile.ui.MainActivity
import com.foolmoon.mobile.ui.components.BbotCompanionFace
import com.foolmoon.mobile.ui.components.CompanionMood
import com.foolmoon.mobile.ui.components.SyncedLyricsBar
import com.foolmoon.mobile.ui.theme.FoolmoonColors
import com.foolmoon.mobile.ui.theme.FoolmoonTheme
import java.util.Locale

/**
 * Gemini-style floating translucent bottom-sheet overlay summoned by:
 * - Default Digital Assistant gesture / power-button hold
 * - "Hey Foolmoon" wake word detection
 * - Quick Settings Tile
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
                    hasScreenContext = capturedScreenContext.isNotBlank(),
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
            app.bridge.sendPrompt(initialPrompt, includeScreenContext = capturedScreenContext.isNotBlank(), assistContext = capturedScreenContext)
        } else if (autoListen) {
            ensureMicAndListen()
        }
    }

    private fun toggleVoiceCapture() {
        if (isListeningState.value) {
            stopVoiceCapture()
        } else {
            ensureMicAndListen()
        }
    }

    private fun ensureMicAndListen() {
        val hasPerm = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        if (hasPerm) {
            startVoiceCapture()
        } else {
            micPermLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
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
    hasScreenContext: Boolean,
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
    var askScreen by remember { mutableStateOf(hasScreenContext) }

    val mood = when {
        playback.speaking -> CompanionMood.SPEAKING
        isListening -> CompanionMood.LISTENING
        busy -> CompanionMood.THINKING
        else -> CompanionMood.IDLE
    }
    val activeAudio = if (playback.speaking) playback.audioLevel else micLevel
    val latestAssistant = turns.lastOrNull { it.role == "assistant" }?.content.orEmpty()

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
                    width = 1.5.dp,
                    brush = Brush.horizontalGradient(
                        listOf(
                            FoolmoonColors.Coral.copy(alpha = 0.85f),
                            FoolmoonColors.LunarGold.copy(alpha = 0.85f),
                            FoolmoonColors.SkyGlow.copy(alpha = 0.85f)
                        )
                    ),
                    shape = RoundedCornerShape(28.dp)
                ),
            shape = RoundedCornerShape(28.dp),
            color = FoolmoonColors.SurfaceCard.copy(alpha = 0.96f),
            tonalElevation = 12.dp
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Header row: Bbot + PC Compute badge + actions
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    BbotCompanionFace(mood = mood, audioLevel = activeAudio, size = 48.dp)
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Foolmoon Assistant",
                            color = FoolmoonColors.Cream,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        val computeTag = if (pcStatus.linkState == PcLinkState.CONNECTED) {
                            "PC GPU · ${pcStatus.activeModel.ifBlank { pcStatus.pcName }}"
                        } else {
                            "On-Device Agent · Offline"
                        }
                        Text(
                            text = "$computeTag · $statusLine",
                            color = if (pcStatus.linkState == PcLinkState.CONNECTED) FoolmoonColors.Emerald else FoolmoonColors.Muted,
                            fontSize = 11.sp,
                            maxLines = 1
                        )
                    }
                    IconButton(onClick = onOpenFullApp) {
                        Icon(Icons.Default.OpenInFull, contentDescription = "Open full app", tint = FoolmoonColors.Muted)
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Dismiss", tint = FoolmoonColors.Muted)
                    }
                }

                // Live synced captions or latest assistant reply
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(FoolmoonColors.Obsidian.copy(alpha = 0.65f))
                        .padding(12.dp)
                ) {
                    val fallback = when {
                        isListening && partialTranscript.isNotBlank() -> "“$partialTranscript”"
                        isListening -> "Listening… say anything or give a phone command"
                        busy -> "Computing on your PC…"
                        latestAssistant.isNotBlank() -> latestAssistant.take(260)
                        else -> "Ask anything, inspect your screen, or control your phone."
                    }
                    SyncedLyricsBar(playback = playback, fallbackText = fallback)
                }

                // Quick Gemini-style context & action chips
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    AssistChip(
                        onClick = { askScreen = !askScreen },
                        label = { Text(if (askScreen) "Screen Context ON" else "Ask about screen", fontSize = 11.sp) },
                        leadingIcon = {
                            Icon(
                                Icons.Default.Visibility,
                                contentDescription = null,
                                modifier = Modifier.size(14.dp),
                                tint = if (askScreen) FoolmoonColors.Coral else FoolmoonColors.Muted
                            )
                        }
                    )
                    if (playback.speaking) {
                        AssistChip(
                            onClick = { app.voicePlayer.stop() },
                            label = { Text("Stop Voice", fontSize = 11.sp) },
                            leadingIcon = {
                                Icon(Icons.Default.Stop, contentDescription = null, modifier = Modifier.size(14.dp))
                            }
                        )
                    }
                }

                // Composer + glowing Voice Orb
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedTextField(
                        value = draft,
                        onValueChange = { draft = it },
                        placeholder = { Text("Ask Foolmoon…", fontSize = 13.sp, color = FoolmoonColors.Muted) },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(22.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = FoolmoonColors.Coral,
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
                                .background(FoolmoonColors.Coral)
                        ) {
                            Icon(Icons.Default.Send, contentDescription = "Send", tint = Color.Black)
                        }
                    } else {
                        IconButton(
                            onClick = onToggleMic,
                            modifier = Modifier
                                .size(46.dp)
                                .clip(CircleShape)
                                .background(if (isListening) FoolmoonColors.Emerald else FoolmoonColors.Coral)
                        ) {
                            Icon(
                                if (isListening) Icons.Default.Stop else Icons.Default.Mic,
                                contentDescription = "Voice",
                                tint = Color.Black
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.height(2.dp))
            }
        }
    }
}
