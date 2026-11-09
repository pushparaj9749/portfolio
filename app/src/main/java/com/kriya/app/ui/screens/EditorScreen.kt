package com.kriya.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.kriya.app.data.ActionSpec
import com.kriya.app.data.ActionType
import com.kriya.app.data.Apps
import com.kriya.app.data.ConstraintSpec
import com.kriya.app.data.ConstraintType
import com.kriya.app.data.Macro
import com.kriya.app.data.TriggerSpec
import com.kriya.app.data.TriggerType
import com.kriya.app.engine.Catalog
import com.kriya.app.engine.Schedule
import com.kriya.app.ui.KriyaViewModel
import com.kriya.app.ui.components.SectionHeader
import com.kriya.app.ui.components.SurfaceCard
import com.kriya.app.ui.theme.Amber
import com.kriya.app.ui.theme.Indigo
import com.kriya.app.ui.theme.Mint
import java.time.LocalTime

private enum class Picker { TRIGGER, ACTION, CONSTRAINT }

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun EditorScreen(
    vm: KriyaViewModel,
    macro: Macro,
    onBack: () -> Unit
) {
    var picker by remember { mutableStateOf<Picker?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    val accent = Color(macro.color)

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                ),
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Rounded.ArrowBack, contentDescription = "Back")
                    }
                },
                title = {
                    Text(
                        if (macro.name.isBlank()) "New automation" else "Edit automation",
                        style = MaterialTheme.typography.titleLarge
                    )
                },
                actions = {
                    IconButton(onClick = { vm.openEditor(macro.copy(id = macro.id)) }) {
                        Icon(Icons.Rounded.ContentCopy, contentDescription = "Duplicate")
                    }
                    IconButton(onClick = { confirmDelete = true }) {
                        Icon(Icons.Rounded.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.error)
                    }
                }
            )
        },
        bottomBar = {
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surface)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Button(
                    onClick = { vm.runNow(macro) },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                        contentColor = MaterialTheme.colorScheme.onSurface
                    ),
                    contentPadding = PaddingValues(vertical = 14.dp)
                ) {
                    Icon(Icons.Rounded.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Test now")
                }
                Button(
                    onClick = { vm.closeEditor(save = true) },
                    modifier = Modifier.weight(1.2f),
                    shape = RoundedCornerShape(14.dp),
                    contentPadding = PaddingValues(vertical = 14.dp)
                ) { Text("Save automation") }
            }
        }
    ) { pad ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(pad),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 24.dp)
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier
                            .size(58.dp)
                            .clip(RoundedCornerShape(18.dp))
                            .background(accent.copy(alpha = 0.16f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(macro.icon, style = MaterialTheme.typography.headlineMedium)
                    }
                    Spacer(Modifier.width(14.dp))
                    OutlinedTextField(
                        value = macro.name,
                        onValueChange = { v -> vm.updateEditing { it.copy(name = v) } },
                        placeholder = { Text("Name this automation") },
                        singleLine = true,
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.weight(1f)
                    )
                    Spacer(Modifier.width(6.dp))
                    Switch(
                        checked = macro.enabled,
                        onCheckedChange = { v -> vm.updateEditing { it.copy(enabled = v) } }
                    )
                }
            }

            item {
                Spacer(Modifier.height(12.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ICONS.take(8).forEach { icon ->
                        FilterChip(
                            selected = macro.icon == icon,
                            onClick = { vm.updateEditing { it.copy(icon = icon) } },
                            label = { Text(icon, style = MaterialTheme.typography.titleMedium) },
                            shape = CircleShape
                        )
                    }
                }
                Spacer(Modifier.height(6.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    KriyaViewModel.PALETTE.forEach { c ->
                        val color = Color(c)
                        Box(
                            Modifier
                                .size(26.dp)
                                .clip(CircleShape)
                                .background(color)
                                .clickable { vm.updateEditing { it.copy(color = c) } }
                        ) {
                            if (macro.color == c) {
                                Box(
                                    Modifier
                                        .size(26.dp)
                                        .clip(CircleShape)
                                        .background(Color.White.copy(alpha = 0.85f))
                                        .padding(9.dp)
                                )
                            }
                        }
                    }
                }
            }

            /* ---------------- plain English ---------------- */
            item {
                Spacer(Modifier.height(18.dp))
                SurfaceCard {
                    Column(Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("🗣️", style = MaterialTheme.typography.titleMedium)
                            Spacer(Modifier.width(8.dp))
                            Text(
                                "In plain English",
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(
                            Catalog.summarise(macro.triggers, macro.constraints, macro.actions),
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        if (macro.triggers.isEmpty() || macro.actions.isEmpty()) {
                            Spacer(Modifier.height(8.dp))
                            Text(
                                "Add at least one trigger and one action to make this live.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = Amber
                            )
                        }
                    }
                }
            }

            /* ---------------- triggers ---------------- */
            item {
                SectionHeader("1 · When this happens") {
                    TextButton(onClick = { picker = Picker.TRIGGER }) {
                        Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Add")
                    }
                }
            }
            if (macro.triggers.isEmpty()) {
                item { HintCard("Pick at least one trigger", "The event that starts this automation.") }
            }
            itemsIndexed(macro.triggers) { index, spec ->
                ComponentCard(
                    emoji = Catalog.trigger(spec.type).emoji,
                    title = Catalog.trigger(spec.type).title,
                    subtitle = Catalog.triggerTitle(spec),
                    tint = Indigo,
                    onRemove = { vm.removeTrigger(index) }
                ) {
                    TriggerEditor(spec) { vm.replaceTrigger(index, it) }
                }
            }

            /* ---------------- constraints ---------------- */
            item {
                SectionHeader("2 · Only when") {
                    TextButton(onClick = { picker = Picker.CONSTRAINT }) { Text("+ Condition") }
                }
            }
            if (macro.constraints.isEmpty()) {
                item { HintCard("Optional", "Extra conditions like \"only while charging\" or \"weekdays only\".") }
            }
            itemsIndexed(macro.constraints) { index, spec ->
                ComponentCard(
                    emoji = Catalog.constraint(spec.type).emoji,
                    title = Catalog.constraint(spec.type).title,
                    subtitle = com.kriya.app.engine.Constraints.describe(spec),
                    tint = Amber,
                    onRemove = { vm.removeConstraint(index) }
                ) {
                    ConstraintEditor(spec) { vm.replaceConstraint(index, it) }
                }
            }

            /* ---------------- actions ---------------- */
            item {
                SectionHeader("3 · Do this") {
                    TextButton(onClick = { picker = Picker.ACTION }) {
                        Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Add")
                    }
                }
            }
            if (macro.actions.isEmpty()) {
                item { HintCard("Add an action", "What should Kriya actually do?") }
            }
            itemsIndexed(macro.actions) { index, spec ->
                ComponentCard(
                    emoji = Catalog.action(spec.type).emoji,
                    title = Catalog.action(spec.type).title,
                    subtitle = Catalog.actionTitle(spec),
                    tint = Mint,
                    onRemove = { vm.removeAction(index) }
                ) {
                    ActionEditor(spec) { vm.replaceAction(index, it) }
                }
            }

            item { Spacer(Modifier.height(16.dp)) }
        }
    }

    picker?.let { which ->
        ComponentPicker(
            which = which,
            onDismiss = { picker = null },
            onTrigger = {
                vm.addTrigger(it)
                picker = null
            },
            onAction = {
                vm.addAction(it)
                picker = null
            },
            onConstraint = {
                vm.addConstraint(it)
                picker = null
            }
        )
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete this automation?") },
            text = { Text("\"${macro.name}\" will be removed. This can't be undone.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    onBack()
                    vm.delete(macro)
                }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } }
        )
    }
}

