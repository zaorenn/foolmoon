package com.foolmoon.mobile.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddComment
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.CropFree
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.FlashlightOff
import androidx.compose.material.icons.filled.FlashlightOn
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.foolmoon.mobile.FoolmoonApp
import com.foolmoon.mobile.agent.FoolmoonAccessibilityService
import com.foolmoon.mobile.agent.ScreenElementNode
import com.foolmoon.mobile.assistant.AssistantOverlayActivity
import com.foolmoon.mobile.network.PcLinkState
import com.foolmoon.mobile.ui.components.BbotCompanionFace
import com.foolmoon.mobile.ui.components.CircleToSearchOverlay
import com.foolmoon.mobile.ui.components.CompanionMood
import com.foolmoon.mobile.ui.components.DesktopPaperSurface
import com.foolmoon.mobile.ui.components.GeminiThinkingShimmerBar
import com.foolmoon.mobile.ui.components.GeminiVoiceWaveOrb
import com.foolmoon.mobile.ui.components.SyncedLyricsBar
import com.foolmoon.mobile.ui.components.geminiSweepBrush
import com.foolmoon.mobile.ui.components.rememberGeminiAuraPhase
import com.foolmoon.mobile.ui.theme.FoolmoonColors
import com.foolmoon.mobile.ui.theme.FoolmoonTheme
import com.foolmoon.mobile.wakeword.WakeWordForegroundService
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.Locale

class MainActivity : ComponentActivity() {

    private val permLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { _ -> }

    private val deepLinkHost = mutableStateOf("")
    private val deepLinkPort = mutableStateOf("8080")
    private val deepLinkCode = mutableStateOf("")

    private var speechRecognizer: SpeechRecognizer? = null
    private val isListeningState = mutableStateOf(false)
    private val micLevelState = mutableFloatStateOf(0f)
    private val voiceDraftState = mutableStateOf("")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as FoolmoonApp
        requestCorePermissions()
        parsePairingDeepLink(intent)
        app.bridge.connectIfPaired()

