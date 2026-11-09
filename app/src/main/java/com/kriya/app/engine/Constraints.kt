package com.kriya.app.engine

import com.kriya.app.data.ConstraintSpec
import com.kriya.app.data.ConstraintType
import java.time.DayOfWeek

/**
 * A snapshot of everything a constraint can look at. Keeping it a plain data class means
 * constraint logic is fully testable and the UI can show a *live* "would this run now?"
 * preview without touching the engine.
 */
data class DeviceSnapshot(
    val charging: Boolean = false,
    val wifiSsid: String? = null,
    val screenOn: Boolean = true,
    val batteryPercent: Int = 100,
    val dayOfWeek: DayOfWeek = DayOfWeek.MONDAY,
    val hour: Int = 12
)

data class ConstraintResult(val allowed: Boolean, val blockedBy: ConstraintSpec?)

object Constraints {

    fun evaluate(constraints: List<ConstraintSpec>, state: DeviceSnapshot): ConstraintResult {
        constraints.forEach { c ->
            if (!passes(c, state)) return ConstraintResult(false, c)
        }
        return ConstraintResult(true, null)
    }

    fun passes(c: ConstraintSpec, state: DeviceSnapshot): Boolean = when (c.type) {
        ConstraintType.CHARGING -> state.charging == c.b("charging", true)
        ConstraintType.SCREEN_LOCKED -> state.screenOn == c.b("unlocked", false).not()
        ConstraintType.BATTERY_AT_LEAST -> state.batteryPercent >= c.i("percent", 20)
        ConstraintType.WIFI_NAMED -> {
            val wanted = c.s("ssid").trim()
            wanted.isEmpty() || (state.wifiSsid?.trim()?.equals(wanted, ignoreCase = true) == true)
        }
        ConstraintType.DAYS_OF_WEEK -> Schedule.dayMatches(Schedule.parseDays(c.s("days")), state.dayOfWeek)
    }

    fun describe(c: ConstraintSpec): String = when (c.type) {
        ConstraintType.CHARGING -> if (c.b("charging", true)) "Charging" else "On battery"
        ConstraintType.SCREEN_LOCKED -> if (c.b("unlocked", false)) "Screen unlocked" else "Screen locked"
        ConstraintType.BATTERY_AT_LEAST -> "Battery ≥ ${c.i("percent", 20)}%"
        ConstraintType.WIFI_NAMED -> c.s("ssid").ifBlank { "Any Wi-Fi" }.let { "Wi-Fi: $it" }
        ConstraintType.DAYS_OF_WEEK -> Schedule.dayLabel(Schedule.parseDays(c.s("days")))
    }
}