private val ICONS = listOf("⚡", "🌙", "☀️", "🔋", "🎧", "📶", "💼", "🏠", "🚗", "🎯", "🔔", "🧘", "🚀", "🔦")

@Composable
private fun HintCard(title: String, body: String) {
    Box(Modifier.padding(horizontal = 0.dp, vertical = 4.dp)) {
        SurfaceCard {
            Column(Modifier.padding(14.dp)) {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun ComponentCard(
    emoji: String,
    title: String,
    subtitle: String,
    tint: Color,
    onRemove: () -> Unit,
    content: @Composable () -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    Box(Modifier.padding(vertical = 4.dp)) {
        SurfaceCard {
            Column(Modifier.padding(start = 14.dp, end = 6.dp, top = 12.dp, bottom = 12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier
                            .size(38.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(tint.copy(alpha = 0.14f)),
                        contentAlignment = Alignment.Center
                    ) { Text(emoji) }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
                        Text(
                            subtitle,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    IconButton(onClick = onRemove) {
                        Icon(
                            Icons.Rounded.Close,
                            contentDescription = "Remove",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
                TextButton(onClick = { expanded = !expanded }, contentPadding = PaddingValues(horizontal = 0.dp)) {
                    Text(if (expanded) "Hide options" else "Configure", style = MaterialTheme.typography.labelLarge)
                }
                if (expanded) content()
            }
        }
    }
}

/* ------------------------------- editors ------------------------------- */

@Composable
private fun TriggerEditor(spec: TriggerSpec, onChange: (TriggerSpec) -> Unit) {
    val p = spec.params.toMutableMap()
    fun set(key: String, value: String) {
        p[key] = value
        onChange(spec.copy(params = p.toMap()))
    }

    when (spec.type) {
        TriggerType.TIME -> {
            var hour by remember(spec) { mutableStateOf(spec.s("time", "07:00").substringBefore(":").toIntOrNull() ?: 7) }
            var minute by remember(spec) { mutableStateOf(spec.s("time", "07:00").substringAfter(":", "00").toIntOrNull() ?: 0) }
            SliderRow("Hour", hour.toFloat(), 0f..23f, "${hour}:00") {
                hour = it.toInt()
                set("time", Schedule.formatTime(hour, minute))
            }
            SliderRow("Minute", minute.toFloat(), 0f..59f, "%02d".format(minute)) {
                minute = it.toInt()
                set("time", Schedule.formatTime(hour, minute))
            }
            Text(
                "Runs at ${Catalog.format12(LocalTime.of(hour, minute))}",
                style = MaterialTheme.typography.bodyMedium,
                color = Mint
            )
            Spacer(Modifier.height(8.dp))
            DayPicker(Schedule.parseDays(spec.s("days"))) { set("days", Schedule.encodeDays(it)) }
        }
        TriggerType.BATTERY -> {
            var percent by remember(spec) { mutableStateOf(spec.i("percent", 20).toFloat()) }
            SliderRow("Battery level", percent, 1f..100f, "${percent.toInt()}%") {
                percent = it
                set("percent", it.toInt().toString())
            }
            ChoiceRow(
                "Fires when battery",
                listOf("drops to", "rises to", "changes"),
                spec.i("direction", 0),
                onPick = { set("direction", it.toString()) }
            )
        }
        TriggerType.CHARGER -> ChoiceRow(
            "When I…", listOf("plug in", "unplug"), if (spec.b("plugged", true)) 0 else 1,
            onPick = { set("plugged", if (it == 0) "1" else "0") }
        )
        TriggerType.WIFI -> {
            ChoiceRow(
                "When I…", listOf("join Wi-Fi", "leave Wi-Fi"),
                if (spec.b("state", true)) 0 else 1,
                onPick = { set("state", if (it == 0) "1" else "0") }
            )
            val context = LocalContext.current
            val networks = remember { listOfNotNull(com.kriya.app.engine.DeviceState.currentSsid(context)) }
            TextInput(
                label = "Network name (blank = any)",
                value = spec.s("ssid"),
                placeholder = "e.g. Home_5G",
                onChange = { set("ssid", it) }
            )
            if (networks.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    AssistChip(
                        onClick = { set("ssid", networks.first()) },
                        label = { Text("Use \"${networks.first()}\"") }
                    )
                }
            }
        }
        TriggerType.BLUETOOTH -> ChoiceRow(
            "When Bluetooth…", listOf("turns on", "turns off"), if (spec.b("enabled", true)) 0 else 1,
            onPick = { set("enabled", if (it == 0) "1" else "0") }
        )
        TriggerType.SCREEN -> ChoiceRow(
            "When the screen…", listOf("turns on", "turns off"), if (spec.b("on", false)) 0 else 1,
            onPick = { set("on", if (it == 0) "1" else "0") }
        )
        TriggerType.HEADPHONES -> ChoiceRow(
            "When headphones…", listOf("connect", "disconnect"), if (spec.b("plugged", true)) 0 else 1,
            onPick = { set("plugged", if (it == 0) "1" else "0") }
        )
        TriggerType.AIRPLANE -> ChoiceRow(
            "When airplane mode…", listOf("turns on", "turns off"), if (spec.b("enabled", true)) 0 else 1,
            onPick = { set("enabled", if (it == 0) "1" else "0") }
        )
        TriggerType.RINGER -> ChoiceRow(
            "When the phone goes…", listOf("silent", "vibrate", "loud"), spec.i("mode", 1),
            onPick = { set("mode", it.toString()) }
        )
        TriggerType.APP -> AppPicker(
            currentPackage = spec.s("package"),
            onPick = { pkg, label ->
                p["package"] = pkg
                p["label"] = label
                onChange(spec.copy(params = p.toMap()))
            }
        )
        TriggerType.BOOT, TriggerType.MANUAL -> Text(
            if (spec.type == TriggerType.BOOT) "Nothing to configure — fires after a reboot."
            else "Nothing to configure — run it from the home screen or a shortcut.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun ConstraintEditor(spec: ConstraintSpec, onChange: (ConstraintSpec) -> Unit) {
    val p = spec.params.toMutableMap()
    fun set(key: String, value: String) {
        p[key] = value
        onChange(spec.copy(params = p.toMap()))
    }
    when (spec.type) {
        ConstraintType.CHARGING -> ChoiceRow(
            "Allowed when…", listOf("charging", "on battery"),
            if (spec.b("charging", true)) 0 else 1,
            onPick = { set("charging", if (it == 0) "1" else "0") }
        )
        ConstraintType.SCREEN_LOCKED -> ChoiceRow(
            "Allowed when screen is…", listOf("locked", "unlocked"),
            if (spec.b("unlocked", false)) 1 else 0,
            onPick = { set("unlocked", if (it == 1) "1" else "0") }
        )
        ConstraintType.BATTERY_AT_LEAST -> {
            var value by remember(spec) { mutableStateOf(spec.i("percent", 30).toFloat()) }
            SliderRow("At least", value, 1f..100f, "${value.toInt()}%") {
                value = it
                set("percent", it.toInt().toString())
            }
        }
        ConstraintType.WIFI_NAMED -> TextInput(
            label = "Only on network",
            value = spec.s("ssid"),
            placeholder = "Home_5G",
            onChange = { set("ssid", it) }
        )
        ConstraintType.DAYS_OF_WEEK -> DayPicker(Schedule.parseDays(spec.s("days"))) {
            set("days", Schedule.encodeDays(it))
        }
    }
}

@Composable
private fun ActionEditor(spec: ActionSpec, onChange: (ActionSpec) -> Unit) {
    val p = spec.params.toMutableMap()
    fun set(key: String, value: String) {
        p[key] = value
        onChange(spec.copy(params = p.toMap()))
    }
    when (spec.type) {
        ActionType.DND -> ChoiceRow(
            "Turn DND…", listOf("on", "off"), if (spec.b("on", true)) 0 else 1,
            onPick = { set("on", if (it == 0) "1" else "0") }
        )
        ActionType.RINGER -> ChoiceRow(
            "Switch to…", listOf("silent", "vibrate", "loud"), spec.i("mode", 0),
            onPick = { set("mode", it.toString()) }
        )
        ActionType.VOLUME -> {
            var v by remember(spec) { mutableStateOf(spec.i("percent", 40).toFloat()) }
            SliderRow("Volume", v, 0f..100f, "${v.toInt()}%") {
                v = it
                set("percent", it.toInt().toString())
            }
        }
        ActionType.BRIGHTNESS -> {
            var v by remember(spec) { mutableStateOf(spec.i("percent", 50).toFloat()) }
            SliderRow("Brightness", v, 5f..100f, "${v.toInt()}%") {
                v = it
                set("percent", it.toInt().toString())
            }
        }
        ActionType.TORCH -> ChoiceRow(
            "Torch…", listOf("on", "off", "toggle"), when (spec.s("on", "1")) {
                "0" -> 1; "toggle" -> 2; else -> 0
            },
            onPick = { set("on", when (it) { 0 -> "1"; 1 -> "0"; else -> "toggle" }) }
        )
        ActionType.VIBRATE -> {
            var v by remember(spec) { mutableStateOf(spec.i("ms", 300).toFloat()) }
            SliderRow("Duration", v, 50f..2000f, "${v.toInt()} ms") {
                v = it
                set("ms", it.toInt().toString())
            }
        }
        ActionType.NOTIFY -> {
            TextInput("Title", spec.s("title"), "Kriya", onChange = { set("title", it) })
            TextInput("Message", spec.s("text"), "Your automation ran", onChange = { set("text", it) }, maxLines = 3)
        }
        ActionType.TTS -> TextInput(
            "Say this", spec.s("text"), "Good morning!", onChange = { set("text", it) }, maxLines = 3
        )
        ActionType.WAIT -> {
            var v by remember(spec) { mutableStateOf(spec.i("seconds", 5).toFloat()) }
            SliderRow("Wait", v, 0f..120f, "${v.toInt()} s") {
                v = it
                set("seconds", it.toInt().toString())
            }
        }
        ActionType.OPEN_APP -> AppPicker(
            currentPackage = spec.s("package"),
            onPick = { pkg, label ->
                p["package"] = pkg
                p["label"] = label
                onChange(spec.copy(params = p.toMap()))
            }
        )
        else -> Text(
            "Nothing to configure.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

/* ------------------------------- small widgets ------------------------------- */

@Composable
private fun SliderRow(label: String, value: Float, range: ClosedFloatingPointRange<Float>, display: String, onChange: (Float) -> Unit) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.weight(1f))
            Text(display, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
        }
        Slider(value = value, onValueChange = onChange, valueRange = range)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChoiceRow(label: String, options: List<String>, selected: Int, onPick: (Int) -> Unit) {
    Column {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(4.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            options.forEachIndexed { i, text ->
                FilterChip(
                    selected = i == selected,
                    onClick = { onPick(i) },
                    label = { Text(text) },
                    shape = RoundedCornerShape(10.dp)
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DayPicker(selected: Set<Int>, onPick: (Set<Int>) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        (1..7).forEach { day ->
            FilterChip(
                selected = day in selected,
                onClick = {
                    val next = if (day in selected) selected - day else selected + day
                    onPick(next.ifEmpty { (1..7).toSet() })
                },
                label = { Text(Schedule.shortDay(day)) },
                shape = RoundedCornerShape(10.dp)
            )
        }
    }
}

@Composable
private fun TextInput(
    label: String,
    value: String,
    placeholder: String,
    maxLines: Int = 1,
    onChange: (String) -> Unit
) {
    Column {
        OutlinedTextField(
            value = value,
            onValueChange = onChange,
            label = { Text(label) },
            placeholder = { Text(placeholder) },
            singleLine = maxLines == 1,
            maxLines = maxLines,
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AppPicker(currentPackage: String, onPick: (String, String) -> Unit) {
    val context = LocalContext.current
    val apps = remember { Apps.launchable(context) }
    var query by remember { mutableStateOf("") }
    val filtered = remember(apps, query) {
        if (query.isBlank()) apps.take(40) else apps.filter { it.label.contains(query, true) }.take(40)
    }
    Column {
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            label = { Text("Search installed apps") },
            singleLine = true,
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(8.dp))
        if (currentPackage.isNotBlank()) {
            Text(
                "Selected: ${Apps.labelOf(context, currentPackage)}",
                style = MaterialTheme.typography.labelLarge,
                color = Mint
            )
            Spacer(Modifier.height(6.dp))
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            filtered.forEach { app ->
                AssistChip(
                    onClick = { onPick(app.packageName, app.label) },
                    label = { Text(app.label, maxLines = 1) }
                )
            }
        }
        if (filtered.isEmpty()) {
            Text(
                "No launchable apps found.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

/* ------------------------------- pickers ------------------------------- */

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun ComponentPicker(
    which: Picker,
    onDismiss: () -> Unit,
    onTrigger: (TriggerType) -> Unit,
    onAction: (ActionType) -> Unit,
    onConstraint: (ConstraintType) -> Unit
) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = MaterialTheme.colorScheme.surface) {
        Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
            Text(
                when (which) {
                    Picker.TRIGGER -> "What should start it?"
                    Picker.ACTION -> "What should happen?"
                    Picker.CONSTRAINT -> "Extra conditions"
                },
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(Modifier.height(4.dp))
            Text(
                "Each option explains itself in one line.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(12.dp))

            when (which) {
                Picker.TRIGGER -> Catalog.triggers.groupBy { it.group }.forEach { (group, list) ->
                    Text(
                        group,
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(vertical = 6.dp)
                    )
                    list.forEach { info ->
                        PickerRow(info.emoji, info.title, info.short) { onTrigger(info.type) }
                    }
                }
                Picker.ACTION -> Catalog.actions.groupBy { it.group }.forEach { (group, list) ->
                    Text(
                        group,
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(vertical = 6.dp)
                    )
                    list.forEach { info ->
                        PickerRow(info.emoji, info.title, info.short) { onAction(info.type) }
                    }
                }
                Picker.CONSTRAINT -> Catalog.constraints.forEach { info ->
                    PickerRow(info.emoji, info.title, info.short) { onConstraint(info.type) }
                }
            }
            Spacer(Modifier.height(28.dp))
        }
    }
}

@Composable
private fun PickerRow(emoji: String, title: String, subtitle: String, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center
        ) { Text(emoji) }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Icon(Icons.Rounded.Add, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
    }
}
