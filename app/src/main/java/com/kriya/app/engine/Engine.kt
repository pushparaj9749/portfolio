package com.kriya.app.engine

import android.content.Context
import com.kriya.app.data.ActionSpec
import com.kriya.app.data.ConstraintSpec
import com.kriya.app.data.Macro
import com.kriya.app.data.Outcome
import com.kriya.app.data.Prefs
import com.kriya.app.data.RunLog
import com.kriya.app.data.TriggerSpec
import com.kriya.app.data.TriggerType
import java.time.LocalDateTime
import java.time.ZoneId

data class TriggerEvent(
    val type: TriggerType,
    val firingMacroId: String? = null,
    val info: Map<String, String> = emptyMap()
)

data class RunResult(
    val macroId: String,
    val macroName: String,
    val outcome: Outcome,
    val steps: List<Pair<ActionSpec, StepResult>>
) {
    val headline: String
        get() = when (outcome) {
            Outcome.SUCCESS -> "Ran ${steps.size} ${if (steps.size == 1) "action" else "actions"}"
            Outcome.SKIPPED -> "Skipped"
            Outcome.BLOCKED -> "Blocked by a constraint"
            Outcome.FAILED -> "Failed"
        }
}

/**
 * The automation runtime: decides which macros a device event matches, checks constraints,
 * runs the actions and records a human-readable outcome for every macro it touches.
 */
class Engine(private val context: Context) {

    private val prefs = Prefs(context)
    private val actions = ActionRunner(context)

    fun macros(): List<Macro> = prefs.loadMacros()

    fun enabledMacros(): List<Macro> = macros().filter { it.enabled && it.ready }

    /**
     * Fire every enabled macro whose trigger matches [event].
     * A macro id in the event means it must fire regardless of trigger matching (manual run).
     */
    fun fire(event: TriggerEvent): List<RunResult> {
        val all = macros()
        val snapshot = DeviceState.snapshot(context)
        val results = ArrayList<RunResult>()

        all.forEach { macro ->
            val forced = event.firingMacroId != null && macro.id == event.firingMacroId
            if (!macro.enabled) return@forEach
            val matches = forced || macro.triggers.any { matches(it, event) }
            if (!matches) return@forEach

            val constraintCheck = Constraints.evaluate(macro.constraints, snapshot)
            if (!constraintCheck.allowed) {
                val blocked = constraintCheck.blockedBy
                record(macro, Outcome.BLOCKED, "Constraint not met: " + (blocked?.let { Constraints.describe(it) } ?: "unknown"))
                results += RunResult(macro.id, macro.name, Outcome.BLOCKED, emptyList())
                return@forEach
            }

            val steps = ArrayList<Pair<ActionSpec, StepResult>>()
            var failed = false
            for (action in macro.actions) {
                val r = actions.run(action)
                steps += action to r
                if (!r.ok) {
                    failed = true
                    break
                }
            }
            val outcome = when {
                macro.actions.isEmpty() -> Outcome.SKIPPED
                failed -> Outcome.FAILED
                else -> Outcome.SUCCESS
            }
            val message = when (outcome) {
                Outcome.SUCCESS -> steps.joinToString(" • ") { it.second.message }
                Outcome.FAILED -> steps.lastOrNull()?.second?.message ?: "Action failed"
                else -> "No actions to run"
            }
            record(macro, outcome, message)
            results += RunResult(macro.id, macro.name, outcome, steps)
        }
        return results
    }

    fun runNow(macro: Macro): RunResult {
        val snapshot = DeviceState.snapshot(context)
        val check = Constraints.evaluate(macro.constraints, snapshot)
        if (!check.allowed) {
            val text = "Constraint not met: " + (check.blockedBy?.let { Constraints.describe(it) } ?: "unknown")
            record(macro, Outcome.BLOCKED, text)
            return RunResult(macro.id, macro.name, Outcome.BLOCKED, emptyList())
        }
        val steps = ArrayList<Pair<ActionSpec, StepResult>>()
        var failed = false
        for (action in macro.actions) {
            val r = actions.run(action)
            steps += action to r
            if (!r.ok) { failed = true; break }
        }
        val outcome = when {
            macro.actions.isEmpty() -> Outcome.SKIPPED
            failed -> Outcome.FAILED
            else -> Outcome.SUCCESS
        }
        val message = when (outcome) {
            Outcome.SUCCESS -> steps.joinToString(" • ") { it.second.message }
            Outcome.FAILED -> steps.lastOrNull()?.second?.message ?: "Action failed"
            else -> "No actions to run"
        }
        record(macro, outcome, message)
        return RunResult(macro.id, macro.name, outcome, steps)
    }

