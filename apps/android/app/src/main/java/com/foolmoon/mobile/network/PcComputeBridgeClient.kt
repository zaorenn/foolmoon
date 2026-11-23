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

data class PcLinkStatus(
    val linkState: PcLinkState = PcLinkState.UNPAIRED,
    val pcName: String = "",
    val gpuName: String = "",
    val activeModel: String = "",
    val activeTts: String = "",
    val lastLatencyMs: Int = 0,
    val lastError: String? = null
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
        .readTimeout(120, TimeUnit.SECONDS)
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

    private val _turns = MutableStateFlow<List<ChatTurn>>(memoryStore.recentTurns(50))
    val turns: StateFlow<List<ChatTurn>> = _turns.asStateFlow()

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    private val _statusLine = MutableStateFlow("Ready")
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
        memoryStore.clearChatHistory()
        _turns.value = emptyList()
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
        if (!prefs.isPaired) {
            _pcStatus.value = PcLinkStatus(linkState = PcLinkState.UNPAIRED)
            return
        }
        val st = _pcStatus.value.linkState
        if (st == PcLinkState.CONNECTED || st == PcLinkState.CONNECTING) return
        openSocket()
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
            _pcStatus.value = _pcStatus.value.copy(
                pcName = snap.pcName,
                gpuName = snap.gpuName,
                activeModel = snap.activeModel,
                activeTts = snap.activeTts
            )
        }
    }

    fun sendPrompt(prompt: String, includeScreenContext: Boolean = false, assistContext: String? = null) {
        val text = prompt.trim()
        if (text.isEmpty()) return

        memoryStore.saveTurn(ChatTurn(role = "user", content = text))
        _turns.value = memoryStore.recentTurns(50)

        val ws = liveSocket
        if (ws != null && _pcStatus.value.linkState == PcLinkState.CONNECTED) {
            _busy.value = true
            _statusLine.value = "PC GPU computing…"
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
                    .apply { if (screenText.isNotEmpty()) put("screenContext", screenText) }
                ws.send(frame.toString())
            }
            return
        }

        // Offline graceful mode: local phone tools + SQLite memory recall
        scope.launch {
            _busy.value = true
            _statusLine.value = "On-device agent…"
            val quick = phoneAgent.tryOfflineQuickAction(text)
            val reply = if (quick != null) {
                refreshLocalMemories()
                quick.message
            } else {
                val hits = memoryStore.recall(text, 4)
                if (hits.isNotEmpty()) {
                    "PC offline — recalled from phone memory:\n" + hits.joinToString("\n") { "• ${it.content}" }
                } else {
                    "PC is offline. Connect in PC Link for GPU compute, or try offline phone commands like 'Open Spotify', 'Set a 5 minute timer', or 'Remember ...'."
                }
            }
            memoryStore.saveTurn(ChatTurn(role = "assistant", content = reply, model = "on-device"))
            _turns.value = memoryStore.recentTurns(50)
            _busy.value = false
            _statusLine.value = "Offline"
            if (prefs.speakReplies) voicePlayer.speakOnDevice(reply)
        }
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
                _statusLine.value = "Connected"
                pushTelemetry(webSocket)
                syncMemoriesNow()
                refreshPcInfo()
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
        _pcStatus.value = _pcStatus.value.copy(
            linkState = if (prefs.isPaired) PcLinkState.OFFLINE else PcLinkState.UNPAIRED,
            lastError = reason
        )
        _statusLine.value = "Offline"
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

    private fun handleFrame(ws: WebSocket, raw: String) {
        val msg = runCatching { JSONObject(raw) }.getOrNull() ?: return
        when (msg.optString("type")) {
            "bridge.ready" -> {
                val n = msg.optString("pcName")
                if (n.isNotBlank()) {
                    prefs.pcName = n
                    _pcStatus.value = _pcStatus.value.copy(pcName = n)
                }
            }
            "chat.thinking" -> {
                _busy.value = true
                _statusLine.value = "PC GPU thinking…"
            }
            "chat.done" -> {
                val reply = msg.optString("reply").trim()
                val model = msg.optString("model")
                val ms = msg.optInt("elapsedMs", 0)
                _pcStatus.value = _pcStatus.value.copy(
                    activeModel = model.ifBlank { _pcStatus.value.activeModel },
                    lastLatencyMs = ms
                )
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
                memoryStore.saveTurn(ChatTurn(role = "assistant", content = "⚠️ $err", model = "error"))
                _turns.value = memoryStore.recentTurns(50)
                _busy.value = false
                _statusLine.value = "Error"
            }
            "tts.audio" -> {
                val b64 = msg.optString("audioBase64")
                if (b64.isNotBlank()) {
                    voicePlayer.playBase64Wav(
                        base64Audio = b64,
                        rawSentence = msg.optString("sentence"),
                        timingsJson = msg.optJSONArray("wordTimings"),
                        provider = msg.optString("provider", "pc-cuda")
                    )
                }
            }
            "device.tool_call" -> {
                val callId = msg.optString("callId")
                val action = msg.optString("action")
                val params = msg.optJSONObject("params") ?: JSONObject()
                _statusLine.value = "Phone tool: $action"
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
                _statusLine.value = "Ready"
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
