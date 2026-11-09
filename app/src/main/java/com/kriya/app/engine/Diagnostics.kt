package com.kriya.app.engine

import com.kriya.app.data.ActionType
import com.kriya.app.data.ConstraintType
import com.kriya.app.data.Macro
import com.kriya.app.data.TriggerType

enum class Severity { ERROR, WARN, INFO }

data class Finding(
    val severity: Severity,
    val title: String,
    val detail: String,
    val fix: String
)

/**
 * The "why didn't my automation run?" checker. MacroDroid users lose hours to silently
 * missing special access; Kriya inspects every macro against live permission state and
 * says exactly which one is missing.
 */
object Diagnostics {

    fun inspect(
        macros: List<Macro>,
        granted: Set<String>,
        batteryOptimised: Boolean,
        serviceRunning: Boolean
    ): List<Finding> {
        val out = ArrayList<Finding>()

        if (!granted.contains(Perms.NOTIFICATIONS)) {
            out += Finding(
                Severity.WARN,
                "Notifications are blocked",
                "Macros still run, but Kriya cannot tell you when something fails.",
                "Allow notifications"
            )
        }
        if (batteryOptimised) {
            out += Finding(
                Severity.ERROR,
                "Battery optimisation can kill Kriya",
                "Android may freeze Kriya in the background, which is the #1 cause of missed automations on phones from Xiaomi, Oppo, Vivo and Samsung.",
                "Turn off battery optimisation"
            )
        }
        if (macros.isNotEmpty() && !serviceRunning) {
            out += Finding(
                Severity.ERROR,
                "Background engine is not running",
                "Kriya needs its small foreground service to notice triggers instantly.",
                "Start the engine"
            )
        }
        val needsUsage = macros.any { m ->
            m.triggers.any { it.type == TriggerType.APP } || m.actions.any { it.type == ActionType.OPEN_APP }
        }
        if (needsUsage && !granted.contains(Perms.USAGE_ACCESS)) {
            out += Finding(
                Severity.WARN,
                "App triggers need usage access",
                "Kriya reads which app came to the foreground using Android's usage-access setting.",
                "Grant usage access"
            )
        }

        macros.forEach { m ->
            if (m.triggers.isEmpty()) {
                out += Finding(
                    Severity.ERROR,
                    "\"${m.name}\" has no trigger",
                    "A macro without a trigger can only be run by hand.",
                    "Open the macro and add a trigger"
                )
            }
            if (m.actions.isEmpty()) {
                out += Finding(
                    Severity.ERROR,
                    "\"${m.name}\" has no action",
                    "The trigger fires but there is nothing to do.",
                    "Add at least one action"
                )
            }
            if (!m.enabled) {
                out += Finding(
                    Severity.INFO,
                    "\"${m.name}\" is switched off",
                    "Disabled macros never run, including from shortcuts.",
                    "Enable the macro"
                )
            }
            m.triggers.forEach { t ->
                if (t.type == TriggerType.TIME && Schedule.parseTime(t.s("time")) == null) {
                    out += Finding(
                        Severity.ERROR,
                        "\"${m.name}\" has an invalid time",
                        "The time \"${t.s("time")}\" cannot be parsed, so the schedule never fires.",
                        "Fix the time"
                    )
                }
                if (t.type == TriggerType.APP && t.s("package").isBlank()) {
                    out += Finding(
                        Severity.ERROR,
                        "\"${m.name}\" has no app selected",
                        "The app trigger is empty.",
                        "Pick an app"
                    )
                }
                if (t.type == TriggerType.BATTERY && t.i("percent", -1) !in 1..100) {
                    out += Finding(
                        Severity.ERROR,
                        "\"${m.name}\" has an invalid battery level",
                        "Battery level must be between 1 and 100.",
                        "Fix the level"
                    )
                }
            }
            m.actions.forEach { a ->
                if (a.type == ActionType.OPEN_APP && a.s("package").isBlank()) {
                    out += Finding(
                        Severity.ERROR,
                        "\"${m.name}\" cannot open an app",
                        "No app target is selected for the launch action.",
                        "Pick an app"
                    )
                }
                if (a.type == ActionType.TTS && a.s("text").isBlank()) {
                    out += Finding(
                        Severity.WARN,
                        "\"${m.name}\" speaks an empty phrase",
                        "Speak-text will do nothing until it has some text.",
                        "Add the phrase"
                    )
                }
            }
            m.constraints.forEach { c ->
                if (c.type == ConstraintType.BATTERY_AT_LEAST && c.i("percent", -1) !in 1..100) {
                    out += Finding(
                        Severity.ERROR,
                        "\"${m.name}\" has an impossible constraint",
                        "A battery constraint outside 1–100 can never be true.",
                        "Fix the battery level"
                    )
                }
            }
        }

        if (out.isEmpty()) {
            out += Finding(
                Severity.INFO,
                "Everything looks healthy",
                "All checks passed. If a macro still does not run, open its card and use Test so Kriya can show the exact step that failed.",
                ""
            )
        }
        return out.sortedBy { it.severity.ordinal }
    }
}

/** Permission keys used by Diagnostics (strings so the module stays Android-agnostic). */
object Perms {
    const val NOTIFICATIONS = "notifications"
    const val USAGE_ACCESS = "usage_access"
    const val EXACT_ALARM = "exact_alarm"
    const val BATTERY_OPT = "battery_optimisation"
}
