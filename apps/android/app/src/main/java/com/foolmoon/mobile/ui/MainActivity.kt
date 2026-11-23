package com.foolmoon.mobile.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.foolmoon.mobile.FoolmoonApp
import com.foolmoon.mobile.agent.FoolmoonAccessibilityService
import com.foolmoon.mobile.assistant.AssistantOverlayActivity
import com.foolmoon.mobile.network.PcLinkState
import com.foolmoon.mobile.ui.components.BbotCompanionFace
import com.foolmoon.mobile.ui.components.CompanionMood
import com.foolmoon.mobile.ui.components.SyncedLyricsBar
import com.foolmoon.mobile.ui.theme.FoolmoonColors
import com.foolmoon.mobile.ui.theme.FoolmoonTheme
import com.foolmoon.mobile.wakeword.WakeWordForegroundService
import kotlinx.coroutines.launch
import org.json.JSONObject

class MainActivity : ComponentActivity() {

    private val permLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { _ -> }

    private val deepLinkHost = mutableStateOf("")
    private val deepLinkPort = mutableStateOf("8080")
    private val deepLinkCode = mutableStateOf("")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as FoolmoonApp
        requestCorePermissions()
        parsePairingDeepLink(intent)
        app.bridge.connectIfPaired()

        setContent {
            FoolmoonTheme {
                FoolmoonMainShell(
                    app = app,
                    initialHost = deepLinkHost.value.ifBlank { app.prefs.pcHost },
                    initialPort = deepLinkPort.value.ifBlank { app.prefs.pcPort.toString() },
                    initialCode = deepLinkCode.value,
                    onSummonOverlay = {
                        startActivity(
                            Intent(this, AssistantOverlayActivity::class.java)
                                .putExtra(AssistantOverlayActivity.EXTRA_AUTO_LISTEN, true)
                        )
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
        val needed = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.RECORD_AUDIO)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (needed.isNotEmpty()) permLauncher.launch(needed.toTypedArray())
    }
}

@Composable
private fun FoolmoonMainShell(
    app: FoolmoonApp,
    initialHost: String,
    initialPort: String,
    initialCode: String,
    onSummonOverlay: () -> Unit,
    onOpenAssistantSettings: () -> Unit,
    onOpenAccessibilitySettings: () -> Unit
) {
    var selectedTab by remember { mutableIntStateOf(if (initialCode.length == 6) 3 else 0) }

    Scaffold(
        containerColor = FoolmoonColors.Obsidian,
        bottomBar = {
            NavigationBar(containerColor = FoolmoonColors.SurfaceCard) {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.AutoAwesome, contentDescription = "Assistant") },
                    label = { Text("Assistant", fontSize = 11.sp) }
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.Default.Memory, contentDescription = "Memory") },
                    label = { Text("Memory", fontSize = 11.sp) }
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Icon(Icons.Default.PhoneAndroid, contentDescription = "Agent") },
                    label = { Text("Agent", fontSize = 11.sp) }
                )
                NavigationBarItem(
                    selected = selectedTab == 3,
                    onClick = { selectedTab = 3 },
                    icon = { Icon(Icons.Default.Computer, contentDescription = "PC Link") },
                    label = { Text("PC Link", fontSize = 11.sp) }
                )
            }
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when (selectedTab) {
                0 -> AssistantTab(app = app, onSummonOverlay = onSummonOverlay)
                1 -> MemoryTab(app = app)
                2 -> AgentTab(
                    app = app,
                    onOpenAssistantSettings = onOpenAssistantSettings,
                    onOpenAccessibilitySettings = onOpenAccessibilitySettings,
                    onSummonOverlay = onSummonOverlay
                )
                else -> PcLinkTab(
                    app = app,
                    initialHost = initialHost,
                    initialPort = initialPort,
                    initialCode = initialCode
                )
            }
        }
    }
}

