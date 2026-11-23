package com.foolmoon.mobile.assistant

import android.app.assist.AssistContent
import android.app.assist.AssistStructure
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService
import com.foolmoon.mobile.agent.FoolmoonAccessibilityService

class FoolmoonVoiceInteractionSessionService : VoiceInteractionSessionService() {
    override fun onNewSession(args: Bundle?): VoiceInteractionSession {
        return FoolmoonVoiceInteractionSession(this)
    }
}

class FoolmoonVoiceInteractionSession(private val ctx: Context) : VoiceInteractionSession(ctx) {

    private var capturedAssistText: String = ""

    override fun onHandleAssist(state: AssistState) {
        super.onHandleAssist(state)
        capturedAssistText = extractAssistSummary(state.assistStructure, state.assistContent)
    }

    override fun onShow(args: Bundle?, showFlags: Int) {
        super.onShow(args, showFlags)
        // Snapshot the foreground screen nodes & bitmap right before our overlay opens
        val svc = FoolmoonAccessibilityService.current()
        if (svc != null) {
            svc.captureScreenSnapshot { _, _ -> launchOverlay() }
        } else {
            launchOverlay()
        }
    }

    private fun launchOverlay() {
        val intent = Intent(ctx, AssistantOverlayActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra(AssistantOverlayActivity.EXTRA_AUTO_LISTEN, true)
            if (capturedAssistText.isNotBlank()) {
                putExtra(AssistantOverlayActivity.EXTRA_SCREEN_CONTEXT, capturedAssistText)
            }
        }
        ctx.startActivity(intent)
        hide()
    }

    private fun extractAssistSummary(structure: AssistStructure?, content: AssistContent?): String {
        val sb = StringBuilder()
        content?.webUri?.let { sb.append("URL: ").append(it).append('\n') }
        if (structure != null) {
            val winCount = structure.windowNodeCount.coerceAtMost(2)
            for (w in 0 until winCount) {
                val root = structure.getWindowNodeAt(w).rootViewNode
                walkNode(root, sb, 0)
            }
        }
        return sb.toString().take(2400).trim()
    }

    private fun walkNode(node: AssistStructure.ViewNode?, sb: StringBuilder, depth: Int) {
        if (node == null || depth > 14 || sb.length >= 2400) return
        val txt = (node.text ?: node.contentDescription)?.toString()?.trim()
        if (!txt.isNullOrEmpty() && txt.length <= 240) {
            sb.append(txt).append('\n')
        }
        for (i in 0 until node.childCount) {
            walkNode(node.getChildAt(i), sb, depth + 1)
        }
    }
}
