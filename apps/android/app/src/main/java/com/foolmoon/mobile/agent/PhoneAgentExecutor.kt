package com.foolmoon.mobile.agent

import android.Manifest
import android.app.ActivityManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Rect
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.provider.AlarmClock
import android.provider.CalendarContract
import android.provider.ContactsContract
import android.provider.Settings
import android.view.KeyEvent
import androidx.core.content.ContextCompat
import com.foolmoon.mobile.memory.FoolmoonMemoryStore
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.Locale

data class PhoneToolResult(
    val ok: Boolean,
    val message: String,
    val data: JSONObject = JSONObject()
) {
    fun toWireJson(): JSONObject = JSONObject().apply {
        put("ok", ok)
        put("message", message)
        put("data", data)
    }
}

/**
 * Permission-safe agentic action executor with full Gemini Mobile parity:
 * calling contacts/numbers, SMS, screen reading & Circle-to-Search region inspection,
 * alarms/timers, flashlight, media & volume, system settings, web search, and on-device memory.
 */
class PhoneAgentExecutor(
    private val context: Context,
    private val memoryStore: FoolmoonMemoryStore,
    private val onSpeakLocal: (String) -> Unit
) {

    @Volatile
    var isTorchOn: Boolean = false
        private set

    fun availableCapabilities(): List<String> = buildList {
        add("open_app")
        add("set_alarm")
        add("set_timer")
        add("open_url")
        add("search_web")
        add("compose_sms")
        add("dial_number")
        add("call_contact")
        add("create_calendar_event")
        add("toggle_flashlight")
        add("media_control")
        add("open_settings")
        add("get_device_status")
        add("get_clipboard")
        add("set_clipboard")
        add("memory_recall")
        add("memory_remember")
        add("speak_on_phone")
        if (FoolmoonAccessibilityService.isEnabled()) {
            add("inspect_screen")
            add("inspect_screen_region")
            add("tap_text")
            add("scroll_screen")
            add("navigate")
        }
    }

    fun execute(action: String, params: JSONObject): PhoneToolResult {
        return try {
            when (action.trim().lowercase()) {
                "open_app" -> openApp(params.optString("app_name").ifBlank { params.optString("package") })
                "set_alarm" -> setAlarm(
                    hour = params.optInt("hour", 8),
                    minute = params.optInt("minute", 0),
                    label = params.optString("label", "Foolmoon Alarm")
                )
                "set_timer" -> setTimer(
                    seconds = params.optInt("seconds", 60),
                    label = params.optString("label", "Foolmoon Timer")
                )
                "open_url" -> openUrl(params.optString("url"))
                "search_web" -> searchWeb(params.optString("query").ifBlank { params.optString("q") })
                "compose_sms" -> composeSms(
                    target = params.optString("phone").ifBlank { params.optString("contact") },
                    body = params.optString("body")
                )
                "dial_number", "call_contact" -> callOrDial(
                    target = params.optString("name")
                        .ifBlank { params.optString("contact") }
                        .ifBlank { params.optString("phone") }
                )
                "create_calendar_event" -> createCalendarEvent(
                    title = params.optString("title", "Foolmoon Event"),
                    startMs = params.optLong("start_ms", System.currentTimeMillis() + 3_600_000L),
                    endMs = params.optLong("end_ms", System.currentTimeMillis() + 7_200_000L),
                    description = params.optString("description", "")
                )
                "toggle_flashlight" -> {
                    val on = if (params.has("on")) params.optBoolean("on") else !isTorchOn
                    toggleFlashlight(on)
                }
                "media_control" -> mediaControl(params.optString("command").ifBlank { params.optString("action", "play_pause") })
                "open_settings" -> openSettings(params.optString("section", "general"))
                "get_device_status" -> getDeviceStatus()
                "get_clipboard" -> getClipboard()
                "set_clipboard" -> setClipboard(params.optString("text"))
                "inspect_screen" -> inspectScreen()
                "inspect_screen_region" -> inspectScreenRegion(
                    left = params.optInt("left", 0),
                    top = params.optInt("top", 0),
                    right = params.optInt("right", 1080),
                    bottom = params.optInt("bottom", 1920)
                )
                "tap_text" -> tapText(params.optString("text"))
                "scroll_screen" -> scrollScreen(params.optString("direction", "down"))
                "navigate" -> navigate(params.optString("target", "back"))
                "memory_remember" -> {
                    val content = params.optString("content").trim()
                    if (content.isEmpty()) return PhoneToolResult(false, "content is required")
                    val entry = memoryStore.remember(
                        content = content,
                        category = params.optString("category", "fact"),
                        pinned = params.optBoolean("pinned", false)
                    )
                    PhoneToolResult(true, "Hafızaya kaydedildi: ${entry.content}", entry.toSyncJson())
                }
                "memory_recall" -> {
                    val query = params.optString("query")
                    val hits = memoryStore.recall(query, limit = params.optInt("limit", 6))
                    val arr = JSONArray()
                    hits.forEach { arr.put(it.toSyncJson()) }
                    PhoneToolResult(
                        ok = true,
                        message = "${hits.size} hafıza kaydı bulundu",
                        data = JSONObject().put("memories", arr)
                    )
                }
                "speak_on_phone" -> {
                    val text = params.optString("text").trim()
                    if (text.isEmpty()) return PhoneToolResult(false, "text is required")
                    onSpeakLocal(text)
                    PhoneToolResult(true, "Telefondan seslendiriliyor")
                }
                else -> PhoneToolResult(false, "Desteklenmeyen telefon komutu: $action")
            }
        } catch (exc: Exception) {
            PhoneToolResult(false, "Telefon komutu '$action' hatası: ${exc.message}")
        }
    }

    /** Offline & low-latency natural command parser supporting Turkish + English Gemini-style commands. */
    fun tryOfflineQuickAction(prompt: String): PhoneToolResult? {
        val trimmed = prompt.trim()
        val low = foldTurkish(trimmed)

        // 1. Screen reading offline quick check
        if (low.contains("ekranimda ne var") || low.contains("ekrana bak") ||
            low.contains("what is on my screen") || low.contains("inspect screen")
        ) {
            return inspectScreen()
        }

        // 2. Flashlight control
        if (low.contains("fener") || low.contains("flas") || low.contains("flashlight") || low.contains("torch")) {
            val turnOff = low.contains("kapat") || low.contains("off") || low.contains("sondur")
            val turnOn = low.contains("ac") || low.contains("on") || low.contains("yak")
            val nextState = when {
                turnOff -> false
                turnOn -> true
                else -> !isTorchOn
            }
            return toggleFlashlight(nextState)
        }

        // 3. Phone calling ("Ahmet'i ara", "0532... ara", "call Mom", "dial ...")
        Regex("^(?:call|dial|telefon et)\\s+(.+)$").find(low)?.let { m ->
            val target = m.groupValues[1].trim()
            if (target.isNotEmpty()) return callOrDial(target)
        }
        Regex("^(.+?)['’]?(?:i|ı|u|ü|yi|yı|yu|yü)?\\s+(?:ara|cevir|telefon et)$").find(low)?.let { m ->
            val target = cleanTurkishSuffix(trimmed, m.groupValues[1].trim())
            if (target.isNotEmpty() && !low.contains("webde") && !low.contains("internette") && !low.contains("google")) {
                return callOrDial(target)
            }
        }

        // 4. SMS ("Ahmet'e mesaj at: ...", "text John hello")
        Regex("^(.+?)['’]?(?:e|a|ye|ya)?\\s+(?:mesaj at|sms gonder)[:\\s]*(.+)$").find(low)?.let { m ->
            return composeSms(cleanTurkishSuffix(trimmed, m.groupValues[1].trim()), m.groupValues[2].trim())
        }

        // 5. Web Search ("... webde ara", "search ...")
        Regex("^(?:google'da|webde|internette)?\\s*(.+?)\\s+(?:ara|arat)$").find(low)?.takeIf {
            low.contains("google") || low.contains("web") || low.contains("internet")
        }?.let { m ->
            return searchWeb(m.groupValues[1].trim())
        }
        Regex("^(?:search|google)\\s+(.+)$").find(low)?.let { m ->
            return searchWeb(m.groupValues[1].trim())
        }

        // 6. Media & Volume
        when {
            low.contains("sarkiyi durdur") || low.contains("muzigi durdur") || low.contains("pause music") ||
                low.contains("oynat") || low.contains("play pause") -> return mediaControl("play_pause")
            low.contains("sonraki sarki") || low.contains("next track") || low.contains("sarkiyi gec") -> return mediaControl("next")
            low.contains("onceki sarki") || low.contains("previous track") -> return mediaControl("previous")
            low.contains("sesi ac") || low.contains("sesi yukselt") || low.contains("volume up") -> return mediaControl("volume_up")
            low.contains("sesi kis") || low.contains("volume down") -> return mediaControl("volume_down")
            low.contains("sessize al") || low == "mute" -> return mediaControl("mute")
        }

        // 7. Alarm ("saat 07:30 alarm kur", "set alarm 8:00")
        Regex("(?:alarm|alarim).*?(\\d{1,2})[:.](\\d{2})|(\\d{1,2})[:.](\\d{2}).*?(?:alarm|kur)").find(low)?.let { m ->
            val hStr = m.groupValues[1].ifBlank { m.groupValues[3] }
            val mStr = m.groupValues[2].ifBlank { m.groupValues[4] }
            val h = hStr.toIntOrNull()
            val min = mStr.toIntOrNull()
            if (h != null && min != null) return setAlarm(h, min, "Foolmoon Alarm")
        }

        // 8. Timer
        Regex("(\\d+)\\s*(?:minute|min|dakika|dk)").find(low)?.let { m ->
            if (low.contains("timer") || low.contains("zamanlay") || low.contains("sayac") || low.contains("kur")) {
                val mins = m.groupValues[1].toIntOrNull() ?: 1
                return setTimer(mins * 60, "Foolmoon $mins dk sayaç")
            }
        }
        Regex("(\\d+)\\s*(?:second|sec|saniye|sn)").find(low)?.let { m ->
            if (low.contains("timer") || low.contains("zamanlay") || low.contains("sayac") || low.contains("kur")) {
                val secs = m.groupValues[1].toIntOrNull() ?: 10
                return setTimer(secs, "Foolmoon $secs sn sayaç")
            }
        }

        // 9. Settings
        if (low.contains("ayar") || low.contains("settings")) {
            return when {
                low.contains("wifi") || low.contains("wi-fi") -> openSettings("wifi")
                low.contains("bluetooth") -> openSettings("bluetooth")
                low.contains("ekran") || low.contains("display") -> openSettings("display")
                low.contains("ses") || low.contains("sound") -> openSettings("sound")
                else -> openSettings("general")
            }
        }

        // 10. App launcher
        Regex("^(?:open|launch|ac|aç)\\s+(.+)$").find(low)?.let { m ->
            return openApp(m.groupValues[1].trim())
        }
        Regex("^(.+?)['’]?(?:i|ı|u|ü|yi|yı|yu|yü)?\\s+(?:ac|baslat|calistir)$").find(low)?.let { m ->
            val target = cleanTurkishSuffix(trimmed, m.groupValues[1].trim())
            if (target.isNotEmpty()) return openApp(target)
        }

        // 11. Remember offline
        Regex("^(?:remember|hatirla|kaydet|not et)[:\\s]+(?:that\\s+)?(.+)$").find(low)?.let {
            val content = trimmed.substringAfter(" ").trim()
            val saved = memoryStore.remember(content, category = "note", pinned = false)
            return PhoneToolResult(true, "Hafızaya kaydedildi: ${saved.content}", saved.toSyncJson())
        }

        return null
    }

    private fun foldTurkish(raw: String): String = raw
        .replace('İ', 'i').replace('I', 'i').replace('ı', 'i')
        .replace('Ş', 's').replace('ş', 's')
        .replace('Ğ', 'g').replace('ğ', 'g')
        .replace('Ü', 'u').replace('ü', 'u')
        .replace('Ö', 'o').replace('ö', 'o')
        .replace('Ç', 'c').replace('ç', 'c')
        .lowercase(Locale.US)

    private fun cleanTurkishSuffix(original: String, foldedCandidate: String): String {
        return foldedCandidate
            .replace(Regex("['’].*$"), "")
            .trim()
            .ifBlank { original }
    }

    fun lookupContactPhone(query: String): Pair<String, String>? {
        val hasPerm = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED
        if (!hasPerm) return null
        val target = foldTurkish(query.trim())
        if (target.isEmpty()) return null

        val proj = arrayOf(
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER
        )
        var exactMatch: Pair<String, String>? = null
        var partialMatch: Pair<String, String>? = null

        context.contentResolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            proj,
            null,
            null,
            "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} ASC"
        )?.use { cursor ->
            val nameIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
            val numIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
            while (cursor.moveToNext()) {
                val name = cursor.getString(nameIdx)?.trim().orEmpty()
                val num = cursor.getString(numIdx)?.trim().orEmpty()
                if (name.isEmpty() || num.isEmpty()) continue
                val folded = foldTurkish(name)
                if (folded == target) {
                    exactMatch = name to num
                    break
                }
                if (partialMatch == null && (folded.contains(target) || target.contains(folded))) {
                    partialMatch = name to num
                }
            }
        }
        return exactMatch ?: partialMatch
    }

    fun callOrDial(target: String): PhoneToolResult {
        val cleaned = target.trim()
        if (cleaned.isEmpty()) return PhoneToolResult(false, "Aranacak kişi adı veya numara belirtilmedi.")

        val digitsOnly = cleaned.replace(Regex("[\\s()\\-]"), "")
        val isPhoneLiteral = digitsOnly.matches(Regex("^\\+?\\d{3,}$"))

        var resolvedLabel = cleaned
        var dialTarget = if (isPhoneLiteral) digitsOnly else ""

        if (!isPhoneLiteral) {
            val found = lookupContactPhone(cleaned)
            if (found != null) {
                resolvedLabel = "${found.first} (${found.second})"
                dialTarget = found.second.replace(Regex("[\\s()\\-]"), "")
            }
        }

        if (dialTarget.isNotEmpty()) {
            val canCallDirect = ContextCompat.checkSelfPermission(
                context, Manifest.permission.CALL_PHONE
            ) == PackageManager.PERMISSION_GRANTED
            val action = if (canCallDirect) Intent.ACTION_CALL else Intent.ACTION_DIAL
            val intent = Intent(action, Uri.parse("tel:$dialTarget")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            return PhoneToolResult(
                ok = true,
                message = if (canCallDirect) "$resolvedLabel aranıyor…" else "$resolvedLabel için arama ekranı açıldı.",
                data = JSONObject().put("target", resolvedLabel).put("number", dialTarget).put("directCall", canCallDirect)
            )
        }

        // Contact lookup failed or permission denied -> open phone dialer cleanly with helpful explanation
        val hasContacts = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED
        val dialIntent = Intent(Intent.ACTION_DIAL).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { context.startActivity(dialIntent) }
        val msg = if (!hasContacts) {
            "Rehber izni verilmediği için '$cleaned' aranacak kişilerde bulunamadı; Telefon uygulaması açıldı. Rehber izni vererek doğrudan isimle arayabilirsiniz."
        } else {
            "Rehberde '$cleaned' adına kayıtlı numara bulunamadı; Telefon çevirici açıldı."
        }
        return PhoneToolResult(false, msg)
    }

    private fun openApp(query: String): PhoneToolResult {
        val needle = foldTurkish(query.trim())
        if (needle.isEmpty()) return PhoneToolResult(false, "Uygulama adı gerekli.")

        val pm = context.packageManager
        pm.getLaunchIntentForPackage(query.trim())?.let { intent ->
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            return PhoneToolResult(true, "$query açıldı.")
        }

        val launcherIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val apps = pm.queryIntentActivities(launcherIntent, 0)
        val best = apps.firstOrNull {
            foldTurkish(it.loadLabel(pm).toString()) == needle
        } ?: apps.firstOrNull {
            foldTurkish(it.loadLabel(pm).toString()).contains(needle)
        }

        if (best != null) {
            val pkg = best.activityInfo.packageName
            val launch = pm.getLaunchIntentForPackage(pkg)
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(launch)
                val label = best.loadLabel(pm).toString()
                return PhoneToolResult(true, "$label açıldı.", JSONObject().put("package", pkg))
            }
        }
        return PhoneToolResult(false, "'$query' ile eşleşen yüklü uygulama bulunamadı.")
    }

    private fun setAlarm(hour: Int, minute: Int, label: String): PhoneToolResult {
        val intent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
            putExtra(AlarmClock.EXTRA_HOUR, hour.coerceIn(0, 23))
            putExtra(AlarmClock.EXTRA_MINUTES, minute.coerceIn(0, 59))
            putExtra(AlarmClock.EXTRA_MESSAGE, label)
            putExtra(AlarmClock.EXTRA_SKIP_UI, true)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        val formatted = String.format(Locale.US, "%02d:%02d", hour.coerceIn(0, 23), minute.coerceIn(0, 59))
        return PhoneToolResult(true, "$formatted için alarm kuruldu ($label).")
    }

    private fun setTimer(seconds: Int, label: String): PhoneToolResult {
        val safeSec = seconds.coerceAtLeast(1)
        val intent = Intent(AlarmClock.ACTION_SET_TIMER).apply {
            putExtra(AlarmClock.EXTRA_LENGTH, safeSec)
            putExtra(AlarmClock.EXTRA_MESSAGE, label)
            putExtra(AlarmClock.EXTRA_SKIP_UI, true)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        return PhoneToolResult(true, "${safeSec} saniyelik sayaç başlatıldı ($label).")
    }

    private fun openUrl(rawUrl: String): PhoneToolResult {
        val trimmed = rawUrl.trim()
        if (trimmed.isEmpty()) return PhoneToolResult(false, "URL gerekli.")
        val normalized = if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) trimmed else "https://$trimmed"
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(normalized)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        return PhoneToolResult(true, "Tarayıcıda açıldı: $normalized")
    }

    fun searchWeb(query: String): PhoneToolResult {
        val q = query.trim()
        if (q.isEmpty()) return PhoneToolResult(false, "Arama sorgusu boş olamaz.")
        val encoded = URLEncoder.encode(q, "UTF-8")
        return openUrl("https://www.google.com/search?q=$encoded")
    }

    private fun composeSms(target: String, body: String): PhoneToolResult {
        val cleaned = target.trim()
        val digitsOnly = cleaned.replace(Regex("[\\s()\\-]"), "")
        val number = if (digitsOnly.matches(Regex("^\\+?\\d{3,}$"))) {
            digitsOnly
        } else {
            lookupContactPhone(cleaned)?.second?.replace(Regex("[\\s()\\-]"), "") ?: cleaned
        }
        val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$number")).apply {
            putExtra("sms_body", body)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        return PhoneToolResult(true, "$target için SMS ekranı açıldı.")
    }

    private fun createCalendarEvent(title: String, startMs: Long, endMs: Long, description: String): PhoneToolResult {
        val intent = Intent(Intent.ACTION_INSERT).apply {
            data = CalendarContract.Events.CONTENT_URI
            putExtra(CalendarContract.Events.TITLE, title)
            putExtra(CalendarContract.Events.DESCRIPTION, description)
            putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, startMs)
            putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endMs)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        return PhoneToolResult(true, "Takvim etkinliği taslağı açıldı: $title")
    }

    fun toggleFlashlight(on: Boolean): PhoneToolResult {
        val cm = context.getSystemService(Context.CAMERA_SERVICE) as? CameraManager
            ?: return PhoneToolResult(false, "Kamera servisi bulunamadı.")
        val cameraId = cm.cameraIdList.firstOrNull { id ->
            val hasFlash = cm.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
            val lensBack = cm.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
            hasFlash && lensBack
        } ?: cm.cameraIdList.firstOrNull { id ->
            cm.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
        } ?: return PhoneToolResult(false, "Bu cihazda el feneri donanımı bulunamadı.")

        cm.setTorchMode(cameraId, on)
        isTorchOn = on
        return PhoneToolResult(true, if (on) "El feneri açıldı." else "El feneri kapatıldı.", JSONObject().put("on", on))
    }

    private fun mediaControl(command: String): PhoneToolResult {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        when (command.trim().lowercase()) {
            "play_pause", "play", "pause" -> {
                am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE))
                am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE))
                return PhoneToolResult(true, "Medya oynat/duraklat komutu gönderildi.")
            }
            "next" -> {
                am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_NEXT))
                am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_NEXT))
                return PhoneToolResult(true, "Sonraki parçaya geçildi.")
            }
            "previous", "prev" -> {
                am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PREVIOUS))
                am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PREVIOUS))
                return PhoneToolResult(true, "Önceki parçaya dönüldü.")
            }
            "volume_up" -> {
                am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI)
                return PhoneToolResult(true, "Ses yükseltildi.")
            }
            "volume_down" -> {
                am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI)
                return PhoneToolResult(true, "Ses kısıldı.")
            }
            "mute" -> {
                am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_MUTE, AudioManager.FLAG_SHOW_UI)
                return PhoneToolResult(true, "Ses kapatıldı.")
            }
            else -> return PhoneToolResult(false, "Bilinmeyen medya komutu: $command")
        }
    }

    private fun openSettings(section: String): PhoneToolResult {
        val action = when (section.trim().lowercase()) {
            "wifi", "wi-fi" -> Settings.ACTION_WIFI_SETTINGS
            "bluetooth" -> Settings.ACTION_BLUETOOTH_SETTINGS
            "display" -> Settings.ACTION_DISPLAY_SETTINGS
            "sound" -> Settings.ACTION_SOUND_SETTINGS
            "location" -> Settings.ACTION_LOCATION_SOURCE_SETTINGS
            "accessibility" -> Settings.ACTION_ACCESSIBILITY_SETTINGS
            "voice_input", "assistant" -> Settings.ACTION_VOICE_INPUT_SETTINGS
            else -> Settings.ACTION_SETTINGS
        }
        val intent = Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        return PhoneToolResult(true, "Ayarlar açıldı ($section).")
    }

    fun collectTelemetry(): JSONObject {
        val batteryIntent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        val batteryPct = if (level >= 0 && scale > 0) (level * 100) / scale else -1
        val status = batteryIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL

        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val memInfo = ActivityManager.MemoryInfo()
        am.getMemoryInfo(memInfo)

        return JSONObject().apply {
            put("batteryPercent", batteryPct)
            put("charging", charging)
            put("deviceModel", "${Build.MANUFACTURER} ${Build.MODEL}")
            put("androidSdk", Build.VERSION.SDK_INT)
            put("availRamMb", memInfo.availMem / (1024 * 1024))
            put("foregroundApp", FoolmoonAccessibilityService.lastForegroundPackage)
            put("accessibilityEnabled", FoolmoonAccessibilityService.isEnabled())
            put("memoryCount", memoryStore.listActive(500).size)
        }
    }

    private fun getDeviceStatus(): PhoneToolResult {
        val t = collectTelemetry()
        return PhoneToolResult(true, "Pil %${t.optInt("batteryPercent")} · ${t.optString("deviceModel")}", t)
    }

    private fun getClipboard(): PhoneToolResult {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val text = cm.primaryClip?.getItemAt(0)?.coerceToText(context)?.toString() ?: ""
        return PhoneToolResult(true, if (text.isEmpty()) "Pano boş" else "Pano okundu", JSONObject().put("text", text))
    }

    private fun setClipboard(text: String): PhoneToolResult {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("Foolmoon", text))
        return PhoneToolResult(true, "Panoya kopyalandı.")
    }

    private fun inspectScreen(): PhoneToolResult {
        val svc = FoolmoonAccessibilityService.current()
            ?: return PhoneToolResult(false, "Ekranı okuyabilmek için Ayarlar > Erişilebilirlik'ten 'Foolmoon Agentic Screen Control' servisini açın.")
        val summary = svc.inspectScreenSummary()
        return PhoneToolResult(
            ok = true,
            message = if (summary.isNotBlank()) "Ekrandaki içerik:\n$summary" else "Ekran tarandı (okunabilir metin bulunamadı).",
            data = JSONObject().put("screen", summary)
        )
    }

    private fun inspectScreenRegion(left: Int, top: Int, right: Int, bottom: Int): PhoneToolResult {
        val svc = FoolmoonAccessibilityService.current()
            ?: return PhoneToolResult(false, "Bölgesel ekran seçimi için Foolmoon Erişilebilirlik servisini açın.")
        val extracted = svc.extractTextInBounds(Rect(left, top, right, bottom))
        return PhoneToolResult(
            ok = extracted.isNotBlank(),
            message = if (extracted.isNotBlank()) extracted else "Seçili alanda metin bulunamadı.",
            data = JSONObject().put("screen", extracted)
        )
    }

    private fun tapText(text: String): PhoneToolResult {
        val svc = FoolmoonAccessibilityService.current()
            ?: return PhoneToolResult(false, "Kontrollere dokunmak için Erişilebilirlik servisini açın.")
        val ok = svc.tapByText(text)
        return PhoneToolResult(ok, if (ok) "'$text' tıklandı." else "'$text' ile eşleşen öğe bulunamadı.")
    }

    private fun scrollScreen(direction: String): PhoneToolResult {
        val svc = FoolmoonAccessibilityService.current()
            ?: return PhoneToolResult(false, "Kaydırma için Erişilebilirlik servisini açın.")
        val ok = svc.scrollScreen(direction)
        return PhoneToolResult(ok, if (ok) "$direction yönüne kaydırıldı." else "Kaydırma başarısız.")
    }

    private fun navigate(target: String): PhoneToolResult {
        val svc = FoolmoonAccessibilityService.current()
            ?: return PhoneToolResult(false, "Sistem gezintisi için Erişilebilirlik servisini açın.")
        val ok = svc.performGlobalNavigation(target)
        return PhoneToolResult(ok, if (ok) "$target gerçekleştirildi." else "Desteklenmeyen hedef: $target")
    }
}
