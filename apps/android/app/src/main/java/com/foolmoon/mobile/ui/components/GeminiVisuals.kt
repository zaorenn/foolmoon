package com.foolmoon.mobile.ui.components

import android.graphics.Bitmap
import android.graphics.Rect as AndroidRect
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.CropFree
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.foolmoon.mobile.agent.FoolmoonAccessibilityService
import com.foolmoon.mobile.agent.ScreenElementNode
import com.foolmoon.mobile.ui.theme.FoolmoonColors
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/**
 * Shared animated rainbow-crimson sweep brush evoking Gemini Mobile's live halo & Foolmoon crimson.
 */
@Composable
fun rememberGeminiAuraPhase(durationMs: Int = 3400): Float {
    val transition = rememberInfiniteTransition(label = "gemini_aura")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = (2f * PI).toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = durationMs, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "aura_phase"
    )
    return phase
}

fun geminiSweepBrush(phase: Float, center: Offset = Offset.Zero, alpha: Float = 0.9f): Brush {
    val shift = ((sin(phase) + 1f) * 0.5f)
    val c1 = FoolmoonColors.Crimson.copy(alpha = alpha)
    val c2 = FoolmoonColors.LunarGold.copy(alpha = alpha)
    val c3 = FoolmoonColors.SkyGlow.copy(alpha = alpha)
    val c4 = FoolmoonColors.GeminiViolet.copy(alpha = alpha)
    val palette = if (shift > 0.5f) listOf(c1, c2, c3, c4, c1) else listOf(c3, c4, c1, c2, c3)
    return Brush.sweepGradient(colors = palette, center = center)
}

/**
 * Tactile dark paper canvas matching Foolmoon Desktop's black-paper-crimson surface material.
 */
@Composable
fun DesktopPaperSurface(
    modifier: Modifier = Modifier,
    glowIntensity: Float = 0.22f,
    content: @Composable () -> Unit
) {
    val phase = rememberGeminiAuraPhase(7000)
    Box(modifier = modifier.background(FoolmoonColors.Obsidian)) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height

            // Subtle ambient top crimson paper wash
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        FoolmoonColors.Crimson.copy(alpha = glowIntensity * 0.55f),
                        Color.Transparent
                    ),
                    center = Offset(w * (0.25f + 0.1f * cos(phase)), h * 0.08f),
                    radius = w * 0.85f
                ),
                radius = w * 0.85f,
                center = Offset(w * 0.25f, h * 0.08f)
            )
            // Subtle bottom Gemini blue/gold warmth near composer dock
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        FoolmoonColors.SkyGlow.copy(alpha = glowIntensity * 0.35f),
                        Color.Transparent
                    ),
                    center = Offset(w * 0.8f, h * 0.92f),
                    radius = w * 0.75f
                ),
                radius = w * 0.75f,
                center = Offset(w * 0.8f, h * 0.92f)
            )

            // Deterministic matte black-paper fiber stippling (lightweight, crisp 1px grains)
            val step = 42f
            var y = 14f
            var row = 0
            while (y < h) {
                var x = if (row % 2 == 0) 12f else 31f
                while (x < w) {
                    val hash = ((x.toInt() * 73856093) xor (y.toInt() * 19349663)) and 0xFF
                    val a = if (hash > 180) 0.055f else 0.025f
                    val col = if (hash > 220) FoolmoonColors.Cream.copy(alpha = a)
                    else FoolmoonColors.Border.copy(alpha = a * 2.1f)
                    drawCircle(color = col, radius = 1.15f, center = Offset(x, y))
                    x += step
                }
                y += step
                row++
            }
        }
        content()
    }
}

/**
 * Gemini-style pulsing audio-reactive orb with animated fluid 5-bar waveform.
 */
