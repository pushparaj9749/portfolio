package com.kriya.app.ui

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import com.kriya.app.data.ActionSpec
import com.kriya.app.data.Codec
import com.kriya.app.data.ConstraintSpec
import com.kriya.app.data.Macro
import com.kriya.app.data.Prefs
import com.kriya.app.data.RunLog
import com.kriya.app.data.TriggerSpec
import com.kriya.app.data.TriggerType
import com.kriya.app.engine.Catalog
import com.kriya.app.engine.DeviceState
import com.kriya.app.engine.Diagnostics
import com.kriya.app.engine.Engine
import com.kriya.app.engine.EngineEvents
import com.kriya.app.engine.Finding
import com.kriya.app.engine.KriyaService
import com.kriya.app.engine.PermissionHub
import com.kriya.app.engine.PermissionItem
import com.kriya.app.engine.RunResult
import com.kriya.app.engine.Scheduling
import com.kriya.app.engine.Templates
import com.kriya.app.ui.theme.Amber
import com.kriya.app.ui.theme.Indigo
import com.kriya.app.ui.theme.Mint
import com.kriya.app.ui.theme.Rose
import java.util.UUID

enum class Tab(val label: String) { HOME("Home"), BUILD("Build"), LOG("Activity"), SETTINGS("Setup") }

data class UiState(
    val macros: List<Macro> = emptyList(),
    val log: List<RunLog> = emptyList(),
    val permissions: List<PermissionItem> = emptyList(),
    val findings: List<Finding> = emptyList(),
    val engineEnabled: Boolean = false,
    val serviceRunning: Boolean = false,
    val batteryPercent: Int = -1,
    val charging: Boolean = false,
    val wifi: String? = null,
    val onboardingDone: Boolean = false,
    val lastHighlight: String? = null
)

class KriyaViewModel(app: Application) : AndroidViewModel(app) {

    val prefs = Prefs(app)
    private val engine = Engine(app)

    var tab by mutableStateOf(Tab.HOME)
        private set
    var state by mutableStateOf(UiState())
        private set
    var editing by mutableStateOf<Macro?>(null)
        private set
    var lastResult by mutableStateOf<RunResult?>(null)
        private set
    var toast by mutableStateOf<String?>(null)
        private set
    var onboarding by mutableStateOf(false)
        private set

    var lastHighlight by mutableStateOf<String?>(null)
        private set

    private var unsubscribe: (() -> Unit)? = null

    init {
        refresh()
        EngineEvents.subscribe { refresh() }.also { unsubscribe = it }
        onboarding = !prefs.onboardingDone
        if (prefs.loadMacros().isEmpty()) seedSampleMacros()
    }

    fun refresh() {
        val app = getApplication<Application>()
        val perms = runCatching { PermissionHub.items(app) }.getOrDefault(emptyList())
        val macros = prefs.loadMacros()
        val granted = perms.filter { it.granted }.map { it.key }.toSet()
        val batteryOptimised = perms.firstOrNull { it.key == com.kriya.app.engine.Perms.BATTERY_OPT }
            ?.granted?.not() ?: true
        state = UiState(
            macros = macros,
            log = prefs.loadLog(),
            permissions = perms,
            findings = Diagnostics.inspect(macros, granted, batteryOptimised, KriyaService.isRunning),
            engineEnabled = prefs.engineEnabled,
            serviceRunning = KriyaService.isRunning,
            batteryPercent = runCatching { DeviceState.snapshot(app).batteryPercent }.getOrDefault(-1),
            charging = runCatching { DeviceState.snapshot(app).charging }.getOrDefault(false),
            wifi = runCatching { DeviceState.currentSsid(app) }.getOrDefault(null),
            onboardingDone = prefs.onboardingDone,
            lastHighlight = lastHighlight
        )
    }

    fun flash(macroId: String?) {
        lastHighlight = macroId
        refresh()
    }

