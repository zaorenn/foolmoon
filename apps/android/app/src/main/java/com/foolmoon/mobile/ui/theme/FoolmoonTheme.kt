package com.foolmoon.mobile.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

object FoolmoonColors {
    val Obsidian = Color(0xFF14100F)
    val SurfaceCard = Color(0xFF1F1816)
    val SurfaceElevated = Color(0xFF2B211E)
    val Coral = Color(0xFFEA745E)
    val LunarGold = Color(0xFFF5C28B)
    val Cream = Color(0xFFF5EFE6)
    val Muted = Color(0xFFA9968B)
    val Emerald = Color(0xFF58C97E)
    val SkyGlow = Color(0xFF7DD3FC)
    val Border = Color(0xFF3A2C27)
}

private val FoolmoonNocturneScheme = darkColorScheme(
    primary = FoolmoonColors.Coral,
    onPrimary = Color(0xFF19110E),
    secondary = FoolmoonColors.LunarGold,
    onSecondary = Color(0xFF19110E),
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
        colorScheme = FoolmoonNocturneScheme,
        content = content
    )
}
