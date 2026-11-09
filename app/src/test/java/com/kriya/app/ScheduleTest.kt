package com.kriya.app

import com.kriya.app.data.TriggerSpec
import com.kriya.app.data.TriggerType
import com.kriya.app.engine.Catalog
import com.kriya.app.engine.Schedule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime

class ScheduleTest {

    @Test
    fun parsesValidTimes() {
        assertEquals(7, Schedule.parseTime("07:30")!!.hour)
        assertEquals(30, Schedule.parseTime("07:30")!!.minute)
        assertEquals(23, Schedule.parseTime("23:05")!!.hour)
        assertEquals(5, Schedule.parseTime("7:5")!!.minute)
        assertEquals(0, Schedule.parseTime(" 0:00 ")!!.minute)
    }

    @Test
    fun rejectsInvalidTimes() {
        assertNull(Schedule.parseTime(""))
        assertNull(Schedule.parseTime("24:00"))
        assertNull(Schedule.parseTime("07:60"))
        assertNull(Schedule.parseTime("abc"))
        assertNull(Schedule.parseTime("07-30"))
    }

    @Test
    fun formatsWithPadding() {
        assertEquals("07:05", Schedule.formatTime(7, 5))
        assertEquals("00:00", Schedule.formatTime(0, 0))
        assertEquals("23:59", Schedule.formatTime(23, 59))
        assertEquals("00:30", Schedule.formatTime(24, 30))
    }

    @Test
    fun encodeAndParseDays() {
        assertEquals(setOf(1, 2, 3, 4, 5), Schedule.parseDays("1,2,3,4,5"))
        assertEquals((1..7).toSet(), Schedule.parseDays(""))
        assertEquals((1..7).toSet(), Schedule.parseDays("9,12"))
        assertEquals("1,3,5", Schedule.encodeDays(setOf(5, 3, 1)))
        assertEquals(Schedule.EVERY_DAY, Schedule.encodeDays((1..7).toSet()))
    }

    @Test
    fun nextOccurrenceLaterToday() {
        // Monday 20 Oct 2025, 06:00 → 07:00 today
        val from = LocalDateTime.of(2025, 10, 20, 6, 0)
        val next = Schedule.nextOccurrence("07:00", (1..7).toSet(), from)!!
        assertEquals(from.toLocalDate(), next.toLocalDate())
        assertEquals(7, next.hour)
    }

    @Test
    fun nextOccurrenceRollsToTomorrow() {
        val from = LocalDateTime.of(2025, 10, 20, 8, 0)
        val next = Schedule.nextOccurrence("07:00", (1..7).toSet(), from)!!
        assertEquals(from.toLocalDate().plusDays(1), next.toLocalDate())
        assertEquals(7, next.hour)
    }

    @Test
    fun nextOccurrenceHonoursWeekdays() {
        // Friday 24 Oct 2025 09:00, weekdays only → Monday 27 Oct 07:00
        val from = LocalDateTime.of(2025, 10, 24, 9, 0)
        val next = Schedule.nextOccurrence("07:00", setOf(1, 2, 3, 4, 5), from)!!
        assertEquals(java.time.DayOfWeek.MONDAY, next.dayOfWeek)
        assertEquals(27, next.dayOfMonth)
    }

    @Test
    fun nextOccurrenceReturnsNullForBadTime() {
        assertNull(Schedule.nextOccurrence("nope", (1..7).toSet(), LocalDateTime.now()))
    }

    @Test
    fun batteryCrossingDirections() {
        assertTrue(Schedule.batteryCrosses(19, 20, 0, 21))
        assertFalse(Schedule.batteryCrosses(30, 20, 0, 31))
        assertTrue(Schedule.batteryCrosses(20, 20, 0, 21))
        assertTrue(Schedule.batteryCrosses(21, 20, 1, 19))
        assertFalse(Schedule.batteryCrosses(19, 20, 1, 18))
        assertTrue(Schedule.batteryCrosses(50, 20, 2, 50))
        // First observation never fires a crossing trigger.
        assertFalse(Schedule.batteryCrosses(10, 20, 0, -1))
    }

    @Test
    fun dayLabels() {
        assertEquals("Every day", Schedule.dayLabel((1..7).toSet()))
        assertEquals("Weekdays", Schedule.dayLabel(setOf(1, 2, 3, 4, 5)))
        assertEquals("Weekends", Schedule.dayLabel(setOf(6, 7)))
        assertEquals("Mon Wed", Schedule.dayLabel(setOf(1, 3)))
    }

    @Test
    fun triggerTitlesAreReadable() {
        val time = TriggerSpec(TriggerType.TIME, mapOf("time" to "18:30"))
        assertEquals("At 6:30 PM", Catalog.triggerTitle(time))

        val wifi = TriggerSpec(TriggerType.WIFI, mapOf("state" to "1", "ssid" to "Home"))
        assertEquals("When I join \"Home\"", Catalog.triggerTitle(wifi))

        val wifiAny = TriggerSpec(TriggerType.WIFI, mapOf("state" to "0", "ssid" to ""))
        assertEquals("When I leave Wi-Fi", Catalog.triggerTitle(wifiAny))

        val battery = TriggerSpec(TriggerType.BATTERY, mapOf("percent" to "15", "direction" to "0"))
        assertEquals("Battery drops to 15%", Catalog.triggerTitle(battery))
    }

    @Test
    fun formatTwelveHour() {
        assertEquals("12:00 AM", Catalog.format12(java.time.LocalTime.of(0, 0)))
        assertEquals("12:15 PM", Catalog.format12(java.time.LocalTime.of(12, 15)))
        assertEquals("11:59 PM", Catalog.format12(java.time.LocalTime.of(23, 59)))
    }
}