    private fun seedSampleMacros() {
        val sample = Templates.byKey("sleep")?.build("sample-sleep") ?: return
        val second = Templates.byKey("battery")?.build("sample-battery")
        val list = listOfNotNull(
            sample.copy(
                name = "Wind down for sleep",
                enabled = false,
                runCount = 0,
                lastRunAt = 0,
                lastResult = "Preview macro — turn it on when you're ready"
            ),
            second?.copy(enabled = false, lastResult = "Preview macro — turn it on when you're ready")
        )
        prefs.saveMacros(list)
        refresh()
    }

    /* ---------------- navigation ---------------- */

    fun setTab(t: Tab) {
        tab = t
        refresh()
    }

    fun startOnboarding() { onboarding = true }

    fun finishOnboarding() {
        prefs.onboardingDone = true
        onboarding = false
        refresh()
    }

    fun dismissToast() { toast = null }
    fun clearResult() { lastResult = null }

    private fun show(msg: String) { toast = msg }

    /* ---------------- macro CRUD ---------------- */

    fun openEditor(macro: Macro) { editing = macro }

    fun newMacro() {
        editing = Macro(
            id = "m-" + UUID.randomUUID().toString().take(8),
            name = "",
            icon = "⚡",
            color = PALETTE.first(),
            triggers = emptyList(),
            actions = emptyList()
        )
    }

    fun closeEditor(save: Boolean) {
        val macro = editing ?: return
        editing = null
        if (!save) return
        val name = macro.name.ifBlank { "Untitled automation" }
        val saved = macro.copy(name = name)
        val list = prefs.loadMacros().filterNot { it.id == saved.id } + saved
        prefs.saveMacros(list)
        if (saved.enabled) Scheduling.schedule(getApplication(), saved)
        refresh()
        show(if (macro.name.isBlank()) "Saved as \"$name\"" else "Saved \"$name\"")
    }

    fun updateEditing(transform: (Macro) -> Macro) {
        editing = editing?.let(transform)
    }

    fun duplicate(macro: Macro) {
        val copy = macro.copy(
            id = "m-" + UUID.randomUUID().toString().take(8),
            name = macro.name + " copy",
            runCount = 0,
            lastRunAt = 0,
            lastResult = ""
        )
        prefs.saveMacros(prefs.loadMacros() + copy)
        refresh()
        show("Duplicated \"${macro.name}\"")
    }

    fun delete(macro: Macro) {
        Scheduling.cancel(getApplication(), macro.id)
        prefs.saveMacros(prefs.loadMacros().filterNot { it.id == macro.id })
        refresh()
        show("Deleted \"${macro.name}\"")
    }

    fun toggle(macro: Macro, enabled: Boolean) {
        val updated = macro.copy(enabled = enabled)
        prefs.saveMacros(prefs.loadMacros().map { if (it.id == macro.id) updated else it })
        if (enabled) Scheduling.schedule(getApplication(), updated)
        else Scheduling.cancel(getApplication(), macro.id)
        if (enabled && prefs.engineEnabled) KriyaService.start(getApplication())
        refresh()
        show(if (enabled) "Armed \"${macro.name}\"" else "Paused \"${macro.name}\"")
    }

    fun runNow(macro: Macro) {
        val result = engine.runNow(macro)
        lastResult = result
        refresh()
    }

    fun nextRunLabel(macro: Macro): String? =
        runCatching { Scheduling.nextRunLabel(getApplication(), macro) }.getOrNull()

    /* ---------------- templates ---------------- */

    fun useTemplate(key: String) {
        val template = Templates.byKey(key) ?: return
        val macro = template.build("m-" + UUID.randomUUID().toString().take(8)).copy(enabled = true)
        prefs.saveMacros(prefs.loadMacros() + macro)
        Scheduling.schedule(getApplication(), macro)
        refresh()
        show("Added \"${macro.name}\" — tweak it any time")
        editing = null
    }