@Composable
fun GeminiVoiceWaveOrb(
    isListening: Boolean,
    isSpeaking: Boolean,
    isThinking: Boolean,
    audioLevel: Float,
    size: Dp = 48.dp,
    onClick: () -> Unit
) {
    val phase = rememberGeminiAuraPhase(2000)
    val transition = rememberInfiniteTransition(label = "orb_pulse")
    val pulse by transition.animateFloat(
        initialValue = 0.94f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 900, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse"
    )
    val active = isListening || isSpeaking || isThinking

    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val cx = this.size.width / 2f
            val cy = this.size.height / 2f
            val baseR = (this.size.minDimension / 2f) * 0.86f
            val auraR = baseR * (if (active) pulse + audioLevel * 0.14f else 1.0f)

            drawCircle(
                brush = geminiSweepBrush(phase, center = Offset(cx, cy), alpha = if (active) 0.95f else 0.45f),
                radius = auraR,
                center = Offset(cx, cy),
                style = Stroke(width = if (active) 4.dp.toPx() else 2.dp.toPx())
            )
            drawCircle(
                color = when {
                    isListening -> FoolmoonColors.Emerald.copy(alpha = 0.24f)
                    isSpeaking -> FoolmoonColors.Crimson.copy(alpha = 0.24f)
                    isThinking -> FoolmoonColors.LunarGold.copy(alpha = 0.20f)
                    else -> FoolmoonColors.SurfaceElevated
                },
                radius = baseR * 0.88f,
                center = Offset(cx, cy)
            )

            // Animated 5-bar fluid wave when listening / speaking / thinking
            val barCount = 5
            val barWidth = 2.6.dp.toPx()
            val gap = 3.2.dp.toPx()
            val totalW = barCount * barWidth + (barCount - 1) * gap
            val startX = cx - totalW / 2f
            for (i in 0 until barCount) {
                val amp = when {
                    isListening || isSpeaking -> {
                        val wave = (sin(phase * 2.5f + i * 1.15f) + 1f) * 0.5f
                        (0.28f + wave * (0.45f + audioLevel * 0.55f)).coerceIn(0.22f, 1f)
                    }
                    isThinking -> {
                        val wave = (sin(phase * 2f + i * 0.9f) + 1f) * 0.5f
                        0.25f + wave * 0.55f
                    }
                    else -> 0.25f + (if (i == 2) 0.30f else if (i == 1 || i == 3) 0.16f else 0f)
                }
                val maxBarH = baseR * 0.95f
                val barH = maxBarH * amp
                val bx = startX + i * (barWidth + gap)
                val barColor = when {
                    isListening -> FoolmoonColors.Emerald
                    isSpeaking -> FoolmoonColors.LunarGold
                    isThinking -> FoolmoonColors.SkyGlow
                    else -> FoolmoonColors.Crimson
                }
                drawRoundRect(
                    color = barColor,
                    topLeft = Offset(bx, cy - barH / 2f),
                    size = Size(barWidth, barH),
                    cornerRadius = CornerRadius(barWidth, barWidth)
                )
            }
        }
    }
}

/**
 * Animated shimmering bar shown inside the chat stream while Foolmoon is computing or thinking.
 */
@Composable
fun GeminiThinkingShimmerBar(
    label: String = "Foolmoon düşünüyor…",
    modifier: Modifier = Modifier
) {
    val phase = rememberGeminiAuraPhase(1800)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(FoolmoonColors.SurfaceCard)
            .border(
                width = 1.2.dp,
                brush = geminiSweepBrush(phase, alpha = 0.75f),
                shape = RoundedCornerShape(18.dp)
            )
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Icon(
            imageVector = Icons.Default.AutoAwesome,
            contentDescription = null,
            tint = FoolmoonColors.LunarGold,
            modifier = Modifier.size(18.dp)
        )
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(label, color = FoolmoonColors.Cream, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(4.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(
                        Brush.horizontalGradient(
                            colors = listOf(
                                FoolmoonColors.Crimson.copy(alpha = 0.35f + 0.55f * ((sin(phase) + 1f) * 0.5f)),
                                FoolmoonColors.LunarGold.copy(alpha = 0.7f),
                                FoolmoonColors.SkyGlow.copy(alpha = 0.35f + 0.55f * ((cos(phase) + 1f) * 0.5f))
                            )
                        )
                    )
            )
        }
    }
}

/**
 * Interactive Google Gemini / Circle-to-Search style overlay.
 * Lets the user circle/lasso ANY area on the captured screen (or tap detected elements)
 * and immediately Ask Foolmoon, Search on Google, Call a highlighted phone number, or Copy text.
 */
