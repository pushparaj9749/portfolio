package com.kriya.app.engine

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

/** Pure time helpers — all unit-testable without Android. */
object Schedule {

    const val EVERY_DAY = "1,2,3,4,5,6,7"

    /** Parses "07:30" / "7:5" tolerant of whitespace; returns null when invalid. */
    fun parseTime(raw: String): LocalTime? {
        val cleaned = raw.trim()
        if (cleaned.isEmpty()) return null
        val parts = cleaned.split(":")
        if (parts.size != 2) return null
        val h = parts[0].trim().toIntOrNull() ?: return null
        val m = parts[1].trim().toIntOrNull() ?: return null
        if (h !in 0..23 || m !in 0..59) return null
        return LocalTime.of(h, m)
    }

    fun formatTime(hour: Int, minute: Int): String =
        "%02d:%02d".format(((hour % 24) + 24) % 24, ((minute % 60) + 60) % 60)

    /** ISO day numbers (1 = Monday ... 7 = Sunday) parsed from "1,3,5". Empty = every day. */
    fun parseDays(raw: String): Set<Int> {
        val out = raw.split(",").mapNotNull { it.trim().toIntOrNull() }.filter { it in 1..7 }.toSet()
        return out.ifEmpty { (1..7).toSet() }
    }

    fun encodeDays(days: Set<Int>): String =
        if (days.isEmpty() || days.size == 7) EVERY_DAY else days.sorted().joinToString(",")

    fun dayLabel(days: Set<Int>): String {
        val d = if (days.isEmpty()) (1..7).toSet() else days
        return when {
            d.size == 7 -> "Every day"
            d == setOf(1, 2, 3, 4, 5) -> "Weekdays"
            d == setOf(6, 7) -> "Weekends"
            else -> d.sorted().joinToString(" ") { shortDay(it) }
        }
    }

    fun shortDay(iso: Int): String = when (iso) {
        1 -> "Mon"; 2 -> "Tue"; 3 -> "Wed"; 4 -> "Thu"; 5 -> "Fri"; 6 -> "Sat"; else -> "Sun"
    }

    fun dayMatches(days: Set<Int>, dow: DayOfWeek): Boolean {
        val set = if (days.isEmpty()) (1..7).toSet() else days
        return dow.value in set
    }

    /**
     * Next moment the macro should fire after [from], honouring the selected weekdays.
     * Returns null when [time] cannot be parsed.
     */
    fun nextOccurrence(
        time: String,
        days: Set<Int>,
        from: LocalDateTime,
        zone: ZoneId = ZoneId.systemDefault()
    ): LocalDateTime? {
        val t = parseTime(time) ?: return null
        val set = if (days.isEmpty()) (1..7).toSet() else days
        for (offset in 0..7) {
            val candidateDate: LocalDate = from.toLocalDate().plusDays(offset.toLong())
            if (!dayMatches(set, candidateDate.dayOfWeek)) continue
            val candidate = LocalDateTime.of(candidateDate, t)
            if (candidate.isAfter(from)) return candidate
        }
        return null
    }

    /** Battery trigger: 0 = fire on decrease, 1 = fire on increase, 2 = every change. */
    fun batteryCrosses(level: Int, threshold: Int, direction: Int, previous: Int): Boolean {
        if (direction == 2) return true
        if (previous < 0) return false
        return if (direction == 1) previous < threshold && level >= threshold
        else previous > threshold && level <= threshold
    }
}