@Composable
private fun AssistantTab(app: FoolmoonApp, onSummonOverlay: () -> Unit) {
    val pcStatus by app.bridge.pcStatus.collectAsState()
    val turns by app.bridge.turns.collectAsState()
    val busy by app.bridge.busy.collectAsState()
    val statusLine by app.bridge.statusLine.collectAsState()
    val playback by app.voicePlayer.snapshot.collectAsState()
    var input by remember { mutableStateOf("") }

    val mood = when {
        playback.speaking -> CompanionMood.SPEAKING
        busy -> CompanionMood.THINKING
        else -> CompanionMood.IDLE
    }

    Column(modifier = Modifier.fillMaxSize().padding(14.dp)) {
        Card(
            colors = CardDefaults.cardColors(containerColor = FoolmoonColors.SurfaceCard),
            shape = RoundedCornerShape(22.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                BbotCompanionFace(mood = mood, audioLevel = playback.audioLevel, size = 50.dp)
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = if (pcStatus.linkState == PcLinkState.CONNECTED) {
                            "PC Compute · ${pcStatus.pcName.ifBlank { "Online" }}"
                        } else {
                            "Foolmoon Mobile · Offline"
                        },
                        color = FoolmoonColors.Cream,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp
                    )
                    SyncedLyricsBar(
                        playback = playback,
                        fallbackText = buildString {
                            if (pcStatus.gpuName.isNotBlank()) append(pcStatus.gpuName).append(" · ")
                            append(statusLine)
                        }
                    )
                }
                if (playback.speaking) {
                    IconButton(onClick = { app.voicePlayer.stop() }) {
                        Icon(Icons.Default.Stop, contentDescription = "Stop voice", tint = FoolmoonColors.Coral)
                    }
                } else {
                    IconButton(
                        onClick = onSummonOverlay,
                        modifier = Modifier
                            .size(40.dp)
                            .clip(CircleShape)
                            .background(FoolmoonColors.Coral)
                    ) {
                        Icon(Icons.Default.Mic, contentDescription = "Voice Assistant", tint = Color.Black)
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(vertical = 4.dp)
        ) {
            if (turns.isEmpty()) {
                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = FoolmoonColors.SurfaceCard),
                        shape = RoundedCornerShape(18.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("Mobile Gemini-Style Assistant powered by your PC", color = FoolmoonColors.LunarGold, fontWeight = FontWeight.SemiBold)
                            Text(
                                "Say 'Hey Foolmoon', hold Power (when set as Default Assistant), or type below. Memories are stored locally in SQLite and synced with your PC.",
                                color = FoolmoonColors.Muted,
                                fontSize = 13.sp
                            )
                        }
                    }
                }
            }
            items(turns, key = { it.id }) { turn ->
                val isUser = turn.role == "user"
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
                ) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(18.dp))
                            .background(if (isUser) FoolmoonColors.Coral.copy(alpha = 0.22f) else FoolmoonColors.SurfaceCard)
                            .padding(horizontal = 14.dp, vertical = 10.dp)
                    ) {
                        Column {
                            Text(turn.content, color = FoolmoonColors.Cream, fontSize = 14.sp)
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
        }

        Spacer(modifier = Modifier.height(8.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                placeholder = { Text("Ask PC GPU or run phone action…", fontSize = 13.sp) },
                singleLine = true,
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(22.dp)
            )
            IconButton(
                onClick = {
                    val prompt = input.trim()
                    if (prompt.isNotEmpty()) {
                        input = ""
                        app.bridge.sendPrompt(prompt)
                    }
                },
                modifier = Modifier
                    .size(46.dp)
                    .clip(CircleShape)
                    .background(FoolmoonColors.Coral)
            ) {
                Icon(Icons.Default.Send, contentDescription = "Send", tint = Color.Black)
            }
        }
    }
}

