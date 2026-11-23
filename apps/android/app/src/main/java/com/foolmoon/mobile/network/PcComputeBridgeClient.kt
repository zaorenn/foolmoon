package com.foolmoon.mobile.network

import com.foolmoon.mobile.agent.PhoneAgentExecutor
import com.foolmoon.mobile.audio.SyncedVoicePlayer
import com.foolmoon.mobile.data.FoolmoonPrefs
import com.foolmoon.mobile.memory.ChatTurn
import com.foolmoon.mobile.memory.FoolmoonMemoryStore
import com.foolmoon.mobile.memory.MemoryEntry
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

enum class PcLinkState { UNPAIRED, CONNECTING, CONNECTED, OFFLINE }

enum class MobileBotMode { MOBILE_BOT, DESKTOP_CONTINUITY }

data class PcLinkStatus(
    val linkState: PcLinkState = PcLinkState.UNPAIRED,
    val pcName: String = "",
    val gpuName: String = "",
    val activeModel: String = "",
    val activeTts: String = "",
    val lastLatencyMs: Int = 0,
    val lastError: String? = null
)

data class DesktopSessionSummary(
    val id: String,
    val title: String,
    val source: String,
    val model: String,
    val lastActive: Double,
    val messageCount: Int,
    val preview: String
)

data class PcScreenSnapshot(
    val screenshotBase64: String,
    val mimeType: String,
    val activeWindow: String,
    val nowPlaying: String,
    val statusMessage: String = "",
    val timestampMs: Long = System.currentTimeMillis()
)