        setContent {
            FoolmoonTheme {
                FoolmoonSimplifiedMobileApp(
                    app = app,
                    initialHost = deepLinkHost.value.ifBlank { app.prefs.pcHost },
                    initialPort = deepLinkPort.value.ifBlank { app.prefs.pcPort.toString() },
                    initialCode = deepLinkCode.value,
                    openSettingsSheetByDefault = deepLinkCode.value.length == 6,
                    isInlineListening = isInlineListeningValue(),
                    inlineMicLevel = micLevelState.floatValue,
                    voiceDraft = voiceDraftState.value,
                    onConsumeVoiceDraft = { voiceDraftState.value = "" },
                    onToggleInlineMic = { autoSendCallback -> toggleInlineSpeech(app, autoSendCallback) },
                    onSummonOverlay = {
                        val svc = FoolmoonAccessibilityService.current()
                        if (svc != null) {
                            svc.captureScreenSnapshot { _, _ -> launchAssistantOverlay() }
                        } else {
                            launchAssistantOverlay()
                        }
                    },
                    onOpenAssistantSettings = {
                        runCatching { startActivity(Intent(Settings.ACTION_VOICE_INPUT_SETTINGS)) }
                            .onFailure { startActivity(Intent(Settings.ACTION_SETTINGS)) }
                    },
                    onOpenAccessibilitySettings = {
                        startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                    }
                )
            }
        }
    }

    @Composable
    private fun isInlineListeningValue(): Boolean = isListeningState.value

    private fun launchAssistantOverlay() {
        startActivity(
            Intent(this, AssistantOverlayActivity::class.java)
                .putExtra(AssistantOverlayActivity.EXTRA_AUTO_LISTEN, true)
        )
    }

    override fun onDestroy() {
        stopInlineSpeech()
        super.onDestroy()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        parsePairingDeepLink(intent)
    }

    private fun parsePairingDeepLink(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme == "foolmoon" && uri.host == "pair") {
            deepLinkHost.value = uri.getQueryParameter("host").orEmpty()
            deepLinkPort.value = uri.getQueryParameter("port").orEmpty().ifBlank { "8080" }
            deepLinkCode.value = uri.getQueryParameter("code").orEmpty()
        }
    }

    private fun requestCorePermissions() {
        val wanted = mutableListOf(
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.CALL_PHONE,
            Manifest.permission.READ_CONTACTS
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            wanted.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        val needed = wanted.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (needed.isNotEmpty()) permLauncher.launch(needed.toTypedArray())
    }

    private fun toggleInlineSpeech(app: FoolmoonApp, onFinalRecognized: (String) -> Unit) {
        if (isListeningState.value) {
            stopInlineSpeech()
            return
        }
        val hasMic = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        if (!hasMic) {
            requestCorePermissions()
            return
        }
        app.voicePlayer.stop()
        if (!SpeechRecognizer.isRecognitionAvailable(this)) return

        runCatching { speechRecognizer?.destroy() }
        isListeningState.value = true
        micLevelState.floatValue = 0f

        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {
                    micLevelState.floatValue = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f)
                }
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {
                    isListeningState.value = false
                    micLevelState.floatValue = 0f
                }
                override fun onError(error: Int) {
                    isListeningState.value = false
                    micLevelState.floatValue = 0f
                }
                override fun onResults(results: Bundle?) {
                    isListeningState.value = false
                    micLevelState.floatValue = 0f
                    val best = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty().trim()
                    if (best.isNotEmpty()) {
                        onFinalRecognized(best)
                    }
                }
                override fun onPartialResults(partialResults: Bundle?) {
                    val partial = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                    if (partial.isNotBlank()) voiceDraftState.value = partial
                }
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
        }
        val recIntent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
        }
        runCatching { speechRecognizer?.startListening(recIntent) }
    }

    private fun stopInlineSpeech() {
        isListeningState.value = false
        micLevelState.floatValue = 0f
        runCatching {
            speechRecognizer?.stopListening()
            speechRecognizer?.destroy()
        }
        speechRecognizer = null
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FoolmoonSimplifiedMobileApp(
    app: FoolmoonApp,
    initialHost: String,
    initialPort: String,
    initialCode: String,
    openSettingsSheetByDefault: Boolean,
    isInlineListening: Boolean,
    inlineMicLevel: Float,
    voiceDraft: String,
    onConsumeVoiceDraft: () -> Unit,
    onToggleInlineMic: ((String) -> Unit) -> Unit,
    onSummonOverlay: () -> Unit,
    onOpenAssistantSettings: () -> Unit,
    onOpenAccessibilitySettings: () -> Unit
) {
    val pcStatus by app.bridge.pcStatus.collectAsState()
    val turns by app.bridge.turns.collectAsState()
    val busy by app.bridge.busy.collectAsState()
    val statusLine by app.bridge.statusLine.collectAsState()
    val playback by app.voicePlayer.snapshot.collectAsState()
    val wakeRunning by WakeWordForegroundService.running.collectAsState()

    var input by remember { mutableStateOf("") }
    var attachScreenContext by remember { mutableStateOf(false) }
    var attachedScreenSnippet by remember { mutableStateOf("") }
    var torchOn by remember { mutableStateOf(app.phoneAgent.isTorchOn) }

    var showSettingsSheet by remember { mutableStateOf(openSettingsSheetByDefault) }
    var showCallDialog by remember { mutableStateOf(false) }
    var showCircleSearch by remember { mutableStateOf(false) }
    var capturedBmp by remember { mutableStateOf<Bitmap?>(null) }
    var capturedNodes by remember { mutableStateOf<List<ScreenElementNode>>(emptyList()) }
    var capturedSummary by remember { mutableStateOf("") }

    LaunchedEffect(voiceDraft) {
        if (voiceDraft.isNotBlank()) {
            input = voiceDraft
            onConsumeVoiceDraft()
        }
    }

    val listState = rememberLazyListState()
    LaunchedEffect(turns.size, busy) {
        if (turns.isNotEmpty()) {
            listState.animateScrollToItem((turns.size - 1).coerceAtLeast(0))
        }
    }

    val mood = when {
        playback.speaking -> CompanionMood.SPEAKING
        isInlineListening -> CompanionMood.LISTENING
        busy -> CompanionMood.THINKING
        else -> CompanionMood.IDLE
    }
    val activeAudio = if (playback.speaking) playback.audioLevel else inlineMicLevel
    val auraPhase = rememberGeminiAuraPhase(2800)

    fun launchCircleToSearch() {
        val svc = FoolmoonAccessibilityService.current()
        if (svc != null) {
            svc.captureScreenSnapshot { bmp, nodes ->
                capturedBmp = bmp
                capturedNodes = nodes
                capturedSummary = FoolmoonAccessibilityService.lastCapturedSummary
                showCircleSearch = true
            }
        } else {
            capturedBmp = FoolmoonAccessibilityService.lastCapturedBitmap
            capturedNodes = FoolmoonAccessibilityService.lastCapturedNodes
            capturedSummary = buildString {
                appendLine("Foolmoon Mobile Aktif Ekranı")
                turns.takeLast(3).forEach { appendLine(it.content.take(120)) }
            }.trim()
            showCircleSearch = true
        }
    }

    fun sendUserMessage(text: String) {
        val prompt = text.trim()
        if (prompt.isEmpty()) return
        input = ""
        val snippet = attachedScreenSnippet.takeIf { attachScreenContext }
        app.bridge.sendPrompt(
            prompt = prompt,
            includeScreenContext = attachScreenContext,
            assistContext = snippet
        )
        attachScreenContext = false
        attachedScreenSnippet = ""
    }

    DesktopPaperSurface(
        modifier = Modifier.fillMaxSize(),
        glowIntensity = if (mood != CompanionMood.IDLE) 0.42f else 0.22f
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .statusBarsPadding()
                    .navigationBarsPadding()
                    .imePadding()
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // 1. Desktop-Integrated Floating Jarvis Top Bar
                Surface(
                    shape = RoundedCornerShape(26.dp),
                    color = FoolmoonColors.SurfaceCard.copy(alpha = 0.94f),
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(
                            width = if (mood != CompanionMood.IDLE) 1.4.dp else 1.dp,
                            brush = if (mood != CompanionMood.IDLE) {
                                geminiSweepBrush(auraPhase, alpha = 0.85f)
                            } else {
                                Brush.linearGradient(listOf(FoolmoonColors.Border, FoolmoonColors.Crimson.copy(alpha = 0.35f)))
                            },
                            shape = RoundedCornerShape(26.dp)
                        )
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        BbotCompanionFace(mood = mood, audioLevel = activeAudio, size = 40.dp)

                        Column(modifier = Modifier.weight(1f)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Text(
                                    text = "Foolmoon",
                                    color = FoolmoonColors.Cream,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 15.sp
                                )
                                Box(
                                    modifier = Modifier
                                        .size(7.dp)
                                        .clip(CircleShape)
                                        .background(
                                            when (pcStatus.linkState) {
                                                PcLinkState.CONNECTED -> FoolmoonColors.Emerald
                                                PcLinkState.CONNECTING -> FoolmoonColors.LunarGold
                                                else -> FoolmoonColors.Muted
                                            }
                                        )
                                )
                                Text(
                                    text = if (pcStatus.linkState == PcLinkState.CONNECTED) {
                                        pcStatus.pcName.ifBlank { "PC GPU" }
                                    } else {
                                        "Mobil"
                                    },
                                    color = if (pcStatus.linkState == PcLinkState.CONNECTED) FoolmoonColors.Emerald else FoolmoonColors.Muted,
                                    fontSize = 11.sp
                                )
                            }

                            SyncedLyricsBar(
                                playback = playback,
                                fallbackText = when {
                                    isInlineListening -> "Dinliyorum…"
                                    wakeRunning -> "Hey Foolmoon açık · $statusLine"
                                    else -> statusLine
                                }
                            )
                        }

                        if (playback.speaking) {
                            IconButton(
                                onClick = { app.voicePlayer.stop() },
                                modifier = Modifier.size(34.dp)
                            ) {
                                Icon(Icons.Default.Stop, contentDescription = "Sesi durdur", tint = FoolmoonColors.Crimson)
                            }
                        } else {
                            IconButton(
                                onClick = onSummonOverlay,
                                modifier = Modifier
                                    .size(34.dp)
                                    .clip(CircleShape)
                                    .background(FoolmoonColors.Crimson.copy(alpha = 0.16f))
                            ) {
                                Icon(Icons.Default.Mic, contentDescription = "Sesli Asistan", tint = FoolmoonColors.Crimson, modifier = Modifier.size(18.dp))
                            }
                        }

                        if (turns.isNotEmpty()) {
                            IconButton(
                                onClick = { app.bridge.clearHistory() },
                                modifier = Modifier.size(34.dp)
                            ) {
                                Icon(Icons.Default.AddComment, contentDescription = "Yeni Sohbet", tint = FoolmoonColors.Muted, modifier = Modifier.size(18.dp))
                            }
                        }

                        IconButton(
                            onClick = { showSettingsSheet = true },
                            modifier = Modifier
                                .size(34.dp)
                                .clip(CircleShape)
                                .background(FoolmoonColors.SurfaceElevated)
                        ) {
                            Icon(Icons.Default.Tune, contentDescription = "Ayarlar, Hafıza ve PC", tint = FoolmoonColors.Cream, modifier = Modifier.size(18.dp))
                        }
                    }
                }

                // 2. Clean Conversational Chat Stream (Desktop Bubble Parity)
                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    contentPadding = PaddingValues(vertical = 4.dp)
                ) {
                    if (turns.isEmpty()) {
                        item {
                            GeminiHeroWelcome(
                                pcConnected = pcStatus.linkState == PcLinkState.CONNECTED,
                                accessibilityEnabled = FoolmoonAccessibilityService.isEnabled(),
                                onCircleToSearch = { launchCircleToSearch() },
                                onAskAboutScreen = {
                                    val summary = app.phoneAgent.execute("inspect_screen", JSONObject()).data.optString("screen")
                                    if (summary.isNotBlank()) {
                                        app.bridge.sendPrompt("Ekranımda ne görüyorsun? Özetle ve önemli noktaları söyle.", includeScreenContext = true, assistContext = summary)
                                    } else {
                                        sendUserMessage("Ekranımda ne var?")
                                    }
                                },
                                onCallSomeone = { showCallDialog = true },
                                onToggleFlashlight = {
                                    app.bridge.executeAndRecordLocalAction(
                                        userLabel = if (torchOn) "El fenerini kapat" else "El fenerini aç",
                                        action = "toggle_flashlight",
                                        params = JSONObject().put("on", !torchOn)
                                    )
                                    torchOn = app.phoneAgent.isTorchOn
                                }
                            )
                        }
                    }

                    items(turns, key = { it.id }) { turn ->
                        val isUser = turn.role == "user"
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
                        ) {
                            Surface(
                                shape = RoundedCornerShape(
                                    topStart = 20.dp,
                                    topEnd = 20.dp,
                                    bottomStart = if (isUser) 20.dp else 6.dp,
                                    bottomEnd = if (isUser) 6.dp else 20.dp
                                ),
                                color = if (isUser) {
                                    Color(0xFF281518)
                                } else {
                                    FoolmoonColors.SurfaceCard.copy(alpha = 0.94f)
                                },
                                modifier = Modifier
                                    .widthIn(max = 310.dp)
                                    .border(
                                        width = 1.dp,
                                        color = if (isUser) FoolmoonColors.Crimson.copy(alpha = 0.48f) else FoolmoonColors.Border,
                                        shape = RoundedCornerShape(
                                            topStart = 20.dp,
                                            topEnd = 20.dp,
                                            bottomStart = if (isUser) 20.dp else 6.dp,
                                            bottomEnd = if (isUser) 6.dp else 20.dp
                                        )
                                    )
                            ) {
                                Column(
                                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    if (!isUser) {
                                        Text(
                                            text = "@bbot",
                                            color = FoolmoonColors.Crimson,
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                    Text(
                                        text = turn.content,
                                        color = FoolmoonColors.Cream,
                                        fontSize = 14.sp,
                                        lineHeight = 20.sp
                                    )
                                    if (!isUser && !turn.model.isNullOrBlank()) {
                                        Text(
                                            text = buildString {
                                                append(turn.model)
                                                if (turn.elapsedMs != null) append(" · ${turn.elapsedMs}ms")
                                            },
                                            color = FoolmoonColors.Muted,
                                            fontSize = 10.sp
                                        )
                                    }
                                }
                            }
                        }
                    }

                    if (busy) {
                        item(key = "thinking_shimmer") {
                            GeminiThinkingShimmerBar(
                                label = if (pcStatus.linkState == PcLinkState.CONNECTED) {
                                    "PC GPU üzerinde hesaplanıyor…"
                                } else {
                                    "Foolmoon işliyor…"
                                }
                            )
                        }
                    }
                }

                // 3. Attached Screen Context Preview (when "Ekranı Sor" is toggled on)
                AnimatedVisibility(visible = attachScreenContext) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .background(FoolmoonColors.SurfaceElevated)
                            .border(1.dp, FoolmoonColors.Crimson.copy(alpha = 0.6f), RoundedCornerShape(16.dp))
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(Icons.Default.Visibility, contentDescription = null, tint = FoolmoonColors.Crimson, modifier = Modifier.size(16.dp))
                        Text(
                            text = attachedScreenSnippet.ifBlank { "Aktif ekran içeriği soruya eklenecek" },
                            color = FoolmoonColors.Cream,
                            fontSize = 12.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f)
                        )
                        IconButton(
                            onClick = {
                                attachScreenContext = false
                                attachedScreenSnippet = ""
                            },
                            modifier = Modifier.size(24.dp)
                        ) {
                            Icon(Icons.Default.Close, contentDescription = "Kaldır", tint = FoolmoonColors.Muted, modifier = Modifier.size(14.dp))
                        }
                    }
                }

                // 4. Quick Gemini-Style Action Strip (Circle Search, Screen Ask, Call, Flashlight)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    FilterChip(
                        selected = false,
                        onClick = { launchCircleToSearch() },
                        label = { Text("Seç & Ara", fontSize = 12.sp) },
                        leadingIcon = { Icon(Icons.Default.CropFree, contentDescription = null, modifier = Modifier.size(15.dp), tint = FoolmoonColors.LunarGold) },
                        colors = FilterChipDefaults.filterChipColors(containerColor = FoolmoonColors.SurfaceCard, labelColor = FoolmoonColors.Cream)
                    )
                    FilterChip(
                        selected = attachScreenContext,
                        onClick = {
                            if (attachScreenContext) {
                                attachScreenContext = false
                                attachedScreenSnippet = ""
                            } else {
                                val res = app.phoneAgent.execute("inspect_screen", JSONObject())
                                attachedScreenSnippet = res.data.optString("screen").ifBlank { res.message }
                                attachScreenContext = true
                            }
                        },
                        label = { Text("Ekranı Sor", fontSize = 12.sp) },
                        leadingIcon = { Icon(Icons.Default.Visibility, contentDescription = null, modifier = Modifier.size(15.dp), tint = if (attachScreenContext) FoolmoonColors.Crimson else FoolmoonColors.SkyGlow) },
                        colors = FilterChipDefaults.filterChipColors(
                            containerColor = FoolmoonColors.SurfaceCard,
                            selectedContainerColor = FoolmoonColors.Crimson.copy(alpha = 0.22f),
                            labelColor = FoolmoonColors.Cream
                        )
                    )
                    FilterChip(
                        selected = false,
                        onClick = { showCallDialog = true },
                        label = { Text("Birini Ara", fontSize = 12.sp) },
                        leadingIcon = { Icon(Icons.Default.Call, contentDescription = null, modifier = Modifier.size(15.dp), tint = FoolmoonColors.Emerald) },
                        colors = FilterChipDefaults.filterChipColors(containerColor = FoolmoonColors.SurfaceCard, labelColor = FoolmoonColors.Cream)
                    )
                    FilterChip(
                        selected = torchOn,
                        onClick = {
                            app.bridge.executeAndRecordLocalAction(
                                userLabel = if (torchOn) "El fenerini kapat" else "El fenerini aç",
                                action = "toggle_flashlight",
                                params = JSONObject().put("on", !torchOn)
                            )
                            torchOn = app.phoneAgent.isTorchOn
                        },
                        label = { Text(if (torchOn) "Fener Açık" else "Fener", fontSize = 12.sp) },
                        leadingIcon = {
                            Icon(
                                if (torchOn) Icons.Default.FlashlightOn else Icons.Default.FlashlightOff,
                                contentDescription = null,
                                modifier = Modifier.size(15.dp),
                                tint = if (torchOn) FoolmoonColors.LunarGold else FoolmoonColors.Muted
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(containerColor = FoolmoonColors.SurfaceCard, labelColor = FoolmoonColors.Cream)
                    )
                }

                // 5. Desktop-Style Floating Pill Composer with Animated Gemini Voice Orb
                Surface(
                    shape = RoundedCornerShape(28.dp),
                    color = FoolmoonColors.SurfaceCard.copy(alpha = 0.96f),
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(
                            width = if (isInlineListening || input.isNotBlank() || busy) 1.5.dp else 1.dp,
                            brush = if (isInlineListening || input.isNotBlank() || busy) {
                                geminiSweepBrush(auraPhase, alpha = 0.92f)
                            } else {
                                Brush.linearGradient(listOf(FoolmoonColors.Border, FoolmoonColors.Border))
                            },
                            shape = RoundedCornerShape(28.dp)
                        )
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 10.dp, end = 8.dp, top = 6.dp, bottom = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        OutlinedTextField(
                            value = input,
                            onValueChange = { input = it },
                            placeholder = {
                                Text(
                                    text = if (isInlineListening) "Konuşun, dinliyorum…" else "Foolmoon'a sor, ekranı sor veya birini ara…",
                                    fontSize = 13.sp,
                                    color = FoolmoonColors.Muted,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            },
                            maxLines = 3,
                            modifier = Modifier.weight(1f),
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                            keyboardActions = KeyboardActions(onSend = { sendUserMessage(input) }),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Color.Transparent,
                                unfocusedBorderColor = Color.Transparent,
                                focusedTextColor = FoolmoonColors.Cream,
                                unfocusedTextColor = FoolmoonColors.Cream,
                                focusedContainerColor = Color.Transparent,
                                unfocusedContainerColor = Color.Transparent
                            )
                        )

                        if (input.isNotBlank()) {
                            IconButton(
                                onClick = { sendUserMessage(input) },
                                modifier = Modifier
                                    .size(44.dp)
                                    .clip(CircleShape)
                                    .background(FoolmoonColors.Crimson)
                            ) {
                                Icon(Icons.Default.Send, contentDescription = "Gönder", tint = Color.White, modifier = Modifier.size(19.dp))
                            }
                        } else {
                            GeminiVoiceWaveOrb(
                                isListening = isInlineListening,
                                isSpeaking = playback.speaking,
                                isThinking = busy,
                                audioLevel = activeAudio,
                                size = 44.dp,
                                onClick = {
                                    if (playback.speaking) {
                                        app.voicePlayer.stop()
                                    } else {
                                        onToggleInlineMic { recognized ->
                                            sendUserMessage(recognized)
                                        }
                                    }
                                }
                            )
                        }
                    }
                }
            }

            // Fullscreen Circle-to-Search Overlay
            AnimatedVisibility(
                visible = showCircleSearch,
                enter = fadeIn(),
                exit = fadeOut()
            ) {
                CircleToSearchOverlay(
                    capturedBitmap = capturedBmp,
                    capturedNodes = capturedNodes,
                    fallbackScreenText = capturedSummary,
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

    // Quick Contact / Phone Call Modal Dialog
    if (showCallDialog) {
        var callTarget by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showCallDialog = false },
            containerColor = FoolmoonColors.SurfaceCard,
            titleContentColor = FoolmoonColors.Cream,
            textContentColor = FoolmoonColors.Cream,
            title = { Text("Kimi aramak istersiniz?", fontWeight = FontWeight.Bold, fontSize = 17.sp) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Rehberdeki kişi adını veya telefon numarasını girin:", color = FoolmoonColors.Muted, fontSize = 13.sp)
                    OutlinedTextField(
                        value = callTarget,
                        onValueChange = { callTarget = it },
                        placeholder = { Text("Örn. Ahmet, Annem veya 0532…") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val target = callTarget.trim()
                        showCallDialog = false
                        if (target.isNotEmpty()) {
                            app.bridge.executeAndRecordLocalAction(
                                userLabel = "$target kişisini ara",
                                action = "call_contact",
                                params = JSONObject().put("name", target)
                            )
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = FoolmoonColors.Crimson)
                ) {
                    Icon(Icons.Default.Call, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Ara", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { showCallDialog = false }) {
                    Text("İptal", color = FoolmoonColors.Muted)
                }
            }
        )
    }

    // Compact Unified Control Sheet (PC Link + Memory + Assistant/Accessibility)
    if (showSettingsSheet) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { showSettingsSheet = false },
            sheetState = sheetState,
            containerColor = FoolmoonColors.SurfaceCard,
            contentColor = FoolmoonColors.Cream
        ) {
            UnifiedControlSheetContent(
                app = app,
                initialHost = initialHost,
                initialPort = initialPort,
                initialCode = initialCode,
                onOpenAssistantSettings = onOpenAssistantSettings,
                onOpenAccessibilitySettings = onOpenAccessibilitySettings
            )
        }
    }
}

