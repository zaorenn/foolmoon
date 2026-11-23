package com.foolmoon.mobile.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.foolmoon.mobile.ui.theme.FoolmoonColors
import kotlin.math.sin

enum class CompanionMood { IDLE, LISTENING, THINKING, SPEAKING }

/**
 * Animated Bbot-inspired Foolmoon companion avatar rendered in Compose Canvas
 * with reactive aurora halo, natural eye motion, and audio-synced mouth animation.
 */
@Composable
fun BbotCompanionFace(
    mood: CompanionMood,
    audioLevel: Float,
    modifier: Modifier = Modifier,
    size: Dp = 56.dp
) {
    val transition = rememberInfiniteTransition(label = "bbot_motion")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = (Math.PI * 2.0).toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2800, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "bbot_phase"
    )
    val blinkWave by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 3600, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "bbot_blink"
    )

    val ringColors = when (mood) {
        CompanionMood.SPEAKING -> listOf(FoolmoonColors.Coral, FoolmoonColors.LunarGold, FoolmoonColors.SkyGlow)
        CompanionMood.LISTENING -> listOf(FoolmoonColors.Emerald, FoolmoonColors.SkyGlow, FoolmoonColors.Emerald)
        CompanionMood.THINKING -> listOf(FoolmoonColors.LunarGold, FoolmoonColors.Coral, FoolmoonColors.LunarGold)
        CompanionMood.IDLE -> listOf(FoolmoonColors.Border, FoolmoonColors.Coral.copy(alpha = 0.45f))
    }

    Canvas(modifier = modifier.size(size)) {
        val w = this.size.width
        val h = this.size.height
        val cx = w / 2f
        val cy = h / 2f
        val r = (w.coerceAtMost(h) / 2f) * 0.86f

        // Glowing orbital halo
        val glowRadius = r * (1.06f + if (mood != CompanionMood.IDLE) audioLevel * 0.08f else 0f)
        drawCircle(
            brush = Brush.sweepGradient(ringColors, center = Offset(cx, cy)),
            radius = glowRadius,
            center = Offset(cx, cy),
            style = Stroke(width = w * 0.055f)
        )

        // Face body
        drawCircle(
            color = Color(0xFF1A1514),
            radius = r,
            center = Offset(cx, cy)
        )

        val lookX = when (mood) {
            CompanionMood.THINKING -> sin(phase * 1.5f) * r * 0.14f
            CompanionMood.LISTENING -> sin(phase * 0.8f) * r * 0.07f
            else -> sin(phase * 0.5f) * r * 0.05f
        }
        val lookY = if (mood == CompanionMood.THINKING) -r * 0.07f else 0f

        val isBlinking = blinkWave > 0.94f && mood != CompanionMood.SPEAKING
        val eyeRadius = r * 0.22f
        val eyeY = cy - r * 0.10f
        val leftEyeX = cx - r * 0.34f
        val rightEyeX = cx + r * 0.34f

        if (isBlinking) {
            val barH = r * 0.08f
            drawRoundRect(
                color = FoolmoonColors.Cream,
                topLeft = Offset(leftEyeX - eyeRadius, eyeY - barH / 2f),
                size = Size(eyeRadius * 2f, barH),
                cornerRadius = CornerRadius(barH, barH)
            )
            drawRoundRect(
                color = FoolmoonColors.Cream,
                topLeft = Offset(rightEyeX - eyeRadius, eyeY - barH / 2f),
                size = Size(eyeRadius * 2f, barH),
                cornerRadius = CornerRadius(barH, barH)
            )
        } else {
            drawCircle(color = FoolmoonColors.Cream, radius = eyeRadius, center = Offset(leftEyeX, eyeY))
            drawCircle(color = FoolmoonColors.Cream, radius = eyeRadius, center = Offset(rightEyeX, eyeY))

            val pupilR = eyeRadius * 0.46f
            drawCircle(
                color = Color(0xFF14100F),
                radius = pupilR,
                center = Offset(leftEyeX + lookX, eyeY + lookY)
            )
            drawCircle(
                color = Color(0xFF14100F),
                radius = pupilR,
                center = Offset(rightEyeX + lookX, eyeY + lookY)
            )
        }

        // Audio-reactive mouth
        val mouthW = r * (0.42f + (if (mood == CompanionMood.SPEAKING) audioLevel * 0.22f else 0f))
        val mouthH = when (mood) {
            CompanionMood.SPEAKING -> (r * (0.10f + audioLevel * 0.28f)).coerceIn(r * 0.08f, r * 0.34f)
            CompanionMood.LISTENING -> r * 0.14f
            else -> r * 0.07f
        }
        drawRoundRect(
            color = if (mood == CompanionMood.LISTENING) FoolmoonColors.Emerald else FoolmoonColors.LunarGold,
            topLeft = Offset(cx - mouthW / 2f, cy + r * 0.34f - mouthH / 2f),
            size = Size(mouthW, mouthH),
            cornerRadius = CornerRadius(mouthH, mouthH)
        )
    }
}
