package com.foolmoon.mobile.network

import com.foolmoon.mobile.agent.PhoneAgentExecutor
import com.foolmoon.mobile.data.FoolmoonPrefs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

data class PcHostSnapshot(
    val pcName: String,
    val gpuName: String,
    val activeModel: String,
    val activeTts: String
)

class PcPairingApi(
    private val http: OkHttpClient,
    private val prefs: FoolmoonPrefs,
    private val agent: PhoneAgentExecutor
) {
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    suspend fun pair(host: String, port: Int, code: String): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val cleanHost = host.trim().removePrefix("http://").removePrefix("https://").trimEnd('/')
            require(cleanHost.isNotEmpty()) { "Enter your PC IP address" }
            require(code.trim().length == 6) { "Enter the 6-digit pairing code" }

            val url = if (cleanHost.contains(":")) {
                "http://$cleanHost/api/mobile/pair/complete"
            } else {
                "http://$cleanHost:$port/api/mobile/pair/complete"
            }
            val body = JSONObject()
                .put("code", code.trim())
                .put("device_id", prefs.deviceId)
                .put("device_name", prefs.deviceName)
                .put("model", prefs.deviceName)
                .put("capabilities", JSONArray(agent.availableCapabilities()))
                .toString()
                .toRequestBody(jsonType)

            http.newCall(Request.Builder().url(url).post(body).build()).execute().use { resp ->
                val raw = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) error("HTTP ${resp.code}: $raw")
                val obj = JSONObject(raw)
                val tok = obj.optString("token")
                if (!tok.startsWith("fm_mob_")) error("Invalid token from PC")
                prefs.pcHost = cleanHost
                prefs.pcPort = port
                prefs.mobileToken = tok
                prefs.pcName = obj.optString("pc_name", cleanHost)
                prefs.pcName
            }
        }
    }

    suspend fun fetchStatus(): PcHostSnapshot? = withContext(Dispatchers.IO) {
        if (!prefs.isPaired) return@withContext null
        runCatching {
            val req = Request.Builder()
                .url("${prefs.httpBaseUrl()}/api/mobile/status")
                .header("Authorization", "Bearer ${prefs.mobileToken}")
                .get()
                .build()
            http.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@runCatching null
                val j = JSONObject(resp.body?.string().orEmpty())
                PcHostSnapshot(
                    pcName = j.optString("pcName", prefs.pcName),
                    gpuName = j.optString("gpuName", ""),
                    activeModel = j.optString("activeModel", ""),
                    activeTts = j.optString("activeTtsProvider", "")
                )
            }
        }.getOrNull()
    }
}
