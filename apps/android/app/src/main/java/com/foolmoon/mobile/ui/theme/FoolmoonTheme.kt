package com.foolmoon.mobile.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * Matches Foolmoon Desktop's "black-paper-crimson" tactile theme while incorporating
 * fluid Gemini Mobile aurora spectrum tokens for animated voice orbs and Circle-to-Search.
 */
object FoolmoonColors {
    val Obsidian = Color(0xFF0E0C0D)        // Deep black paper base
    val SurfaceCard = Color(0xFF171314)     // Matte dark paper card / composer pill
    val SurfaceElevated = Color(0xFF221B1D) // Elevated sheet & user bubble tint
    val Crimson = Color(0xFFFF2A3C)         // Desktop accent crimson
    val Coral = Color(0xFFEA5455)           // Warm crimson-coral orb highlight
    val LunarGold = Color(0xFFF5C28B)       // Warm moon highlight
    val Cream = Color(0xFFF5EFE6)           // Tactile cream-white typography
    val Muted = Color(0xFFA79995)           // Secondary ink
    val Emerald = Color(0xFF58C97E)         // Listening / connected state
    val SkyGlow = Color(0xFF60A5FA)         // Gemini aura blue
    val GeminiViolet = Color(0xFFA855F7)    // Gemini aura violet
    val Border = Color(0xFF312729)          // Subtle paper edge
}

private val FoolmoonDesktopIntegratedScheme = darkColorScheme(
    primary = FoolmoonColors.Crimson,
    onPrimary = Color.White,
    secondary = FoolmoonColors.LunarGold,
    onSecondary = Color(0xFF140E0F),
    tertiary = FoolmoonColors.SkyGlow,
    background = FoolmoonColors.Obsidian,
    onBackground = FoolmoonColors.Cream,
    surface = FoolmoonColors.SurfaceCard,
    onSurface = FoolmoonColors.Cream,
    surfaceVariant = FoolmoonColors.SurfaceElevated,
    onSurfaceVariant = FoolmoonColors.Muted,
    outline = FoolmoonColors.Border
)

@Composable
fun FoolmoonTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = FoolmoonDesktopIntegratedScheme,
        content = content
    )
}