@Composable
private fun GeminiHeroWelcome(
    pcConnected: Boolean,
    accessibilityEnabled: Boolean,
    onCircleToSearch: () -> Unit,
    onAskAboutScreen: () -> Unit,
    onCallSomeone: () -> Unit,
    onToggleFlashlight: () -> Unit
) {
    val phase = rememberGeminiAuraPhase(3600)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = FoolmoonColors.SurfaceCard.copy(alpha = 0.92f),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.2.dp, geminiSweepBrush(phase, alpha = 0.55f), RoundedCornerShape(24.dp))
        ) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "Merhaba, ben Foolmoon",
                    color = FoolmoonColors.Cream,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = buildString {
                        append(
                            if (pcConnected) "Bilgisayarındaki GPU ve Foolmoon Desktop hafızasıyla bağlısın."
                            else "Masaüstü deneyimi cebinde. Eşleştirdiğinde PC GPU'nu kullanır, çevrimdışıyken telefon görevlerini anında yapar."
                        )
                        if (!accessibilityEnabled) {
                            append("\nİpucu: Ekran okuma ve Ekranda Seç & Ara için Ayarlar düğmesinden Erişilebilirlik iznini açın.")
                        }
                    },
                    color = FoolmoonColors.Muted,
                    fontSize = 13.sp,
                    lineHeight = 19.sp
                )
            }
        }

        // 2x2 Gemini Starter Action Grid
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StarterActionTile(
                title = "Ekranda Seç & Ara",
                subtitle = "Daire içine alıp ara",
                icon = Icons.Default.CropFree,
                accent = FoolmoonColors.LunarGold,
                modifier = Modifier.weight(1f),
                onClick = onCircleToSearch
            )
            StarterActionTile(
                title = "Ekran Hakkında Sor",
                subtitle = "Ekrandakini analiz et",
                icon = Icons.Default.Visibility,
                accent = FoolmoonColors.SkyGlow,
                modifier = Modifier.weight(1f),
                onClick = onAskAboutScreen
            )
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StarterActionTile(
                title = "Birini Ara",
                subtitle = "Rehberden veya numara",
                icon = Icons.Default.Call,
                accent = FoolmoonColors.Emerald,
                modifier = Modifier.weight(1f),
                onClick = onCallSomeone
            )
            StarterActionTile(
                title = "Hızlı Kontrol",
                subtitle = "Fener, alarm, uygulama",
                icon = Icons.Default.FlashlightOn,
                accent = FoolmoonColors.Crimson,
                modifier = Modifier.weight(1f),
                onClick = onToggleFlashlight
            )
        }
    }
}