@Composable
private fun MemoryTab(app: FoolmoonApp) {
    val memories by app.bridge.memories.collectAsState()
    var query by remember { mutableStateOf("") }
    var newMemory by remember { mutableStateOf("") }
    val filtered = remember(memories, query) {
        if (query.isBlank()) memories else app.memoryStore.recall(query, limit = 50)
    }

    Column(modifier = Modifier.fillMaxSize().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text("On-Device Memory", color = FoolmoonColors.Cream, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                Text("${memories.size} SQLite FTS4 memories · Offline ready", color = FoolmoonColors.Muted, fontSize = 12.sp)
            }
            OutlinedButton(onClick = { app.bridge.syncMemoriesNow() }) {
                Icon(Icons.Default.Sync, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text("Sync PC")
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = newMemory,
                onValueChange = { newMemory = it },
                placeholder = { Text("Add a personal fact or preference…", fontSize = 13.sp) },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
            Button(
                onClick = {
                    if (newMemory.isNotBlank()) {
                        app.memoryStore.remember(newMemory.trim(), category = "user_note", pinned = false)
                        newMemory = ""
                        app.bridge.refreshLocalMemories()
                        app.bridge.syncMemoriesNow()
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = FoolmoonColors.Coral)
            ) {
                Text("Save", color = Color.Black)
            }
        }

        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text("Search phone memories (offline FTS4)…", fontSize = 13.sp) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(filtered, key = { it.id }) { mem ->
                Card(
                    colors = CardDefaults.cardColors(containerColor = FoolmoonColors.SurfaceCard),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(mem.content, color = FoolmoonColors.Cream, fontSize = 14.sp)
                            Text(
                                "${mem.category} · ${mem.source}${if (mem.dirty) " · unsynced" else " · synced"}",
                                color = FoolmoonColors.Muted,
                                fontSize = 11.sp
                            )
                        }
                        IconButton(onClick = {
                            app.memoryStore.togglePin(mem.id)
                            app.bridge.refreshLocalMemories()
                        }) {
                            Icon(
                                if (mem.pinned) Icons.Default.Bookmark else Icons.Default.BookmarkBorder,
                                contentDescription = "Pin",
                                tint = if (mem.pinned) FoolmoonColors.LunarGold else FoolmoonColors.Muted
                            )
                        }
                        IconButton(onClick = {
                            app.memoryStore.softDelete(mem.id)
                            app.bridge.refreshLocalMemories()
                            app.bridge.syncMemoriesNow()
                        }) {
                            Icon(Icons.Default.Delete, contentDescription = "Delete", tint = FoolmoonColors.Muted)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AgentTab(
    app: FoolmoonApp,
    onOpenAssistantSettings: () -> Unit,
    onOpenAccessibilitySettings: () -> Unit,
    onSummonOverlay: () -> Unit
) {
    val ctx = LocalContext.current
    val wakeRunning by WakeWordForegroundService.running.collectAsState()
    val lastHeard by WakeWordForegroundService.lastHeard.collectAsState()
    var wakePhrase by remember { mutableStateOf(app.prefs.wakePhrase) }
    var speakReplies by remember { mutableStateOf(app.prefs.speakReplies) }
    var offloadTts by remember { mutableStateOf(app.prefs.offloadTtsToPc) }
    var toolFeedback by remember { mutableStateOf("") }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text("Phone Agent & Assistant", color = FoolmoonColors.Cream, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = FoolmoonColors.SurfaceCard), shape = RoundedCornerShape(18.dp)) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Always-On Wake Word", color = FoolmoonColors.Cream, fontWeight = FontWeight.SemiBold)
                            Text(
                                if (wakeRunning) "Listening for \"$wakePhrase\" · Last: ${lastHeard.take(40)}"
                                else "Hands-free activation via foreground microphone service",
                                color = FoolmoonColors.Muted,
                                fontSize = 12.sp
                            )
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
                            label = { Text("Wake phrase") },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedButton(onClick = { app.prefs.wakePhrase = wakePhrase }) {
                            Text("Apply")
                        }
                    }
                }
            }
        }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = FoolmoonColors.SurfaceCard), shape = RoundedCornerShape(18.dp)) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Gemini-Style System Integration", color = FoolmoonColors.LunarGold, fontWeight = FontWeight.SemiBold)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = onOpenAssistantSettings,
                            colors = ButtonDefaults.buttonColors(containerColor = FoolmoonColors.Coral),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Set Default Assistant", color = Color.Black, fontSize = 12.sp)
                        }
                        OutlinedButton(onClick = onSummonOverlay, modifier = Modifier.weight(1f)) {
                            Text("Test Overlay", fontSize = 12.sp)
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Accessibility Screen Agent", color = FoolmoonColors.Cream, fontWeight = FontWeight.Medium)
                            Text(
                                if (FoolmoonAccessibilityService.isEnabled()) "Active — can read screen & tap UI"
                                else "Disabled — enable for full agentic phone UI control",
                                color = if (FoolmoonAccessibilityService.isEnabled()) FoolmoonColors.Emerald else FoolmoonColors.Muted,
                                fontSize = 12.sp
                            )
                        }
                        OutlinedButton(onClick = onOpenAccessibilitySettings) {
                            Text("Configure")
                        }
                    }
                }
            }
        }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = FoolmoonColors.SurfaceCard), shape = RoundedCornerShape(18.dp)) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                        Text("Speak replies aloud", color = FoolmoonColors.Cream)
                        Switch(checked = speakReplies, onCheckedChange = { speakReplies = it; app.prefs.speakReplies = it })
                    }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                        Text("Synthesize voice on PC CUDA GPU", color = FoolmoonColors.Cream)
                        Switch(checked = offloadTts, onCheckedChange = { offloadTts = it; app.prefs.offloadTtsToPc = it })
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = {
                            val r = app.phoneAgent.execute("get_device_status", JSONObject())
                            toolFeedback = r.message + " · " + r.data.optString("deviceModel")
                        }) {
                            Text("Test Telemetry")
                        }
                        OutlinedButton(onClick = {
                            val r = app.phoneAgent.execute("set_timer", JSONObject().put("seconds", 10).put("label", "Foolmoon Test"))
                            toolFeedback = r.message
                        }) {
                            Text("Test 10s Timer")
                        }
                    }
                    if (toolFeedback.isNotBlank()) {
                        Text(toolFeedback, color = FoolmoonColors.Emerald, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun PcLinkTab(
    app: FoolmoonApp,
    initialHost: String,
    initialPort: String,
    initialCode: String
) {
    val pcStatus by app.bridge.pcStatus.collectAsState()
    val scope = rememberCoroutineScope()
    var host by remember { mutableStateOf(initialHost) }
    var port by remember { mutableStateOf(initialPort) }
    var code by remember { mutableStateOf(initialCode) }
    var pairMessage by remember { mutableStateOf("") }
    var pairing by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize().padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("PC Compute Link", color = FoolmoonColors.Cream, fontSize = 18.sp, fontWeight = FontWeight.Bold)

        Card(colors = CardDefaults.cardColors(containerColor = FoolmoonColors.SurfaceCard), shape = RoundedCornerShape(18.dp)) {
            Column(modifier = Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = "Status: ${pcStatus.linkState.name}",
                    color = if (pcStatus.linkState == PcLinkState.CONNECTED) FoolmoonColors.Emerald else FoolmoonColors.LunarGold,
                    fontWeight = FontWeight.SemiBold
                )
                if (pcStatus.pcName.isNotBlank()) Text("PC Host: ${pcStatus.pcName}", color = FoolmoonColors.Cream, fontSize = 13.sp)
                if (pcStatus.gpuName.isNotBlank()) Text("PC GPU: ${pcStatus.gpuName}", color = FoolmoonColors.Muted, fontSize = 12.sp)
                if (pcStatus.activeModel.isNotBlank()) Text("LLM Model: ${pcStatus.activeModel}", color = FoolmoonColors.Muted, fontSize = 12.sp)
                if (pcStatus.activeTts.isNotBlank()) Text("Voice Engine: ${pcStatus.activeTts}", color = FoolmoonColors.Muted, fontSize = 12.sp)
                if (!pcStatus.lastError.isNullOrBlank()) Text("Note: ${pcStatus.lastError}", color = FoolmoonColors.Coral, fontSize = 12.sp)
            }
        }

        OutlinedTextField(
            value = host,
            onValueChange = { host = it },
            label = { Text("PC LAN / Tailscale IP (e.g. 192.168.1.42)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = port,
                onValueChange = { port = it },
                label = { Text("Port") },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
            OutlinedTextField(
                value = code,
                onValueChange = { code = it },
                label = { Text("6-Digit Pairing Code") },
                singleLine = true,
                modifier = Modifier.weight(2f)
            )
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                enabled = !pairing,
                onClick = {
                    pairing = true
                    pairMessage = "Pairing with PC…"
                    scope.launch {
                        val res = app.bridge.pairWithPc(host, port.toIntOrNull() ?: 8080, code)
                        pairing = false
                        pairMessage = res.fold(
                            onSuccess = { name -> "Paired & connected to $name!" },
                            onFailure = { err -> err.message ?: "Pairing failed" }
                        )
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = FoolmoonColors.Coral),
                modifier = Modifier.weight(1f)
            ) {
                Text("Pair & Connect", color = Color.Black)
            }
            if (app.prefs.isPaired) {
                OutlinedButton(
                    onClick = {
                        if (pcStatus.linkState == PcLinkState.CONNECTED) app.bridge.disconnect() else app.bridge.connectIfPaired()
                    },
                    modifier = Modifier.weight(1f)
                ) {
                    Text(if (pcStatus.linkState == PcLinkState.CONNECTED) "Disconnect" else "Reconnect")
                }
            }
        }

        if (pairMessage.isNotBlank()) {
            Text(pairMessage, color = FoolmoonColors.LunarGold, fontSize = 13.sp)
        }
    }
}