    fun previewTemplate(key: String): Macro? = Templates.byKey(key)?.build("preview")

    /* ---------------- import / export ---------------- */

    fun exportJson(): String = Codec.encodeMacros(prefs.loadMacros())

    fun importJson(raw: String, replace: Boolean): Boolean {
        val incoming = runCatching { Codec.decodeMacros(raw) }.getOrNull().orEmpty()
        if (incoming.isEmpty()) {
            show("That doesn't look like a Kriya export")
            return false
        }
        val merged = if (replace) incoming else (prefs.loadMacros() + incoming).distinctBy { it.id }
        prefs.saveMacros(merged)
        Scheduling.rescheduleAll(getApplication())
        refresh()
        show("Imported ${incoming.size} ${if (incoming.size == 1) "automation" else "automations"}")
        return true
    }

    /* ---------------- engine + permissions ---------------- */

    fun setEngine(enabled: Boolean) {
        prefs.engineEnabled = enabled
        if (enabled) {
            KriyaService.start(getApplication())
            Scheduling.rescheduleAll(getApplication())
            show("Kriya is now watching for triggers")
        } else {
            KriyaService.stop(getApplication())
            show("Background engine stopped")
        }
        refresh()
    }

    fun recheckPermissions(): String {
        val missing = state.permissions.filter { !it.granted }
        refresh()
        return if (missing.isEmpty()) "All permissions granted" else "${missing.size} still need attention"
    }

    fun clearLog() {
        prefs.clearLog()
        refresh()
        show("Activity cleared")
    }

    fun stateSummary(): String {
        val app = getApplication<Application>()
        val snap = runCatching { DeviceState.snapshot(app) }.getOrNull() ?: return "Unknown"
        return buildString {
            append(if (snap.charging) "Charging" else "On battery")
            append(" · ${snap.batteryPercent}%")
            snap.wifiSsid?.let { append(" · $it") }
        }
    }

    /* ---------------- helpers used by the editor ---------------- */

    fun addTrigger(type: TriggerType) = updateEditing { it.copy(triggers = it.triggers + Catalog.defaultTrigger(type)) }
    fun addAction(type: com.kriya.app.data.ActionType) =
        updateEditing { it.copy(actions = it.actions + Catalog.defaultAction(type)) }
    fun addConstraint(type: com.kriya.app.data.ConstraintType) =
        updateEditing { it.copy(constraints = it.constraints + Catalog.defaultConstraint(type)) }

    fun replaceTrigger(index: Int, spec: TriggerSpec) = updateEditing { m ->
        m.copy(triggers = m.triggers.toMutableList().also { it[index] = spec })
    }

    fun replaceAction(index: Int, spec: ActionSpec) = updateEditing { m ->
        m.copy(actions = m.actions.toMutableList().also { it[index] = spec })
    }

    fun replaceConstraint(index: Int, spec: ConstraintSpec) = updateEditing { m ->
        m.copy(constraints = m.constraints.toMutableList().also { it[index] = spec })
    }

    fun removeTrigger(index: Int) = updateEditing { m ->
        m.copy(triggers = m.triggers.filterIndexed { i, _ -> i != index })
    }

    fun removeAction(index: Int) = updateEditing { m ->
        m.copy(actions = m.actions.filterIndexed { i, _ -> i != index })
    }

    fun removeConstraint(index: Int) = updateEditing { m ->
        m.copy(constraints = m.constraints.filterIndexed { i, _ -> i != index })
    }

    companion object {
        val PALETTE = listOf(0xFF6F8CFF, 0xFF3DDC97, 0xFFFFB74D, 0xFFE879A8, 0xFF4DD0E1, 0xFF9CCC65,
            0xFF8B7CFF, 0xFFFFD166, 0xFFFF7A8A, 0xFF7ED6DF)

        val brandColors = listOf(Indigo, Mint, Amber, Rose)
    }
}
