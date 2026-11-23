package com.foolmoon.mobile.agent

import android.app.ActivityManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.provider.AlarmClock
import android.provider.CalendarContract
import com.foolmoon.mobile.memory.FoolmoonMemoryStore
import org.json.JSONArray
import org.json.JSONObject

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
 * Executes permission-safe agentic actions directly on the Android device.
 * Invoked either by the PC Foolmoon LLM over WebSocket RPC (`device.tool_call`),
 * embedded `phoneAction` responses, or local offline voice commands.
 */
class PhoneAgentExecutor(
    private val context: Context,
    private val memoryStore: FoolmoonMemoryStore,
    private val onSpeakLocal: (String) -> Unit
) {

    fun availableCapabilities(): List<String> = buildList {
        add("open_app")
        add("set_alarm")
        add("set_timer")
        add("open_url")
        add("compose_sms")
        add("dial_number")
        add("create_calendar_event")
        add("get_device_status")
        add("get_clipboard")
        add("set_clipboard")
        add("memory_recall")
        add("memory_remember")
        add("speak_on_phone")
        if (FoolmoonAccessibilityService.isEnabled()) {
            add("inspect_screen")
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
                "compose_sms" -> composeSms(params.optString("phone"), params.optString("body"))
                "dial_number" -> dialNumber(params.optString("phone"))
                "create_calendar_event" -> createCalendarEvent(
                    title = params.optString("title", "Foolmoon Event"),
                    startMs = params.optLong("start_ms", System.currentTimeMillis() + 3_600_000L),
                    endMs = params.optLong("end_ms", System.currentTimeMillis() + 7_200_000L),
                    description = params.optString("description", "")
                )
                "get_device_status" -> getDeviceStatus()
                "get_clipboard" -> getClipboard()
                "set_clipboard" -> setClipboard(params.optString("text"))
                "inspect_screen" -> inspectScreen()
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
                    PhoneToolResult(true, "Saved to phone memory: ${entry.content}", entry.toSyncJson())
                }
                "memory_recall" -> {
                    val query = params.optString("query")
                    val hits = memoryStore.recall(query, limit = params.optInt("limit", 6))
                    val arr = JSONArray()
                    hits.forEach { arr.put(it.toSyncJson()) }
                    PhoneToolResult(
                        ok = true,
                        message = "Found ${hits.size} phone memories",
                        data = JSONObject().put("memories", arr)
                    )
                }
                "speak_on_phone" -> {
                    val text = params.optString("text").trim()
                    if (text.isEmpty()) return PhoneToolResult(false, "text is required")
                    onSpeakLocal(text)
                    PhoneToolResult(true, "Speaking on phone")
                }
                else -> PhoneToolResult(false, "Unsupported phone action: $action")
            }
        } catch (exc: Exception) {
            PhoneToolResult(false, "Phone action '$action' error: ${exc.message}")
        }
    }

    /** Offline fast-path command parser when PC compute is unreachable. */
    fun tryOfflineQuickAction(prompt: String): PhoneToolResult? {
        val low = prompt.trim().lowercase()
        val openMatch = Regex("^(?:open|launch|ac|aç)\\s+(.+)$").find(low)
        if (openMatch != null) {
            return openApp(openMatch.groupValues[1].trim())
        }
        val rememberMatch = Regex("^(?:remember|hatirla|hatırla|kaydet)\\s+(?:that\\s+)?(.+)$").find(low)
        if (rememberMatch != null) {
            val content = prompt.trim().substringAfter(" ").trim()
            val saved = memoryStore.remember(content, category = "note", pinned = false)
            return PhoneToolResult(true, "Remembered on phone: ${saved.content}", saved.toSyncJson())
        }
        val timerMatch = Regex("(\\d+)\\s*(?:minute|min|dakika|dk)").find(low)
        if (timerMatch != null && (low.contains("timer") || low.contains("zamanlay") || low.contains("sayac"))) {
            val mins = timerMatch.groupValues[1].toIntOrNull() ?: 1
            return setTimer(mins * 60, "Foolmoon $mins min timer")
        }
        return null
    }

    private fun openApp(query: String): PhoneToolResult {
        val needle = query.trim().lowercase()
        if (needle.isEmpty()) return PhoneToolResult(false, "app_name is required")

        val pm = context.packageManager
        // Direct package match
        pm.getLaunchIntentForPackage(query.trim())?.let { intent ->
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            return PhoneToolResult(true, "Opened $query")
        }

        // Match launcher app by display label
        val launcherIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val apps = pm.queryIntentActivities(launcherIntent, 0)
        val best = apps.firstOrNull {
            it.loadLabel(pm).toString().lowercase() == needle
        } ?: apps.firstOrNull {
            it.loadLabel(pm).toString().lowercase().contains(needle)
        }

        if (best != null) {
            val pkg = best.activityInfo.packageName
            val launch = pm.getLaunchIntentForPackage(pkg)
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(launch)
                val label = best.loadLabel(pm).toString()
                return PhoneToolResult(true, "Opened $label", JSONObject().put("package", pkg))
            }
        }
        return PhoneToolResult(false, "Could not find installed app matching '$query'")
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
        val formatted = String.format("%02d:%02d", hour.coerceIn(0, 23), minute.coerceIn(0, 59))
        return PhoneToolResult(true, "Alarm set for $formatted ($label)")
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
        return PhoneToolResult(true, "Timer started for ${safeSec}s ($label)")
    }

    private fun openUrl(rawUrl: String): PhoneToolResult {
        val trimmed = rawUrl.trim()
        if (trimmed.isEmpty()) return PhoneToolResult(false, "url is required")
        val normalized = if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) trimmed else "https://$trimmed"
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(normalized)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        return PhoneToolResult(true, "Opened $normalized")
    }

    private fun composeSms(phone: String, body: String): PhoneToolResult {
        val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:${phone.trim()}")).apply {
            putExtra("sms_body", body)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        return PhoneToolResult(true, "Opened SMS draft to $phone")
    }

    private fun dialNumber(phone: String): PhoneToolResult {
        val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${phone.trim()}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        return PhoneToolResult(true, "Opened dialer for $phone")
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
        return PhoneToolResult(true, "Opened calendar event draft: $title")
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
        return PhoneToolResult(true, "Battery ${t.optInt("batteryPercent")}%", t)
    }

    private fun getClipboard(): PhoneToolResult {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val text = cm.primaryClip?.getItemAt(0)?.coerceToText(context)?.toString() ?: ""
        return PhoneToolResult(true, if (text.isEmpty()) "Clipboard empty" else "Read clipboard", JSONObject().put("text", text))
    }

    private fun setClipboard(text: String): PhoneToolResult {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("Foolmoon", text))
        return PhoneToolResult(true, "Copied to phone clipboard")
    }

    private fun inspectScreen(): PhoneToolResult {
        val svc = FoolmoonAccessibilityService.current()
            ?: return PhoneToolResult(false, "Enable Foolmoon Accessibility Service in Agent settings to inspect the screen.")
        val summary = svc.inspectScreenSummary()
        return PhoneToolResult(true, "Captured screen context (${summary.length} chars)", JSONObject().put("screen", summary))
    }

    private fun tapText(text: String): PhoneToolResult {
        val svc = FoolmoonAccessibilityService.current()
            ?: return PhoneToolResult(false, "Enable Foolmoon Accessibility Service to tap UI controls.")
        val ok = svc.tapByText(text)
        return PhoneToolResult(ok, if (ok) "Tapped '$text'" else "No clickable element matching '$text'")
    }

    private fun scrollScreen(direction: String): PhoneToolResult {
        val svc = FoolmoonAccessibilityService.current()
            ?: return PhoneToolResult(false, "Enable Foolmoon Accessibility Service to scroll.")
        val ok = svc.scrollScreen(direction)
        return PhoneToolResult(ok, if (ok) "Scrolled $direction" else "Scroll gesture failed")
    }

    private fun navigate(target: String): PhoneToolResult {
        val svc = FoolmoonAccessibilityService.current()
            ?: return PhoneToolResult(false, "Enable Foolmoon Accessibility Service for system navigation.")
        val ok = svc.performGlobalNavigation(target)
        return PhoneToolResult(ok, if (ok) "Navigated $target" else "Unsupported navigation target: $target")
    }
}
