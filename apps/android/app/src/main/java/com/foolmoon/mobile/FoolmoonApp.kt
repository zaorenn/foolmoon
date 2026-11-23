package com.foolmoon.mobile

import android.app.Application
import com.foolmoon.mobile.agent.PhoneAgentExecutor
import com.foolmoon.mobile.audio.SyncedVoicePlayer
import com.foolmoon.mobile.data.FoolmoonPrefs
import com.foolmoon.mobile.memory.FoolmoonMemoryStore
import com.foolmoon.mobile.network.PcComputeBridgeClient

class FoolmoonApp : Application() {

    lateinit var prefs: FoolmoonPrefs
        private set

    lateinit var memoryStore: FoolmoonMemoryStore
        private set

    lateinit var voicePlayer: SyncedVoicePlayer
        private set

    lateinit var phoneAgent: PhoneAgentExecutor
        private set

    lateinit var bridge: PcComputeBridgeClient
        private set

    override fun onCreate() {
        super.onCreate()
        prefs = FoolmoonPrefs(this)
        memoryStore = FoolmoonMemoryStore(this)
        voicePlayer = SyncedVoicePlayer(this)
        phoneAgent = PhoneAgentExecutor(
            context = this,
            memoryStore = memoryStore,
            onSpeakLocal = { text -> voicePlayer.speakOnDevice(text) }
        )
        bridge = PcComputeBridgeClient(
            prefs = prefs,
            memoryStore = memoryStore,
            phoneAgent = phoneAgent,
            voicePlayer = voicePlayer
        )
        bridge.connectIfPaired()
    }
}
