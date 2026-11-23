package com.foolmoon.mobile

import com.foolmoon.mobile.wakeword.WakeWordMatcher
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FoolmoonCoreTest {

    @Test
    fun wakeWordMatchesDirectAndPhoneticVariants() {
        val direct = WakeWordMatcher.match("Hey Foolmoon set a 5 minute timer")
        assertTrue(direct.matched)
        assertEquals("set a 5 minute timer", direct.trailingCommand)

        val phonetic = WakeWordMatcher.match("hey full moon open spotify")
        assertTrue(phonetic.matched)
        assertEquals("open spotify", phonetic.trailingCommand)

        val turkishVariant = WakeWordMatcher.match("Hey fulmun bugünkü notlarımı oku")
        assertTrue(turkishVariant.matched)
        assertEquals("bugunku notlarimi oku", turkishVariant.trailingCommand)

        val fuzzy = WakeWordMatcher.match("hey foolmon check battery")
        assertTrue(fuzzy.matched)
        assertEquals("check battery", fuzzy.trailingCommand)
    }

    @Test
    fun wakeWordIgnoresUnrelatedSpeech() {
        val res = WakeWordMatcher.match("hello world how is the weather today")
        assertFalse(res.matched)
    }

    @Test
    fun wakeWordSupportsCustomPhrase() {
        val res = WakeWordMatcher.match("Hey Jarvis remind me to call Alex", customPhrase = "hey jarvis")
        assertTrue(res.matched)
        assertEquals("remind me to call alex", res.trailingCommand)
    }
}
