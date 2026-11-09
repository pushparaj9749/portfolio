package com.kriya.app

import com.kriya.app.data.ActionSpec
import com.kriya.app.data.ActionType
import com.kriya.app.data.ConstraintSpec
import com.kriya.app.data.ConstraintType
import com.kriya.app.data.TriggerSpec
import com.kriya.app.data.TriggerType
import com.kriya.app.engine.Catalog
import com.kriya.app.engine.Severity
import com.kriya.app.engine.Templates
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CatalogTest {

    /** Guards the promise in the README: nothing listed that isn't implemented. */
    @Test
    fun everyTriggerInCatalogHasADefault() {
        TriggerType.entries.forEach { type ->
            val spec = Catalog.defaultTrigger(type)
            assertEquals(type, spec.type)
            assertTrue("missing catalog entry for $type", Catalog.triggers.any { it.type == type })
        }
    }

    @Test
    fun everyActionInCatalogHasADefault() {
        ActionType.entries.forEach { type ->
            val spec = Catalog.defaultAction(type)
            assertEquals(type, spec.type)
            assertTrue("missing catalog entry for $type", Catalog.actions.any { it.type == type })
            assertTrue("no title for $type", Catalog.actionTitle(spec).isNotBlank())
        }
    }

    @Test
    fun everyConstraintInCatalogHasADefault() {
        ConstraintType.entries.forEach { type ->
            val spec = Catalog.defaultConstraint(type)
            assertEquals(type, spec.type)
            assertTrue(Catalog.constraints.any { it.type == type })
        }
    }

    @Test
    fun summariesReadLikeSentences() {
        val summary = Catalog.summarise(
            listOf(TriggerSpec(TriggerType.TIME, mapOf("time" to "07:00"))),
            listOf(ConstraintSpec(ConstraintType.CHARGING, mapOf("charging" to "1"))),
            listOf(ActionSpec(ActionType.TTS, mapOf("text" to "Good morning")))
        )
        assertTrue(summary.contains("At 7:00 AM"))
        assertTrue(summary.contains("only when charging"))
        assertTrue(summary.contains("Say \"Good morning\""))
    }

    @Test
    fun emptyMacroHasHelpfulSummary() {
        assertEquals(
            "Empty macro — add a trigger and an action.",
            Catalog.summarise(emptyList(), emptyList(), emptyList())
        )
    }

    @Test
    fun templatesAreCompleteAndInspectable() {
        Templates.all.forEach { template ->
            val macro = template.build("test-id")
            assertEquals("test-id", macro.id)
            assertTrue("${template.key} needs a trigger", macro.triggers.isNotEmpty())
            assertTrue("${template.key} needs actions", macro.actions.isNotEmpty())
            assertTrue("${template.key} needs a name", macro.name.isNotBlank())
        }
    }

    @Test
    fun noBrokenTemplates() {
        Templates.all.forEach { template ->
            val health = com.kriya.app.engine.Diagnostics.inspect(
                listOf(template.build("t")),
                granted = setOf("notifications", "usage_access", "exact_alarm"),
                batteryOptimised = false,
                serviceRunning = true
            )
            val errors = health.filter { it.severity == Severity.ERROR }
            assertTrue("template ${template.key} has errors: ${errors.map { it.title }}", errors.isEmpty())
        }
    }
}
