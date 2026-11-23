package com.foolmoon.mobile.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.foolmoon.mobile.audio.VoicePlaybackSnapshot
import com.foolmoon.mobile.ui.theme.FoolmoonColors

/**
 * Karaoke word-synced caption strip (matching Foolmoon Desktop's Notch LiveLyrics),
 * highlighting each word as the PC CUDA TTS voice speaks it.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SyncedLyricsBar(
    playback: VoicePlaybackSnapshot,
    fallbackText: String,
    modifier: Modifier = Modifier
) {
    if (!playback.speaking || playback.words.isEmpty()) {
        Text(
            text = fallbackText,
            color = FoolmoonColors.Muted,
            fontSize = 13.sp,
            maxLines = 2,
            modifier = modifier.fillMaxWidth()
        )
        return
    }

    val lastEnd = playback.words.lastOrNull()?.endMs ?: 0
    val settled = lastEnd > 0 && playback.elapsedMs > lastEnd + 450
    val activeIdx = if (settled) {
        -1
    } else {
        playback.words.indexOfLast { playback.elapsedMs >= it.startMs }.coerceAtLeast(0)
    }

    // Sliding window of 10 words around the active spoken word so captions stay crisp and never overflow
    val winStart = (activeIdx - 3).coerceAtLeast(0)
    val winEnd = (winStart + 10).coerceAtMost(playback.words.size)
    val visible = playback.words.subList(winStart, winEnd)

    FlowRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp)
    ) {
        visible.forEachIndexed { localIdx, wordObj ->
            val idx = winStart + localIdx
            val isActive = idx == activeIdx
            val isPast = activeIdx >= 0 && idx < activeIdx
            Text(
                text = wordObj.word,
                color = when {
                    isActive -> Color.White
                    isPast || settled -> FoolmoonColors.Cream.copy(alpha = 0.85f)
                    else -> FoolmoonColors.Muted.copy(alpha = 0.65f)
                },
                fontSize = 14.sp,
                fontWeight = if (isActive) FontWeight.SemiBold else FontWeight.Normal,
                modifier = if (isActive) {
                    Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(FoolmoonColors.Coral.copy(alpha = 0.34f))
                        .padding(horizontal = 6.dp, vertical = 1.dp)
                } else {
                    Modifier.padding(horizontal = 1.dp, vertical = 1.dp)
                }
            )
        }
    }
}
