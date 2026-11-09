package com.kriya.app

import com.kriya.app.data.ActionSpec
import com.kriya.app.data.ActionType
import com.kriya.app.data.ConstraintSpec
import com.kriya.app.data.ConstraintType
import com.kriya.app.data.TriggerSpec
import com.kriya.app.data.TriggerType
import com.kriya.app.data.parseFlag
import com.kriya.app.engine.Catalog
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regression guard for the "1"/"0" boolean encoding used by every stored component.
 * A previous bug treated "0" as absent, which silently inverted Wi-Fi and screen triggers.
 */
class FlagTest {

    @Test
    fun parsesTheSpellingsWeActuallyStore() {
        assertTrue(parseFlag("1"))
        assertTrue(parseFlag("true"))
        assertTrue(parseFlag("ON"))
        assertFalse(parseFlag("0"))
        assertFalse(parseFlag("false"))
        assertFalse(parseFlag("off"))
    }

    @Test
    fun fallsBackWhenMissingOrJunk() {
        assertTrue(parseFlag(null, true))
        assertFalse(parseFlag(null, false))
        assertFalse(parseFlag("maybe", false))
        assertTrue(parseFlag("maybe", true))
    }

    @Test
    fun triggerSpecsReadFlags() {
        assertTrue(TriggerSpec(TriggerType.CHARGER, mapOf("plugged" to "1")).b("plugged", false))
        assertFalse(TriggerSpec(TriggerType.CHARGER, mapOf("plugged" to "0")).b("plugged", true))
        assertFalse(TriggerSpec(TriggerType.WIFI, mapOf("state" to "0")).b("state", true))
    }

    @Test
    fun constraintSpecsReadFlags() {
        assertFalse(ConstraintSpec(ConstraintType.CHARGING, mapOf("charging" to "0")).b("charging", true))
        assertTrue(ConstraintSpec(ConstraintType.SCREEN_LOCKED, mapOf("unlocked" to "1")).b("unlocked", false))
    }

    @Test
    fun actionSpecsReadFlags() {
        assertTrue(ActionSpec(ActionType.DND, mapOf("on" to "1")).b("on", false))
        assertFalse(ActionSpec(ActionType.DND, mapOf("on" to "0")).b("on", true))
    }

    @Test
    fun leaveWifiTriggerReadsCorrectly() {
        val leave = TriggerSpec(TriggerType.WIFI, mapOf("state" to "0", "ssid" to ""))
        assertEquals("When I leave Wi-Fi", Catalog.triggerTitle(leave))

        val leaveNamed = TriggerSpec(TriggerType.WIFI, mapOf("state" to "0", "ssid" to "Home"))
        assertEquals("When I leave \"Home\"", Catalog.triggerTitle(leaveNamed))
    }

    @Test
    fun numbersParseWithFallbacks() {
        val spec = TriggerSpec(TriggerType.BATTERY, mapOf("percent" to "15", "direction" to "x"))
        assertEquals(15, spec.i("percent", 0))
        assertEquals(7, spec.i("direction", 7))
        assertEquals(3, spec.i("missing", 3))
    }
}