@Composable
fun CircleToSearchOverlay(
    capturedBitmap: Bitmap?,
    capturedNodes: List<ScreenElementNode>,
    fallbackScreenText: String,
    onDismiss: () -> Unit,
    onAskAboutSelection: (selectedText: String, userQuestion: String) -> Unit,
    onSearchWeb: (query: String) -> Unit,
    onCallTarget: (number: String) -> Unit
) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val phase = rememberGeminiAuraPhase(2600)

    val strokePoints = remember { mutableStateListOf<Offset>() }
    var containerSize by remember { mutableStateOf(IntSize(1080, 2400)) }
    var selectedText by remember { mutableStateOf("") }
    var selectionBox by remember { mutableStateOf<androidx.compose.ui.geometry.Rect?>(null) }
    var questionDraft by remember { mutableStateOf("") }
    var copiedNotice by remember { mutableStateOf(false) }

    val dm = context.resources.displayMetrics
    val screenW = dm.widthPixels.coerceAtLeast(1)
    val screenH = dm.heightPixels.coerceAtLeast(1)

    fun extractFromCanvasBox(box: androidx.compose.ui.geometry.Rect): String {
        val sx = screenW.toFloat() / containerSize.width.coerceAtLeast(1).toFloat()
        val sy = screenH.toFloat() / containerSize.height.coerceAtLeast(1).toFloat()
        val rectPx = AndroidRect(
            (box.left * sx).toInt().coerceAtLeast(0),
            (box.top * sy).toInt().coerceAtLeast(0),
            (box.right * sx).toInt().coerceAtLeast(10),
            (box.bottom * sy).toInt().coerceAtLeast(10)
        )
        // Prefer matching from live/cached nodes directly first
        val matchingNodes = capturedNodes.filter { n ->
            AndroidRect.intersects(rectPx, n.bounds) ||
                rectPx.contains(n.bounds.centerX(), n.bounds.centerY()) ||
                n.bounds.contains(rectPx.centerX(), rectPx.centerY())
        }
        val chosen = if (matchingNodes.isNotEmpty()) {
            matchingNodes
        } else {
            val cx = rectPx.centerX()
            val cy = rectPx.centerY()
            capturedNodes.sortedBy { abs(it.bounds.centerX() - cx) + abs(it.bounds.centerY() - cy) }.take(4)
        }
        val svcText = FoolmoonAccessibilityService.current()?.extractTextInBounds(rectPx, capturedNodes).orEmpty()
        val combined = chosen.mapNotNull { it.bestLabel.takeIf { lbl -> lbl.isNotBlank() } }.distinct().joinToString("\n")
        return svcText.ifBlank { combined }.ifBlank { fallbackScreenText }.trim()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xF00B090A))
            .onSizeChanged { containerSize = it }
    ) {
        // 1. Captured screenshot background or wireframe map of screen elements
        if (capturedBitmap != null) {
            Image(
                bitmap = capturedBitmap.asImageBitmap(),
                contentDescription = "Captured screen",
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize(),
                alpha = 0.72f
            )
        } else {
            // Wireframe visualization of captured UI nodes so Circle-to-Search always has rich targets
            Canvas(modifier = Modifier.fillMaxSize()) {
                val sx = size.width / screenW.toFloat()
                val sy = size.height / screenH.toFloat()
                capturedNodes.forEach { n ->
                    val l = n.bounds.left * sx
                    val t = n.bounds.top * sy
                    val r = n.bounds.right * sx
                    val b = n.bounds.bottom * sy
                    drawRoundRect(
                        color = FoolmoonColors.Border.copy(alpha = 0.55f),
                        topLeft = Offset(l, t),
                        size = Size((r - l).coerceAtLeast(4f), (b - t).coerceAtLeast(4f)),
                        cornerRadius = CornerRadius(8f, 8f),
                        style = Stroke(width = 1.dp.toPx())
                    )
                }
            }
        }

        // Subtle luminous Gemini border around entire screen frame
        Box(
            modifier = Modifier
                .fillMaxSize()
                .border(
                    width = 3.dp,
                    brush = geminiSweepBrush(phase, alpha = 0.85f),
                    shape = RoundedCornerShape(0.dp)
                )
        )

        // 2. Interactive Lasso / Circle Gesture Layer
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    detectDragGestures(
                        onDragStart = { offset ->
                            strokePoints.clear()
                            strokePoints.add(offset)
                            selectionBox = null
                            copiedNotice = false
                        },
                        onDrag = { change, _ ->
                            change.consume()
                            strokePoints.add(change.position)
                        },
                        onDragEnd = {
                            if (strokePoints.isNotEmpty()) {
                                val minX = strokePoints.minOf { it.x }
                                val maxX = strokePoints.maxOf { it.x }
                                val minY = strokePoints.minOf { it.y }
                                val maxY = strokePoints.maxOf { it.y }
                                val padded = androidx.compose.ui.geometry.Rect(
                                    (minX - 24f).coerceAtLeast(0f),
                                    (minY - 24f).coerceAtLeast(0f),
                                    (maxX + 24f).coerceAtLeast(minX + 60f),
                                    (maxY + 24f).coerceAtLeast(minY + 60f)
                                )
                                selectionBox = padded
                                selectedText = extractFromCanvasBox(padded)
                            }
                        }
                    )
                }
        ) {
            if (strokePoints.size > 1) {
                val path = Path().apply {
                    moveTo(strokePoints.first().x, strokePoints.first().y)
                    for (i in 1 until strokePoints.size) {
                        lineTo(strokePoints[i].x, strokePoints[i].y)
                    }
                }
                // Outer halo stroke
                drawPath(
                    path = path,
                    brush = geminiSweepBrush(phase, alpha = 0.45f),
                    style = Stroke(width = 14.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                )
                // Crisp laser core stroke
                drawPath(
                    path = path,
                    brush = geminiSweepBrush(phase, alpha = 1f),
                    style = Stroke(width = 5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                )
            }

            selectionBox?.let { box ->
                drawRoundRect(
                    brush = geminiSweepBrush(phase, alpha = 0.95f),
                    topLeft = Offset(box.left, box.top),
                    size = Size(box.width, box.height),
                    cornerRadius = CornerRadius(18.dp.toPx(), 18.dp.toPx()),
                    style = Stroke(width = 2.5.dp.toPx())
                )
                drawRoundRect(
                    color = FoolmoonColors.Crimson.copy(alpha = 0.14f),
                    topLeft = Offset(box.left, box.top),
                    size = Size(box.width, box.height),
                    cornerRadius = CornerRadius(18.dp.toPx(), 18.dp.toPx())
                )
            }
        }

        // 3. Top Control Pill
        Row(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .statusBarsPadding()
                .padding(horizontal = 14.dp, vertical = 12.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(FoolmoonColors.SurfaceCard.copy(alpha = 0.92f))
                .border(1.dp, FoolmoonColors.Border, RoundedCornerShape(24.dp))
                .padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(Icons.Default.CropFree, contentDescription = null, tint = FoolmoonColors.LunarGold, modifier = Modifier.size(18.dp))
            Text(
                text = "Aramak veya sormak için ekranda daire içine alın",
                color = FoolmoonColors.Cream,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.weight(1f)
            )
            IconButton(onClick = onDismiss, modifier = Modifier.size(28.dp)) {
                Icon(Icons.Default.Close, contentDescription = "Kapat", tint = FoolmoonColors.Muted)
            }
        }

        // 4. Detected screen element quick-select chips + Bottom Gemini Result Sheet
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            val chipLabels = remember(capturedNodes, fallbackScreenText) {
                val fromNodes = capturedNodes.mapNotNull { it.bestLabel.takeIf { s -> s.length in 2..42 } }.distinct().take(8)
                if (fromNodes.isNotEmpty()) fromNodes
                else fallbackScreenText.lines().map { it.trim() }.filter { it.length in 2..42 }.distinct().take(6)
            }
            if (chipLabels.isNotEmpty()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    chipLabels.forEach { lbl ->
                        FilterChip(
                            selected = selectedText.contains(lbl),
                            onClick = {
                                selectedText = lbl
                                copiedNotice = false
                            },
                            label = { Text(lbl, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                        )
                    }
                }
            }

            AnimatedVisibility(
                visible = selectedText.isNotBlank() || strokePoints.isEmpty(),
                enter = slideInVertically { it } + fadeIn(),
                exit = slideOutVertically { it } + fadeOut()
            ) {
                Surface(
                    shape = RoundedCornerShape(24.dp),
                    color = FoolmoonColors.SurfaceCard.copy(alpha = 0.96f),
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.3.dp, geminiSweepBrush(phase, alpha = 0.8f), RoundedCornerShape(24.dp))
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        val effectiveSelection = selectedText.ifBlank { fallbackScreenText.ifBlank { "Ekrandaki aktif içerik" } }
                        Text(
                            text = if (selectedText.isNotBlank()) "Seçilen Alan:" else "Daire çizin veya aşağıdan seçin:",
                            color = FoolmoonColors.LunarGold,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = effectiveSelection.take(260),
                            color = FoolmoonColors.Cream,
                            fontSize = 13.sp,
                            maxLines = 4,
                            overflow = TextOverflow.Ellipsis
                        )

                        // Quick Gemini action pills for the selection
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Button(
                                onClick = {
                                    onAskAboutSelection(
                                        effectiveSelection,
                                        questionDraft.trim().ifBlank { "Ekranda seçtiğim bu alan ne hakkında? Açıkla." }
                                    )
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = FoolmoonColors.Crimson),
                                shape = RoundedCornerShape(18.dp)
                            ) {
                                Icon(Icons.Default.AutoAwesome, contentDescription = null, modifier = Modifier.size(15.dp))
                                Spacer(Modifier.width(6.dp))
                                Text("AI'a Sor", fontSize = 12.sp)
                            }
                            OutlinedButton(
                                onClick = { onSearchWeb(effectiveSelection.lines().firstOrNull().orEmpty().ifBlank { effectiveSelection }) },
                                shape = RoundedCornerShape(18.dp)
                            ) {
                                Icon(Icons.Default.Search, contentDescription = null, modifier = Modifier.size(15.dp))
                                Spacer(Modifier.width(6.dp))
                                Text("Web'de Ara", fontSize = 12.sp)
                            }

                            val detectedPhone = Regex("\\+?\\d[\\d\\s\\-()]{5,}").find(effectiveSelection)?.value?.trim()
                            if (!detectedPhone.isNullOrBlank()) {
                                OutlinedButton(
                                    onClick = { onCallTarget(detectedPhone) },
                                    shape = RoundedCornerShape(18.dp)
                                ) {
                                    Icon(Icons.Default.Call, contentDescription = null, modifier = Modifier.size(15.dp), tint = FoolmoonColors.Emerald)
                                    Spacer(Modifier.width(6.dp))
                                    Text("Ara", fontSize = 12.sp)
                                }
                            }

                            OutlinedButton(
                                onClick = {
                                    clipboard.setText(AnnotatedString(effectiveSelection))
                                    copiedNotice = true
                                },
                                shape = RoundedCornerShape(18.dp)
                            ) {
                                Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(14.dp))
                                Spacer(Modifier.width(5.dp))
                                Text(if (copiedNotice) "Kopyalandı" else "Kopyala", fontSize = 12.sp)
                            }
                        }

                        // Follow-up question bar right inside selection card
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            OutlinedTextField(
                                value = questionDraft,
                                onValueChange = { questionDraft = it },
                                placeholder = { Text("Seçili alan hakkında soru sor…", fontSize = 12.sp, color = FoolmoonColors.Muted) },
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(18.dp),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = FoolmoonColors.Crimson,
                                    unfocusedBorderColor = FoolmoonColors.Border,
                                    focusedTextColor = FoolmoonColors.Cream,
                                    unfocusedTextColor = FoolmoonColors.Cream
                                )
                            )
                            IconButton(
                                onClick = {
                                    val q = questionDraft.trim().ifBlank { "Bu seçili içeriği analiz et ve özetle." }
                                    onAskAboutSelection(effectiveSelection, q)
                                },
                                modifier = Modifier
                                    .size(42.dp)
                                    .clip(CircleShape)
                                    .background(FoolmoonColors.Crimson)
                            ) {
                                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Sor", tint = Color.White, modifier = Modifier.size(18.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}
