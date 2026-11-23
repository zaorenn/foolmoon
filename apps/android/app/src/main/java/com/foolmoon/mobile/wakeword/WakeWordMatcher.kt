package com.foolmoon.mobile.wakeword

import java.text.Normalizer
import kotlin.math.min

/**
 * Pure-Kotlin phonetic & fuzzy wake-phrase matcher for low-latency on-device wake detection.
 * Handles common ASR phonetic variants of "Hey Foolmoon" across English & Turkish speech models
 * (e.g., "hey full moon", "fulmun", "hey fool moon", "foolmoon") AND extracts any trailing command
 * spoken in the same breath ("Hey Foolmoon set a 5 minute timer" -> "set a 5 minute timer").
 */
object WakeWordMatcher {

    data class MatchResult(
        val matched: Boolean,
        val trailingCommand: String = ""
    )

    private val defaultAliases = listOf(
        "hey foolmoon",
        "hey full moon",
        "hey fool moon",
        "hey fulmun",
        "hey ful moon",
        "ok foolmoon",
        "ok full moon",
        "foolmoon",
        "full moon",
        "fulmun"
    )

    fun normalize(text: String): String {
        val folded = text
            .replace('ı', 'i')
            .replace('İ', 'i')
            .lowercase()
        val decomposed = Normalizer.normalize(folded, Normalizer.Form.NFD)
        val noDiacritics = decomposed.replace(Regex("\\p{InCombiningDiacriticalMarks}+"), "")
        return noDiacritics
            .replace(Regex("[^a-z0-9\\s]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    fun match(transcript: String, customPhrase: String = "hey foolmoon"): MatchResult {
        val normTranscript = normalize(transcript)
        if (normTranscript.isBlank()) return MatchResult(false)

        val candidates = buildList {
            val normCustom = normalize(customPhrase)
            if (normCustom.isNotBlank()) add(normCustom)
            addAll(defaultAliases)
        }.distinct().sortedByDescending { it.length }

        // 1. Direct substring match with trailing command extraction
        for (phrase in candidates) {
            val idx = normTranscript.indexOf(phrase)
            if (idx >= 0) {
                val after = normTranscript.substring(idx + phrase.length).trim()
                return MatchResult(true, after)
            }
        }

        // 2. Sliding-window fuzzy Levenshtein match for noisy rooms / accents
        val words = normTranscript.split(" ")
        for (phrase in candidates.take(4)) {
            val pWords = phrase.split(" ")
            val winSize = pWords.size
            if (words.size < winSize) continue
            for (start in 0..(words.size - winSize)) {
                val window = words.subList(start, start + winSize).joinToString(" ")
                val dist = levenshtein(window, phrase)
                val maxAllowed = if (phrase.length >= 10) 2 else 1
                if (dist <= maxAllowed) {
                    val trailing = words.drop(start + winSize).joinToString(" ").trim()
                    return MatchResult(true, trailing)
                }
            }
        }

        return MatchResult(false)
    }

    fun levenshtein(a: String, b: String): Int {
        if (a == b) return 0
        if (a.isEmpty()) return b.length
        if (b.isEmpty()) return a.length
        val prev = IntArray(b.length + 1) { it }
        val curr = IntArray(b.length + 1)
        for (i in 1..a.length) {
            curr[0] = i
            for (j in 1..b.length) {
                val cost = if (a[i - 1] == b[j - 1]) 0 else 1
                curr[j] = min(min(curr[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost)
            }
            System.arraycopy(curr, 0, prev, 0, prev.size)
        }
        return prev[b.length]
    }
}
