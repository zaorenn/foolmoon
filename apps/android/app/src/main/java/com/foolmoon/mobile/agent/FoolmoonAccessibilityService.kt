package com.foolmoon.mobile.agent

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Bitmap
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.lang.ref.WeakReference
import kotlin.math.abs

data class ScreenElementNode(
    val text: String,
    val desc: String,
    val className: String,
    val isClickable: Boolean,
    val bounds: Rect
) {
    val bestLabel: String
        get() = text.ifBlank { desc }.trim()
}

/**
 * Opt-in Android AccessibilityService giving Foolmoon true Gemini-style screen awareness,
 * live screenshot capture (API 30+), Circle-to-Search bounds text extraction, and UI automation.
 */
class FoolmoonAccessibilityService : AccessibilityService() {

    companion object {
        @Volatile
        private var instanceRef: WeakReference<FoolmoonAccessibilityService>? = null

        @Volatile
        var lastForegroundPackage: String = ""
            private set

        @Volatile
        var lastCapturedBitmap: Bitmap? = null

        @Volatile
        var lastCapturedNodes: List<ScreenElementNode> = emptyList()

        @Volatile
        var lastCapturedSummary: String = ""

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

    fun inspectScreenNodes(maxNodes: Int = 180): List<ScreenElementNode> {
        val root = rootInActiveWindow ?: return emptyList()
        val nodes = ArrayList<ScreenElementNode>(64)
        val seen = HashSet<String>()

        fun walk(node: AccessibilityNodeInfo?, depth: Int) {
            if (node == null || nodes.size >= maxNodes || depth > 18) return
            val txt = node.text?.toString()?.trim().orEmpty()
            val dsc = node.contentDescription?.toString()?.trim().orEmpty()
            val label = txt.ifBlank { dsc }
            val rect = Rect()
            node.getBoundsInScreen(rect)
            if (label.isNotBlank() && !rect.isEmpty) {
                val key = "$label@${rect.left},${rect.top},${rect.right},${rect.bottom}"
                if (seen.add(key)) {
                    nodes.add(
                        ScreenElementNode(
                            text = txt,
                            desc = dsc,
                            className = node.className?.toString().orEmpty(),
                            isClickable = node.isClickable,
                            bounds = rect
                        )
                    )
                }
            }
            for (i in 0 until node.childCount) {
                walk(node.getChild(i), depth + 1)
            }
        }
        walk(root, 0)
        if (nodes.isNotEmpty()) {
            lastCapturedNodes = nodes
        }
        return nodes
    }

    fun extractTextInBounds(
        selectionRect: Rect,
        nodesOverride: List<ScreenElementNode>? = null
    ): String {
        val nodes = nodesOverride?.takeIf { it.isNotEmpty() }
            ?: inspectScreenNodes().takeIf { it.isNotEmpty() }
            ?: lastCapturedNodes
        if (nodes.isEmpty()) return ""

        val intersecting = nodes.filter { n ->
            Rect.intersects(selectionRect, n.bounds) ||
                selectionRect.contains(n.bounds.centerX(), n.bounds.centerY()) ||
                n.bounds.contains(selectionRect.centerX(), selectionRect.centerY())
        }
        val chosen = if (intersecting.isNotEmpty()) {
            intersecting
        } else {
            val sx = selectionRect.centerX()
            val sy = selectionRect.centerY()
            nodes.sortedBy { abs(it.bounds.centerX() - sx) + abs(it.bounds.centerY() - sy) }.take(4)
        }
        val seen = LinkedHashSet<String>()
        val sb = StringBuilder()
        if (lastForegroundPackage.isNotBlank()) {
            sb.append("Uygulama: ").append(lastForegroundPackage).append('\n')
        }
        chosen.forEach { n ->
            val lbl = n.bestLabel
            if (lbl.isNotBlank() && seen.add(lbl)) {
                sb.append(lbl).append('\n')
            }
        }
        return sb.toString().trim()
    }

    fun inspectScreenSummary(maxChars: Int = 2800): String {
        val root = rootInActiveWindow ?: return lastCapturedSummary
        val sb = StringBuilder()
        val pkg = root.packageName?.toString() ?: lastForegroundPackage
        if (pkg.isNotBlank()) {
            sb.append("Active App: ").append(pkg).append('\n')
        }
        val seen = HashSet<String>()
        val collectedNodes = ArrayList<ScreenElementNode>(64)

        fun walk(node: AccessibilityNodeInfo?, depth: Int) {
            if (node == null || sb.length >= maxChars || depth > 18) return
            val txt = node.text?.toString()?.trim().orEmpty()
            val dsc = node.contentDescription?.toString()?.trim().orEmpty()
            val label = txt.ifBlank { dsc }
            val rect = Rect()
            node.getBoundsInScreen(rect)
            if (label.isNotEmpty()) {
                if (!rect.isEmpty) {
                    collectedNodes.add(
                        ScreenElementNode(txt, dsc, node.className?.toString().orEmpty(), node.isClickable, rect)
                    )
                }
                if (seen.add(label)) {
                    val tag = if (node.isClickable) "[btn] " else ""
                    sb.append(tag).append(label).append('\n')
                }
            }
            for (i in 0 until node.childCount) {
                walk(node.getChild(i), depth + 1)
            }
        }
        walk(root, 0)
        if (collectedNodes.isNotEmpty()) {
            lastCapturedNodes = collectedNodes
        }
        val out = sb.toString().take(maxChars).trim()
        if (out.isNotBlank()) {
            lastCapturedSummary = out
        }
        return out
    }

    fun captureScreenSnapshot(onResult: (Bitmap?, List<ScreenElementNode>) -> Unit) {
        val nodes = inspectScreenNodes()
        inspectScreenSummary()
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            onResult(lastCapturedBitmap, nodes)
            return
        }
        try {
            takeScreenshot(
                Display.DEFAULT_DISPLAY,
                mainExecutor,
                object : TakeScreenshotCallback {
                    override fun onSuccess(screenshot: ScreenshotResult) {
                        val hw = screenshot.hardwareBuffer
                        val cs = screenshot.colorSpace
                        val bmp = runCatching {
                            val wrapped = Bitmap.wrapHardwareBuffer(hw, cs)
                            val soft = wrapped?.copy(Bitmap.Config.ARGB_8888, false)
                            wrapped?.recycle()
                            soft
                        }.getOrNull()
                        runCatching { hw.close() }
                        if (bmp != null) {
                            lastCapturedBitmap = bmp
                        }
                        onResult(bmp ?: lastCapturedBitmap, nodes)
                    }

                    override fun onFailure(errorCode: Int) {
                        onResult(lastCapturedBitmap, nodes)
                    }
                }
            )
        } catch (_: Exception) {
            onResult(lastCapturedBitmap, nodes)
        }
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