@Composable
private fun StarterActionTile(
    title: String,
    subtitle: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    accent: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Surface(
        shape = RoundedCornerShape(18.dp),
        color = FoolmoonColors.SurfaceCard.copy(alpha = 0.90f),
        modifier = modifier
            .clip(RoundedCornerShape(18.dp))
            .border(1.dp, FoolmoonColors.Border, RoundedCornerShape(18.dp))
            .clickable(onClick = onClick)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(icon, contentDescription = null, tint = accent, modifier = Modifier.size(20.dp))
            Text(title, color = FoolmoonColors.Cream, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Text(subtitle, color = FoolmoonColors.Muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun UnifiedControlSheetContent(
    app: FoolmoonApp,
    initialHost: String,
    initialPort: String,
    initialCode: String,
    onOpenAssistantSettings: () -> Unit,
    onOpenAccessibilitySettings: () -> Unit
) {
    val ctx = LocalContext.current
    val pcStatus by app.bridge.pcStatus.collectAsState()
    val memories by app.bridge.memories.collectAsState()
    val wakeRunning by WakeWordForegroundService.running.collectAsState()
    val scope = rememberCoroutineScope()

    var section by remember { mutableIntStateOf(0) } // 0: PC & Sistem, 1: Hafıza
    var host by remember { mutableStateOf(initialHost) }
    var port by remember { mutableStateOf(initialPort) }
    var code by remember { mutableStateOf(initialCode) }
    var pairMessage by remember { mutableStateOf("") }
    var pairing by remember { mutableStateOf(false) }

    var wakePhrase by remember { mutableStateOf(app.prefs.wakePhrase) }
    var speakReplies by remember { mutableStateOf(app.prefs.speakReplies) }
    var offloadTts by remember { mutableStateOf(app.prefs.offloadTtsToPc) }
    var newMem by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .navigationBarsPadding(),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            FilterChip(
                selected = section == 0,
                onClick = { section = 0 },
                label = { Text("PC Link & Asistan") },
                leadingIcon = { Icon(Icons.Default.Computer, contentDescription = null, modifier = Modifier.size(16.dp)) },
                modifier = Modifier.weight(1f)
            )
            FilterChip(
                selected = section == 1,
                onClick = { section = 1 },
                label = { Text("Hafıza (${memories.size})") },
                leadingIcon = { Icon(Icons.Default.AutoAwesome, contentDescription = null, modifier = Modifier.size(16.dp)) },
                modifier = Modifier.weight(1f)
            )
        }

        if (section == 0) {
            // System Integration & Wake Word
            Text("Sistem & Sesli Asistan", color = FoolmoonColors.LunarGold, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("\"Hey Foolmoon\" Uyandırma", color = FoolmoonColors.Cream, fontSize = 14.sp)
                    Text(if (wakeRunning) "Arka planda dinliyor" else "Kapalı", color = FoolmoonColors.Muted, fontSize = 11.sp)
                }
                Switch(
                    checked = wakeRunning,
                    onCheckedChange = { on ->
                        app.prefs.wakeWordEnabled = on
                        if (on) WakeWordForegroundService.start(ctx) else WakeWordForegroundService.stop(ctx)
                    }
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = wakePhrase,
                    onValueChange = { wakePhrase = it },
                    label = { Text("Uyandırma kelimesi") },
                    singleLine = true,
                    modifier = Modifier.weight(1f)
                )
                OutlinedButton(onClick = { app.prefs.wakePhrase = wakePhrase }) { Text("Kaydet") }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text("Yanıtları seslendir (TTS)", color = FoolmoonColors.Cream, fontSize = 13.sp)
                Switch(checked = speakReplies, onCheckedChange = { speakReplies = it; app.prefs.speakReplies = it })
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text("Sesi PC CUDA GPU'da üret", color = FoolmoonColors.Cream, fontSize = 13.sp)
                Switch(checked = offloadTts, onCheckedChange = { offloadTts = it; app.prefs.offloadTtsToPc = it })
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onOpenAssistantSettings, modifier = Modifier.weight(1f)) {
                    Text("Varsayılan Asistan", fontSize = 12.sp)
                }
                OutlinedButton(onClick = onOpenAccessibilitySettings, modifier = Modifier.weight(1f)) {
                    Text(
                        if (FoolmoonAccessibilityService.isEnabled()) "Ekran Erişimi ✓" else "Ekran Erişimini Aç",
                        fontSize = 12.sp
                    )
                }
            }

            HorizontalDivider(color = FoolmoonColors.Border)

            // PC Compute Link
            Text(
                text = "PC Bağlantısı (${pcStatus.linkState.name})",
                color = if (pcStatus.linkState == PcLinkState.CONNECTED) FoolmoonColors.Emerald else FoolmoonColors.LunarGold,
                fontWeight = FontWeight.SemiBold,
                fontSize = 13.sp
            )
            OutlinedTextField(
                value = host,
                onValueChange = { host = it },
                label = { Text("PC IP (ör. 192.168.1.42)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = port, onValueChange = { port = it }, label = { Text("Port") }, singleLine = true, modifier = Modifier.weight(1f))
                OutlinedTextField(value = code, onValueChange = { code = it }, label = { Text("6 Haneli Kod") }, singleLine = true, modifier = Modifier.weight(2f))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    enabled = !pairing,
                    onClick = {
                        pairing = true
                        pairMessage = "PC'ye bağlanılıyor…"
                        scope.launch {
                            val res = app.bridge.pairWithPc(host, port.toIntOrNull() ?: 8080, code)
                            pairing = false
                            pairMessage = res.fold(
                                onSuccess = { "$it ile eşleşildi!" },
                                onFailure = { it.message ?: "Eşleşme hatası" }
                            )
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = FoolmoonColors.Crimson),
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Eşleştir & Bağlan", color = Color.White, fontSize = 12.sp)
                }
                if (app.prefs.isPaired) {
                    OutlinedButton(
                        onClick = { if (pcStatus.linkState == PcLinkState.CONNECTED) app.bridge.disconnect() else app.bridge.connectIfPaired() },
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(if (pcStatus.linkState == PcLinkState.CONNECTED) "Kes" else "Yeniden Bağlan", fontSize = 12.sp)
                    }
                }
            }
            if (pairMessage.isNotBlank()) {
                Text(pairMessage, color = FoolmoonColors.LunarGold, fontSize = 12.sp)
            }
        } else {
            // Compact Memory Manager Sheet
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text("Cihaz İçi SQLite Hafıza", color = FoolmoonColors.Cream, fontWeight = FontWeight.SemiBold)
                OutlinedButton(onClick = { app.bridge.syncMemoriesNow() }) {
                    Icon(Icons.Default.Sync, contentDescription = null, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(5.dp))
                    Text("PC Senkron", fontSize = 11.sp)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = newMem,
                    onValueChange = { newMem = it },
                    placeholder = { Text("Yeni bilgi veya favori kaydet…", fontSize = 12.sp) },
                    singleLine = true,
                    modifier = Modifier.weight(1f)
                )
                Button(
                    onClick = {
                        if (newMem.isNotBlank()) {
                            app.memoryStore.remember(newMem.trim(), category = "user_note", pinned = false)
                            newMem = ""
                            app.bridge.refreshLocalMemories()
                            app.bridge.syncMemoriesNow()
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = FoolmoonColors.Crimson)
                ) {
                    Text("Kaydet", color = Color.White)
                }
            }
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(260.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                items(memories, key = { it.id }) { mem ->
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = FoolmoonColors.SurfaceElevated,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(mem.content, color = FoolmoonColors.Cream, fontSize = 13.sp, modifier = Modifier.weight(1f))
                            IconButton(onClick = {
                                app.memoryStore.togglePin(mem.id)
                                app.bridge.refreshLocalMemories()
                            }, modifier = Modifier.size(30.dp)) {
                                Icon(
                                    if (mem.pinned) Icons.Default.Bookmark else Icons.Default.BookmarkBorder,
                                    contentDescription = "Sabitle",
                                    tint = if (mem.pinned) FoolmoonColors.LunarGold else FoolmoonColors.Muted,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                            IconButton(onClick = {
                                app.memoryStore.softDelete(mem.id)
                                app.bridge.refreshLocalMemories()
                                app.bridge.syncMemoriesNow()
                            }, modifier = Modifier.size(30.dp)) {
                                Icon(Icons.Default.Delete, contentDescription = "Sil", tint = FoolmoonColors.Muted, modifier = Modifier.size(16.dp))
                            }
                        }
                    }
                }
            }
        }
        Spacer(modifier = Modifier.height(10.dp))
    }
}
