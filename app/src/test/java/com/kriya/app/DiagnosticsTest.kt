package com.kriya.app

import com.kriya.app.data.ActionSpec
import com.kriya.app.data.ActionType
import com.kriya.app.data.Macro
import com.kriya.app.data.TriggerSpec
import com.kriya.app.data.TriggerType
import com.kriya.app.engine.Diagnostics
import com.kriya.app.engine.Perms
import com.kriya.app.engine.Severity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DiagnosticsTest {

    private fun healthyMacro() = Macro(
        id = "m1",
        name = "Good macro",
        triggers = listOf(TriggerSpec(TriggerType.TIME, mapOf("time" to "08:00", "days" to "1,2,3,4,5"))),
        actions = listOf(ActionSpec(ActionType.VIBRATE, mapOf("ms" to "200")))
    )

    private val allPerms = setOf(Perms.NOTIFICATIONS, Perms.USAGE_ACCESS, Perms.EXACT_ALARM)

    @Test
    fun healthySetupReportsNoErrors() {
        val findings = Diagnostics.inspect(
            listOf(healthyMacro()),
            granted = allPerms,
            batteryOptimised = false,
            serviceRunning = true
        )
        assertTrue(findings.none { it.severity == Severity.ERROR })
    }

    @Test
    fun missingEngineIsAnError() {
        val findings = Diagnostics.inspect(listOf(healthyMacro()), allPerms, false, serviceRunning = false)
        assertTrue(findings.any { it.title.contains("Background engine") && it.severity == Severity.ERROR })
    }

    @Test
    fun batteryOptimisationIsAnError() {
        val findings = Diagnostics.inspect(listOf(healthyMacro()), allPerms, batteryOptimised = true, serviceRunning = true)
        assertTrue(findings.any { it.title.contains("Battery optimisation") && it.severity == Severity.ERROR })
    }

    @Test
    fun invalidTimeIsCaughtBeforeItSilentlyFails() {
        val broken = healthyMacro().copy(
            triggers = listOf(TriggerSpec(TriggerType.TIME, mapOf("time" to "25:99")))
        )
        val findings = Diagnostics.inspect(listOf(broken), allPerms, false, true)
        assertTrue(findings.any { it.title.contains("invalid time") })
    }

    @Test
    fun macroWithoutTriggerIsFlagged() {
        val broken = healthyMacro().copy(triggers = emptyList())
        val findings = Diagnostics.inspect(listOf(broken), allPerms, false, true)
        assertTrue(findings.any { it.title.contains("has no trigger") })
    }

    @Test
    fun macroWithoutActionsIsFlagged() {
        val broken = healthyMacro().copy(actions = emptyList())
        val findings = Diagnostics.inspect(listOf(broken), allPerms, false, true)
        assertTrue(findings.any { it.title.contains("has no action") })
    }

    @Test
    fun appTriggerWithoutPackageIsFlagged() {
        val broken = healthyMacro().copy(
            triggers = listOf(TriggerSpec(TriggerType.APP, mapOf("package" to "")))
        )
        val findings = Diagnostics.inspect(listOf(broken), allPerms, false, true)
        assertTrue(findings.any { it.title.contains("no app selected") })
    }

    @Test
    fun usageAccessWarnedOnlyWhenNeeded() {
        val withoutUsage = setOf(Perms.NOTIFICATIONS)
        val plainFindings = Diagnostics.inspect(listOf(healthyMacro()), withoutUsage, false, true)
        assertTrue(plainFindings.none { it.title.contains("usage access") })

        val appMacro = healthyMacro().copy(
            triggers = listOf(TriggerSpec(TriggerType.APP, mapOf("package" to "com.example")))
        )
        val appFindings = Diagnostics.inspect(listOf(appMacro), withoutUsage, false, true)
        assertTrue(appFindings.any { it.title.contains("usage access") })
    }

    @Test
    fun errorsSortBeforeWarnings() {
        val findings = Diagnostics.inspect(
            listOf(healthyMacro().copy(enabled = false)),
            granted = emptySet(),
            batteryOptimised = true,
            serviceRunning = false
        )
        val severities = findings.map { it.severity }
        assertEquals(severities.sortedBy { it.ordinal }, severities)
    }
}
