package com.foolmoon.mobile.agent

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.lang.ref.WeakReference

/**
 * Opt-in Android AccessibilityService giving Foolmoon true Gemini-style screen awareness
 * and on-device UI automation (inspect visible text, tap controls by text, scroll, back/home).
 */
class FoolmoonAccessibilityService : AccessibilityService() {

    companion object {
        @Volatile
        private var instanceRef: WeakReference<FoolmoonAccessibilityService>? = null

        @Volatile
        var lastForegroundPackage: String = ""
            private set

        fun current(): FoolmoonAccessibilityService? = instanceRef?.get()

        fun isEnabled(): Boolean = current() != null
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instanceRef = WeakReference(this)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val pkg = event?.packageName?.toString()
        if (!pkg.isNullOrBlank() && pkg != packageName) {
            lastForegroundPackage = pkg
        }
    }

    override fun onInterrupt() {
        // Required override
    }

    override fun onDestroy() {
        instanceRef = null
        super.onDestroy()
    }

    fun inspectScreenSummary(maxChars: Int = 2800): String {
        val root = rootInActiveWindow ?: return ""
        val sb = StringBuilder()
        val pkg = root.packageName?.toString() ?: lastForegroundPackage
        if (pkg.isNotBlank()) {
            sb.append("Active App: ").append(pkg).append('\n')
        }
        val seen = HashSet<String>()
        fun walk(node: AccessibilityNodeInfo?, depth: Int) {
            if (node == null || sb.length >= maxChars || depth > 18) return
            val label = (node.text ?: node.contentDescription)?.toString()?.trim()
            if (!label.isNullOrEmpty() && seen.add(label)) {
                val tag = if (node.isClickable) "[btn] " else ""
                sb.append(tag).append(label).append('\n')
            }
            for (i in 0 until node.childCount) {
                walk(node.getChild(i), depth + 1)
            }
        }
        walk(root, 0)
        return sb.toString().take(maxChars).trim()
    }

    fun tapByText(query: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val needle = query.trim().lowercase()
        if (needle.isEmpty()) return false

        val matches = root.findAccessibilityNodeInfosByText(query)
        for (node in matches) {
            var cur: AccessibilityNodeInfo? = node
            while (cur != null) {
                if (cur.isClickable) {
                    if (cur.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
                }
                cur = cur.parent
            }
        }
        return false
    }

    fun scrollScreen(direction: String): Boolean {
        val dm = resources.displayMetrics
        val cx = dm.widthPixels / 2f
        val startY = if (direction.equals("up", ignoreCase = true)) dm.heightPixels * 0.30f else dm.heightPixels * 0.75f
        val endY = if (direction.equals("up", ignoreCase = true)) dm.heightPixels * 0.75f else dm.heightPixels * 0.25f
        val path = Path().apply {
            moveTo(cx, startY)
            lineTo(cx, endY)
        }
        val stroke = GestureDescription.StrokeDescription(path, 0L, 280L)
        return dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), null, null)
    }

    fun performGlobalNavigation(action: String): Boolean = when (action.lowercase()) {
        "back" -> performGlobalAction(GLOBAL_ACTION_BACK)
        "home" -> performGlobalAction(GLOBAL_ACTION_HOME)
        "recents" -> performGlobalAction(GLOBAL_ACTION_RECENTS)
        "notifications" -> performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS)
        else -> false
    }
}