    /** Dry run: never executes an action, only explains what would happen. */
    fun dryRun(macro: Macro): List<String> {
        val snapshot = DeviceState.snapshot(context)
        val out = ArrayList<String>()
        val check = Constraints.evaluate(macro.constraints, snapshot)
        if (!check.allowed) {
            out += "🛑 Would be blocked by: ${check.blockedBy?.let { Constraints.describe(it) } ?: "constraint"}"
            return out
        }
        out += "✅ All constraints pass right now"
        macro.actions.forEachIndexed { i, a ->
            out += "${i + 1}. ${Catalog.actionTitle(a)}"
        }
        if (macro.actions.isEmpty()) out += "⚠️ No actions configured"
        return out
    }

    fun testConstraint(constraint: ConstraintSpec): Boolean =
        Constraints.passes(constraint, DeviceState.snapshot(context))

    private fun record(macro: Macro, outcome: Outcome, message: String) {
        val current = prefs.loadMacros()
        val updated = current.map { m ->
            if (m.id != macro.id) m
            else m.copy(
                runCount = m.runCount + if (outcome == Outcome.SUCCESS) 1 else 0,
                lastRunAt = System.currentTimeMillis(),
                lastResult = message
            )
        }
        prefs.saveMacros(updated)
        prefs.appendLog(
            RunLog(
                macroId = macro.id,
                macroName = macro.name,
                outcome = outcome,
                message = message
            )
        )
        EngineEvents.bump()
    }

    /** Next planned fire time for a time-triggered macro, or null. */
    fun nextRun(macro: Macro, now: LocalDateTime = LocalDateTime.now()): LocalDateTime? {
        val time = macro.triggers.firstOrNull { it.type == TriggerType.TIME } ?: return null
        if (!macro.enabled) return null
        return Schedule.nextOccurrence(
            time.s("time"),
            Schedule.parseDays(time.s("days")),
            now,
            ZoneId.systemDefault()
        )
    }

    private fun matches(trigger: TriggerSpec, event: TriggerEvent): Boolean {
        if (trigger.type != event.type) return false
        return when (trigger.type) {
            TriggerType.BATTERY -> {
                val dir = trigger.i("direction", 0)
                val threshold = trigger.i("percent", 20)
                val level = event.info["percent"]?.toIntOrNull() ?: return false
                val prev = event.info["previous"]?.toIntOrNull() ?: -1
                Schedule.batteryCrosses(level, threshold, dir, prev)
            }
            TriggerType.CHARGER -> trigger.b("plugged", true) == (event.info["plugged"] == "1")
            TriggerType.WIFI -> {
                val wantJoin = trigger.b("state", true)
                val isJoin = event.info["joined"] == "1"
                if (wantJoin != isJoin) return false
                val wantSsid = trigger.s("ssid").trim()
                wantSsid.isEmpty() || event.info["ssid"].orEmpty().equals(wantSsid, ignoreCase = true)
            }
            TriggerType.SCREEN -> trigger.b("on", false) == (event.info["on"] == "1")
            TriggerType.HEADPHONES -> trigger.b("plugged", true) == (event.info["plugged"] == "1")
            TriggerType.AIRPLANE -> trigger.b("enabled", true) == (event.info["enabled"] == "1")
            TriggerType.RINGER -> trigger.i("mode", 1).toString() == event.info["mode"]
            TriggerType.BLUETOOTH -> trigger.b("enabled", true) == (event.info["enabled"] == "1")
            TriggerType.APP -> {
                val target = trigger.s("package")
                target.isNotEmpty() && target == event.info["package"]
            }
            TriggerType.TIME, TriggerType.BOOT, TriggerType.MANUAL -> true
        }
    }
}

/** Process-wide tick so UI can refresh counters after background runs. */
object EngineEvents {
    private val listeners = java.util.concurrent.CopyOnWriteArrayList<() -> Unit>()
    @Volatile var version: Long = 0L
        private set

    fun subscribe(listener: () -> Unit): () -> Unit {
        listeners += listener
        return { listeners -= listener }
    }

    fun bump() {
        version++
        listeners.forEach { runCatching { it() } }
    }
}
