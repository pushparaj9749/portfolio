package com.kriya.app.engine

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.kriya.app.data.Macro
import com.kriya.app.data.Prefs
import com.kriya.app.data.TriggerType
import java.time.LocalDateTime
import java.time.ZoneId

/** Exact-ish scheduling for time triggers with a graceful fallback when exact alarms are denied. */
object Scheduling {

    const val EXTRA_MACRO_ID = "macro_id"
    const val ACTION_FIRE = "com.kriya.app.action.FIRE_TIME"

    fun canScheduleExact(context: Context): Boolean {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) am.canScheduleExactAlarms() else true
    }

    fun rescheduleAll(context: Context) {
        val prefs = Prefs(context)
        prefs.loadMacros().filter { it.enabled }.forEach { schedule(context, it) }
    }

    fun schedule(context: Context, macro: Macro) {
        val trigger = macro.triggers.firstOrNull { it.type == TriggerType.TIME } ?: return
        if (!macro.enabled) {
            cancel(context, macro.id)
            return
        }
        val next = Schedule.nextOccurrence(
            trigger.s("time"),
            Schedule.parseDays(trigger.s("days")),
            LocalDateTime.now(),
            ZoneId.systemDefault()
        ) ?: return

        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val atMillis = next.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        val pi = pending(context, macro.id)
        val exact = canScheduleExact(context)
        try {
            if (exact) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pi)
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pi)
            }
        } catch (_: SecurityException) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pi)
        }
    }

    fun cancel(context: Context, macroId: String) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(pending(context, macroId))
    }

    private fun pending(context: Context, macroId: String): PendingIntent {
        val intent = Intent(context, ScheduleReceiver::class.java).apply {
            action = ACTION_FIRE
            putExtra(EXTRA_MACRO_ID, macroId)
        }
        return PendingIntent.getBroadcast(
            context,
            macroId.hashCode(),
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
    }

    /** Human "next run" label for the home screen. */
    fun nextRunLabel(context: Context, macro: Macro): String? {
        val trigger = macro.triggers.firstOrNull { it.type == TriggerType.TIME } ?: return null
        if (!macro.enabled) return null
        val next = Schedule.nextOccurrence(
            trigger.s("time"),
            Schedule.parseDays(trigger.s("days")),
            LocalDateTime.now()
        ) ?: return null
        val today = LocalDateTime.now().toLocalDate()
        val day = when (next.toLocalDate()) {
            today -> "Today"
            today.plusDays(1) -> "Tomorrow"
            else -> Schedule.shortDay(next.dayOfWeek.value)
        }
        return "$day ${Catalog.format12(next.toLocalTime())}"
    }
}