class PcComputeBridgeClient(
    private val prefs: FoolmoonPrefs,
    private val memoryStore: FoolmoonMemoryStore,
    private val phoneAgent: PhoneAgentExecutor,
    private val voicePlayer: SyncedVoicePlayer
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(180, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .build()

    private val pairingApi = PcPairingApi(http, prefs, phoneAgent)

    private val _pcStatus = MutableStateFlow(
        PcLinkStatus(
            linkState = if (prefs.isPaired) PcLinkState.OFFLINE else PcLinkState.UNPAIRED,
            pcName = prefs.pcName
        )
    )
    val pcStatus: StateFlow<PcLinkStatus> = _pcStatus.asStateFlow()

    private val _botMode = MutableStateFlow(MobileBotMode.MOBILE_BOT)
    val botMode: StateFlow<MobileBotMode> = _botMode.asStateFlow()

    private val _turns = MutableStateFlow<List<ChatTurn>>(memoryStore.recentTurns(50))
    val turns: StateFlow<List<ChatTurn>> = _turns.asStateFlow()

    private val _desktopTurns = MutableStateFlow<List<ChatTurn>>(emptyList())
    val desktopTurns: StateFlow<List<ChatTurn>> = _desktopTurns.asStateFlow()

    private val _desktopSessions = MutableStateFlow<List<DesktopSessionSummary>>(emptyList())
    val desktopSessions: StateFlow<List<DesktopSessionSummary>> = _desktopSessions.asStateFlow()

    private val _activeDesktopSessionId = MutableStateFlow<String?>(null)
    val activeDesktopSessionId: StateFlow<String?> = _activeDesktopSessionId.asStateFlow()

    private val _activeDesktopSessionTitle = MutableStateFlow("Yeni PC Görevi / Ödev")
    val activeDesktopSessionTitle: StateFlow<String> = _activeDesktopSessionTitle.asStateFlow()

    private val _desktopProgressText = MutableStateFlow("")
    val desktopProgressText: StateFlow<String> = _desktopProgressText.asStateFlow()

    private val _pcScreenSnapshot = MutableStateFlow<PcScreenSnapshot?>(null)
    val pcScreenSnapshot: StateFlow<PcScreenSnapshot?> = _pcScreenSnapshot.asStateFlow()

    private val _activeVoiceId = MutableStateFlow("")
    val activeVoiceId: StateFlow<String> = _activeVoiceId.asStateFlow()

    private val _activeVoiceName = MutableStateFlow("")
    val activeVoiceName: StateFlow<String> = _activeVoiceName.asStateFlow()

    private val _availableVoices = MutableStateFlow<List<PcVoiceCloneItem>>(emptyList())
    val availableVoices: StateFlow<List<PcVoiceCloneItem>> = _availableVoices.asStateFlow()

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    private val _statusLine = MutableStateFlow("Hazır")
    val statusLine: StateFlow<String> = _statusLine.asStateFlow()

    private val _memories = MutableStateFlow<List<MemoryEntry>>(memoryStore.listActive(150))
    val memories: StateFlow<List<MemoryEntry>> = _memories.asStateFlow()

    @Volatile
    private var liveSocket: WebSocket? = null
    private var reconnectJob: Job? = null
    private var telemetryJob: Job? = null

    fun refreshLocalMemories() {
        _memories.value = memoryStore.listActive(150)
    }

    fun clearHistory() {
        if (_botMode.value == MobileBotMode.DESKTOP_CONTINUITY) {
            startNewDesktopTask()
            return
        }
        memoryStore.clearChatHistory()
        _turns.value = emptyList()
    }

    fun setBotMode(mode: MobileBotMode) {
        if (_botMode.value == mode) return
        _botMode.value = mode
        if (mode == MobileBotMode.DESKTOP_CONTINUITY && _pcStatus.value.linkState == PcLinkState.CONNECTED) {
            refreshDesktopSessions()
            requestPcScreenSnapshot()
        }
    }

    fun startNewDesktopTask(titleHint: String? = null) {
        _activeDesktopSessionId.value = null
        _activeDesktopSessionTitle.value = titleHint?.takeIf { it.isNotBlank() } ?: "Yeni PC Görevi / Ödev"
        _desktopTurns.value = emptyList()
        _desktopProgressText.value = ""
    }

    fun executeAndRecordLocalAction(userLabel: String, action: String, params: JSONObject = JSONObject()) {
        val label = userLabel.trim()
        if (label.isNotEmpty()) {
            memoryStore.saveTurn(ChatTurn(role = "user", content = label))
        }
        val res = phoneAgent.execute(action, params)
        refreshLocalMemories()
        val icon = if (res.ok) "⚡" else "⚠️"
        memoryStore.saveTurn(ChatTurn(role = "assistant", content = "$icon ${res.message}", model = "on-device"))
        _turns.value = memoryStore.recentTurns(50)
    }

    fun connectIfPaired() {
        val st = _pcStatus.value.linkState
        if (st == PcLinkState.CONNECTED || st == PcLinkState.CONNECTING) return
        if (prefs.isPaired) {
            openSocket()
        } else {
            autoConnectToPc()
        }
    }

    fun autoConnectToPc(onDone: ((Boolean, String) -> Unit)? = null) {
        scope.launch {
            _pcStatus.value = _pcStatus.value.copy(linkState = PcLinkState.CONNECTING, lastError = null)
            _statusLine.value = "PC aranıyor…"
            val candidates = buildList {
                if (prefs.pcHost.isNotBlank()) add(prefs.pcHost to prefs.pcPort)
                add("127.0.0.1" to 8765)
                add("10.0.2.2" to 8765)
            }.distinct()

            for ((host, port) in candidates) {
                val res = pairingApi.autoPairLocalCompanion(host, port)
                if (res.isSuccess) {
                    val snap = res.getOrThrow()
                    applyHostSnapshot(snap)
                    openSocket()
                    onDone?.invoke(true, "${snap.pcName.ifBlank { "PC" }} bağlandı")
                    return@launch
                }
            }
            if (prefs.isPaired) {
                openSocket()
            } else {
                _pcStatus.value = PcLinkStatus(linkState = PcLinkState.UNPAIRED, lastError = "Yerel PC köprüsü bulunamadı")
                _statusLine.value = "Çevrimdışı"
            }
            onDone?.invoke(false, "PC bulunamadı (Ayarlardan eşleştirin)")
        }
    }

    fun disconnect() {
        reconnectJob?.cancel()
        telemetryJob?.cancel()
        liveSocket?.close(1000, "User disconnected")
        liveSocket = null
        _pcStatus.value = _pcStatus.value.copy(
            linkState = if (prefs.isPaired) PcLinkState.OFFLINE else PcLinkState.UNPAIRED
        )
    }

    suspend fun pairWithPc(host: String, port: Int, code: String): Result<String> {
        val res = pairingApi.pair(host, port, code)
        if (res.isSuccess) {
            openSocket()
            refreshPcInfo()
        }
        return res
    }

    fun refreshPcInfo() {
        scope.launch {
            val snap = pairingApi.fetchStatus() ?: return@launch
            applyHostSnapshot(snap)
        }
    }

    private fun applyHostSnapshot(snap: PcHostSnapshot) {
        _pcStatus.value = _pcStatus.value.copy(
            pcName = snap.pcName.ifBlank { _pcStatus.value.pcName },
            gpuName = snap.gpuName.ifBlank { _pcStatus.value.gpuName },
            activeModel = snap.activeModel.ifBlank { _pcStatus.value.activeModel },
            activeTts = snap.activeTts.ifBlank { _pcStatus.value.activeTts }
        )
        if (snap.activeVoiceId.isNotBlank()) _activeVoiceId.value = snap.activeVoiceId
        if (snap.activeVoiceName.isNotBlank()) _activeVoiceName.value = snap.activeVoiceName
        if (snap.voices.isNotEmpty()) _availableVoices.value = snap.voices
    }

    fun selectPcVoice(voiceId: String, testSpeak: Boolean = false) {
        val ws = liveSocket ?: return
        if (_pcStatus.value.linkState != PcLinkState.CONNECTED) return
        ws.send(
            JSONObject()
                .put("type", "voice.select")
                .put("voiceId", voiceId)
                .toString()
        )
        if (testSpeak) {
            ws.send(
                JSONObject()
                    .put("type", "voice.speak")
                    .put("reqId", UUID.randomUUID().toString().take(8))
                    .put("voiceId", voiceId)
                    .put("text", "Selam. Artık bilgisayarındaki klonlanmış sesle mobilde yanındayım.")
                    .toString()
            )
        }
    }

    fun refreshDesktopSessions() {
        val ws = liveSocket ?: return
        if (_pcStatus.value.linkState != PcLinkState.CONNECTED) return
        ws.send(JSONObject().put("type", "desktop.sessions.list").put("limit", 25).toString())
    }

    fun loadDesktopSession(sessionId: String) {
        val ws = liveSocket ?: return
        if (_pcStatus.value.linkState != PcLinkState.CONNECTED) return
        _activeDesktopSessionId.value = sessionId
        _desktopProgressText.value = "Masaüstü sohbeti yükleniyor…"
        ws.send(
            JSONObject()
                .put("type", "desktop.session.get")
                .put("sessionId", sessionId)
                .put("limit", 60)
                .toString()
        )
    }

    fun requestPcScreenSnapshot() {
        sendPcControl("screen")
    }

    fun sendPcControl(action: String, params: Map<String, Any?> = emptyMap()) {
        val ws = liveSocket ?: return
        if (_pcStatus.value.linkState != PcLinkState.CONNECTED) return
        val pObj = JSONObject()
        params.forEach { (k, v) -> if (v != null) pObj.put(k, v) }
        ws.send(
            JSONObject()
                .put("type", "desktop.control")
                .put("reqId", UUID.randomUUID().toString().take(8))
                .put("action", action)
                .put("params", pObj)
                .toString()
        )
    }

    fun sendPrompt(prompt: String, includeScreenContext: Boolean = false, assistContext: String? = null) {
        val text = prompt.trim()
        if (text.isEmpty()) return

        if (_botMode.value == MobileBotMode.DESKTOP_CONTINUITY) {
            sendDesktopPrompt(text)
            return
        }

        memoryStore.saveTurn(ChatTurn(role = "user", content = text))
        _turns.value = memoryStore.recentTurns(50)

        val ws = liveSocket
        if (ws != null && _pcStatus.value.linkState == PcLinkState.CONNECTED) {
            _busy.value = true
            _statusLine.value = "PC GPU hesaplıyor…"
            scope.launch {
                val mems = memoryStore.recall(text, 8).map { "[${it.category}] ${it.content}" }
                val hist = JSONArray()
                _turns.value.takeLast(10).dropLast(1).forEach { t ->
                    if (t.role == "user" || t.role == "assistant") {
                        hist.put(JSONObject().put("role", t.role).put("content", t.content))
                    }
                }
                val screenText = buildString {
                    if (!assistContext.isNullOrBlank()) append(assistContext).append('\n')
                    if (includeScreenContext) {
                        val s = phoneAgent.execute("inspect_screen", JSONObject()).data.optString("screen")
                        if (s.isNotBlank()) append(s)
                    }
                }.trim()

                val frame = JSONObject()
                    .put("type", "chat.send")
                    .put("reqId", UUID.randomUUID().toString().take(10))
                    .put("prompt", text)
                    .put("history", hist)
                    .put("phoneMemories", JSONArray(mems))
                    .put("speak", prefs.speakReplies && prefs.offloadTtsToPc)
                    .apply {
                        if (_activeVoiceId.value.isNotBlank()) put("voiceId", _activeVoiceId.value)
                        if (screenText.isNotEmpty()) put("screenContext", screenText)
                    }
                ws.send(frame.toString())
            }
            return
        }

        // Offline graceful mode: local phone tools + SQLite memory recall
        scope.launch {
            _busy.value = true
            _statusLine.value = "Cihaz içi ajan…"
            val quick = phoneAgent.tryOfflineQuickAction(text)
            val reply = if (quick != null) {
                refreshLocalMemories()
                quick.message
            } else {
                val hits = memoryStore.recall(text, 4)
                if (hits.isNotEmpty()) {
                    "PC çevrimdışı — telefon hafızasından:\n" + hits.joinToString("\n") { "• ${it.content}" }
                } else {
                    "PC bağlantısı yok. Yukarıdaki 'Bağla' düğmesiyle PC'ye bağlanabilir veya çevrimdışı telefon komutlarını ('Feneri aç', '5 dk alarm kur', 'Spotify aç') kullanabilirsin."
                }
            }
            memoryStore.saveTurn(ChatTurn(role = "assistant", content = reply, model = "on-device"))
            _turns.value = memoryStore.recentTurns(50)
            _busy.value = false
            _statusLine.value = "Çevrimdışı"
            if (prefs.speakReplies) voicePlayer.speakOnDevice(reply)
        }
    }

    private fun sendDesktopPrompt(text: String) {
        val ws = liveSocket
        val userTurn = ChatTurn(role = "user", content = text)
        _desktopTurns.value = _desktopTurns.value + userTurn

        if (ws == null || _pcStatus.value.linkState != PcLinkState.CONNECTED) {
            _desktopTurns.value = _desktopTurns.value + ChatTurn(
                role = "assistant",
                content = "⚠️ Masaüstü oturumlarına devam etmek ve PC'ye ödev/görev göndermek için önce bilgisayara bağlanın.",
                model = "offline"
            )
            return
        }

        _busy.value = true
        _desktopProgressText.value = "🖥️ PC Masaüstü Ajanı görevi devraldı…"
        _statusLine.value = "PC Masaüstü çalışıyor…"
        ws.send(
            JSONObject()
                .put("type", "desktop.chat.send")
                .put("reqId", UUID.randomUUID().toString().take(10))
                .put("prompt", text)
                .put("speak", prefs.speakReplies && prefs.offloadTtsToPc)
                .apply {
                    _activeDesktopSessionId.value?.let { put("sessionId", it) }
                    if (_activeVoiceId.value.isNotBlank()) put("voiceId", _activeVoiceId.value)
                }
                .toString()
        )
    }

    fun syncMemoriesNow() {
        val ws = liveSocket ?: return
        if (_pcStatus.value.linkState != PcLinkState.CONNECTED) return
        val dirty = memoryStore.pendingDirtyEntries()
        val arr = JSONArray().apply { dirty.forEach { put(it.toSyncJson()) } }
        ws.send(
            JSONObject()
                .put("type", "memory.sync")
                .put("sinceMs", prefs.lastMemorySyncMs)
                .put("entries", arr)
                .toString()
        )
    }

    private fun openSocket() {
        reconnectJob?.cancel()
        liveSocket?.cancel()
        _pcStatus.value = _pcStatus.value.copy(linkState = PcLinkState.CONNECTING, lastError = null)

        val req = Request.Builder()
            .url(prefs.wsBridgeUrl())
            .header("Authorization", "Bearer ${prefs.mobileToken}")
            .build()

        liveSocket = http.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                _pcStatus.value = _pcStatus.value.copy(linkState = PcLinkState.CONNECTED, lastError = null)
                _statusLine.value = "PC Bağlı"
                pushTelemetry(webSocket)
                syncMemoriesNow()
                refreshPcInfo()
                refreshDesktopSessions()
                telemetryJob?.cancel()
                telemetryJob = scope.launch {
                    while (liveSocket === webSocket) {
                        delay(45_000L)
                        pushTelemetry(webSocket)
                    }
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                scope.launch { handleFrame(webSocket, text) }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                handleDrop(reason)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                handleDrop(t.message ?: "Connection lost")
            }
        })
    }

    private fun handleDrop(reason: String) {
        telemetryJob?.cancel()
        liveSocket = null
        _busy.value = false
        _desktopProgressText.value = ""
        _pcStatus.value = _pcStatus.value.copy(
            linkState = if (prefs.isPaired) PcLinkState.OFFLINE else PcLinkState.UNPAIRED,
            lastError = reason
        )
        _statusLine.value = "Çevrimdışı"
        if (prefs.isPaired) {
            reconnectJob?.cancel()
            reconnectJob = scope.launch {
                delay(5_000L)
                if (prefs.isPaired && liveSocket == null) openSocket()
            }
        }
    }

    private fun pushTelemetry(ws: WebSocket) {
        ws.send(
            JSONObject()
                .put("type", "telemetry")
                .put("data", phoneAgent.collectTelemetry())
                .put("capabilities", JSONArray(phoneAgent.availableCapabilities()))
                .toString()
        )
    }

    private fun parseVoicesArray(arr: JSONArray?): List<PcVoiceCloneItem> = buildList {
        if (arr == null) return@buildList
        for (i in 0 until arr.length()) {
            val item = arr.optJSONObject(i) ?: continue
            val id = item.optString("id")
            val name = item.optString("name")
            if (id.isNotBlank() && name.isNotBlank()) {
                add(PcVoiceCloneItem(id = id, name = name, engine = item.optString("engine", "chatterbox_turbo")))
            }
        }
    }

    private fun handleFrame(ws: WebSocket, raw: String) {
        val msg = runCatching { JSONObject(raw) }.getOrNull() ?: return
        when (msg.optString("type")) {
            "bridge.ready" -> {
                val n = msg.optString("pcName")
                if (n.isNotBlank()) {
                    prefs.pcName = n
                    _pcStatus.value = _pcStatus.value.copy(pcName = n)
                }
                val activeModel = msg.optString("activeModel")
                val ttsProv = msg.optString("activeTtsProvider")
                val gpu = msg.optString("gpuName")
                _pcStatus.value = _pcStatus.value.copy(
                    activeModel = activeModel.ifBlank { _pcStatus.value.activeModel },
                    activeTts = ttsProv.ifBlank { _pcStatus.value.activeTts },
                    gpuName = gpu.ifBlank { _pcStatus.value.gpuName }
                )
                val vId = msg.optString("activeVoiceId")
                val vName = msg.optString("activeVoiceName")
                if (vId.isNotBlank()) _activeVoiceId.value = vId
                if (vName.isNotBlank()) _activeVoiceName.value = vName
                val voices = parseVoicesArray(msg.optJSONArray("voices"))
                if (voices.isNotEmpty()) _availableVoices.value = voices
                refreshDesktopSessions()
            }
            "voice.updated" -> {
                val vId = msg.optString("activeVoiceId")
                val vName = msg.optString("activeVoiceName")
                if (vId.isNotBlank()) _activeVoiceId.value = vId
                if (vName.isNotBlank()) _activeVoiceName.value = vName
                val voices = parseVoicesArray(msg.optJSONArray("voices"))
                if (voices.isNotEmpty()) _availableVoices.value = voices
                _statusLine.value = "Ses: ${vName.take(28)}"
            }
            "desktop.sessions" -> {
                val arr = msg.optJSONArray("sessions") ?: JSONArray()
                val parsed = buildList {
                    for (i in 0 until arr.length()) {
                        val s = arr.optJSONObject(i) ?: continue
                        val id = s.optString("id")
                        if (id.isNotBlank()) {
                            add(
                                DesktopSessionSummary(
                                    id = id,
                                    title = s.optString("title", id),
                                    source = s.optString("source", "desktop"),
                                    model = s.optString("model", ""),
                                    lastActive = s.optDouble("lastActive", 0.0),
                                    messageCount = s.optInt("messageCount", 0),
                                    preview = s.optString("preview", "")
                                )
                            )
                        }
                    }
                }
                _desktopSessions.value = parsed
            }
            "desktop.session.detail" -> {
                _desktopProgressText.value = ""
                if (!msg.optBoolean("ok", true)) return
                val sid = msg.optString("sessionId")
                val title = msg.optString("title", sid)
                if (sid.isNotBlank()) {
                    _activeDesktopSessionId.value = sid
                    _activeDesktopSessionTitle.value = title
                }
                val arr = msg.optJSONArray("messages") ?: JSONArray()
                val loaded = buildList {
                    for (i in 0 until arr.length()) {
                        val m = arr.optJSONObject(i) ?: continue
                        val role = m.optString("role")
                        val content = m.optString("content").trim()
                        if ((role == "user" || role == "assistant") && content.isNotEmpty()) {
                            add(
                                ChatTurn(
                                    id = "dt_${sid}_$i",
                                    role = role,
                                    content = content,
                                    model = m.optString("model").takeIf { it.isNotBlank() }
                                )
                            )
                        }
                    }
                }
                _desktopTurns.value = loaded
            }
            "desktop.control.result" -> {
                val act = msg.optString("action")
                val message = msg.optString("message").trim()
                if (act == "screen") {
                    _pcScreenSnapshot.value = PcScreenSnapshot(
                        screenshotBase64 = msg.optString("screenshotBase64"),
                        mimeType = msg.optString("mimeType", "image/jpeg"),
                        activeWindow = msg.optString("activeWindow"),
                        nowPlaying = msg.optString("nowPlaying"),
                        statusMessage = message,
                        timestampMs = System.currentTimeMillis()
                    )
                }
                if (message.isNotBlank()) {
                    _statusLine.value = message.take(40)
                }
            }
            "chat.thinking" -> {
                _busy.value = true
                val mode = msg.optString("mode", "mobile")
                _statusLine.value = if (mode == "desktop") "PC Masaüstü düşünüyor…" else "PC GPU düşünüyor…"
            }
            "chat.progress" -> {
                val st = msg.optString("status").trim()
                if (st.isNotEmpty()) {
                    _desktopProgressText.value = st
                    _statusLine.value = st.take(42)
                }
            }
            "chat.done" -> {
                val mode = msg.optString("mode", "mobile")
                val reply = msg.optString("reply").trim()
                val model = msg.optString("model")
                val ms = msg.optInt("elapsedMs", 0)
                _pcStatus.value = _pcStatus.value.copy(
                    activeModel = model.ifBlank { _pcStatus.value.activeModel },
                    lastLatencyMs = ms
                )

                if (mode == "desktop") {
                    val sid = msg.optString("sessionId")
                    val sTitle = msg.optString("sessionTitle")
                    if (sid.isNotBlank()) _activeDesktopSessionId.value = sid
                    if (sTitle.isNotBlank()) _activeDesktopSessionTitle.value = sTitle
                    if (reply.isNotEmpty()) {
                        _desktopTurns.value = _desktopTurns.value + ChatTurn(
                            role = "assistant",
                            content = reply,
                            model = "pc-desktop · ${model.ifBlank { "hermes" }}",
                            elapsedMs = ms.takeIf { it > 0 }
                        )
                    }
                    _desktopProgressText.value = ""
                    if (prefs.speakReplies && !prefs.offloadTtsToPc && reply.isNotEmpty()) {
                        voicePlayer.speakOnDevice(reply)
                    }
                    _busy.value = false
                    _statusLine.value = "PC Masaüstü · ${ms}ms"
                    return
                }

                var suffix = ""
                val actObj = msg.optJSONObject("phoneAction")
                if (actObj != null) {
                    val actName = actObj.optString("action")
                    if (actName.isNotBlank()) {
                        val r = phoneAgent.execute(actName, actObj.optJSONObject("params") ?: JSONObject())
                        refreshLocalMemories()
                        suffix = "\n\n⚡ ${r.message}"
                    }
                }
                if (reply.isNotEmpty() || suffix.isNotEmpty()) {
                    memoryStore.saveTurn(
                        ChatTurn(
                            role = "assistant",
                            content = (reply + suffix).trim(),
                            model = model.ifBlank { null },
                            elapsedMs = ms.takeIf { it > 0 }
                        )
                    )
                    _turns.value = memoryStore.recentTurns(50)
                }
                if (prefs.speakReplies && !prefs.offloadTtsToPc && reply.isNotEmpty()) {
                    voicePlayer.speakOnDevice(reply)
                }
                _busy.value = false
                _statusLine.value = "PC · ${ms}ms"
            }
            "chat.error" -> {
                val err = msg.optString("error", "PC error")
                if (_botMode.value == MobileBotMode.DESKTOP_CONTINUITY) {
                    _desktopTurns.value = _desktopTurns.value + ChatTurn(role = "assistant", content = "⚠️ $err", model = "error")
                    _desktopProgressText.value = ""
                } else {
                    memoryStore.saveTurn(ChatTurn(role = "assistant", content = "⚠️ $err", model = "error"))
                    _turns.value = memoryStore.recentTurns(50)
                }
                _busy.value = false
                _statusLine.value = "Hata"
            }
            "tts.audio" -> {
                val b64 = msg.optString("audioBase64")
                val vName = msg.optString("voiceName")
                if (vName.isNotBlank()) _activeVoiceName.value = vName
                if (b64.isNotBlank()) {
                    voicePlayer.playBase64Wav(
                        base64Audio = b64,
                        rawSentence = msg.optString("sentence"),
                        timingsJson = msg.optJSONArray("wordTimings"),
                        provider = vName.ifBlank { msg.optString("provider", "pc-cuda") }
                    )
                }
            }
            "device.tool_call" -> {
                val callId = msg.optString("callId")
                val action = msg.optString("action")
                val params = msg.optJSONObject("params") ?: JSONObject()
                _statusLine.value = "Telefon aracı: $action"
                val res = phoneAgent.execute(action, params)
                refreshLocalMemories()
                ws.send(
                    JSONObject()
                        .put("type", "device.tool_result")
                        .put("callId", callId)
                        .put("ok", res.ok)
                        .put("result", res.toWireJson())
                        .apply { if (!res.ok) put("error", res.message) }
                        .toString()
                )
                _statusLine.value = "Hazır"
            }
            "memory.synced" -> {
                val arr = msg.optJSONArray("entries") ?: JSONArray()
                val entries = mutableListOf<MemoryEntry>()
                for (i in 0 until arr.length()) {
                    arr.optJSONObject(i)?.let { entries.add(MemoryEntry.fromServerJson(it)) }
                }
                memoryStore.markSyncedAndMergeServer(entries)
                prefs.lastMemorySyncMs = msg.optLong("serverTimeMs", System.currentTimeMillis())
                refreshLocalMemories()
            }
        }
    }
}