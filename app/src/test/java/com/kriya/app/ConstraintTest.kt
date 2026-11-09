package com.kriya.app

import com.kriya.app.data.ConstraintSpec
import com.kriya.app.data.ConstraintType
import com.kriya.app.engine.Constraints
import com.kriya.app.engine.DeviceSnapshot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.DayOfWeek

class ConstraintTest {

    private val pluggedIn = DeviceSnapshot(charging = true, batteryPercent = 80)
    private val onBattery = DeviceSnapshot(charging = false, batteryPercent = 15)

    @Test
    fun chargingConstraint() {
        val charging = ConstraintSpec(ConstraintType.CHARGING, mapOf("charging" to "1"))
        assertTrue(Constraints.passes(charging, pluggedIn))
        assertFalse(Constraints.passes(charging, onBattery))
    }

    @Test
    fun emptyConstraintListAllows() {
        val result = Constraints.evaluate(emptyList(), pluggedIn)
        assertTrue(result.allowed)
        assertNull(result.blockedBy)
    }

    @Test
    fun reportsTheBlockingConstraint() {
        val list = listOf(
            ConstraintSpec(ConstraintType.BATTERY_AT_LEAST, mapOf("percent" to "30")),
            ConstraintSpec(ConstraintType.CHARGING, mapOf("charging" to "0"))
        )
        val result = Constraints.evaluate(list, onBattery)
        assertFalse(result.allowed)
        assertEquals(ConstraintType.BATTERY_AT_LEAST, result.blockedBy?.type)
    }

    @Test
    fun batteryAtLeastBoundary() {
        val c = ConstraintSpec(ConstraintType.BATTERY_AT_LEAST, mapOf("percent" to "15"))
        assertTrue(Constraints.passes(c, onBattery))
        val higher = ConstraintSpec(ConstraintType.BATTERY_AT_LEAST, mapOf("percent" to "16"))
        assertFalse(Constraints.passes(higher, onBattery))
    }

    @Test
    fun wifiConstraintIsCaseInsensitiveAndTrimmed() {
        val c = ConstraintSpec(ConstraintType.WIFI_NAMED, mapOf("ssid" to " Home_5G "))
        assertTrue(Constraints.passes(c, DeviceSnapshot(wifiSsid = "home_5g")))
        assertFalse(Constraints.passes(c, DeviceSnapshot(wifiSsid = "Office")))
        assertFalse(Constraints.passes(c, DeviceSnapshot(wifiSsid = null)))
    }

    @Test
    fun blankWifiMeansAnyNetwork() {
        val c = ConstraintSpec(ConstraintType.WIFI_NAMED, mapOf("ssid" to ""))
        assertTrue(Constraints.passes(c, DeviceSnapshot(wifiSsid = "Anything")))
    }

    @Test
    fun screenLockedConstraint() {
        val locked = ConstraintSpec(ConstraintType.SCREEN_LOCKED, mapOf("unlocked" to "0"))
        assertTrue(Constraints.passes(locked, DeviceSnapshot(screenOn = false)))
        assertFalse(Constraints.passes(locked, DeviceSnapshot(screenOn = true)))
    }

    @Test
    fun daysOfWeekConstraint() {
        val weekend = ConstraintSpec(ConstraintType.DAYS_OF_WEEK, mapOf("days" to "6,7"))
        assertTrue(Constraints.passes(weekend, DeviceSnapshot(dayOfWeek = DayOfWeek.SATURDAY)))
        assertFalse(Constraints.passes(weekend, DeviceSnapshot(dayOfWeek = DayOfWeek.MONDAY)))
    }

    @Test
    fun describesConstraintsInPlainEnglish() {
        assertEquals("Charging", Constraints.describe(ConstraintSpec(ConstraintType.CHARGING, mapOf("charging" to "1"))))
        assertEquals("Battery ≥ 30%", Constraints.describe(ConstraintSpec(ConstraintType.BATTERY_AT_LEAST, mapOf("percent" to "30"))))
        assertEquals("Weekdays", Constraints.describe(ConstraintSpec(ConstraintType.DAYS_OF_WEEK, mapOf("days" to "1,2,3,4,5"))))
    }
}
