package com.foolmoon.mobile.assistant

import android.service.voice.VoiceInteractionService
import com.foolmoon.mobile.FoolmoonApp
import com.foolmoon.mobile.wakeword.WakeWordForegroundService

/**
 * Registers Foolmoon as an official Android Default Digital Assistant (just like Google Gemini).
 * When the user holds the power button or swipes from a bottom corner, Android binds this
 * service and invokes [FoolmoonVoiceInteractionSessionService].
 */
class FoolmoonVoiceInteractionService : VoiceInteractionService() {
    override fun onReady() {
        super.onReady()
        val app = application as? FoolmoonApp ?: return
        app.bridge.connectIfPaired()
        if (app.prefs.wakeWordEnabled) {
            WakeWordForegroundService.start(this)
        }
    }
}
