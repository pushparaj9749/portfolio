package com.kriya.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.kriya.app.data.Macro
import com.kriya.app.engine.Catalog
import com.kriya.app.ui.KriyaViewModel
import com.kriya.app.ui.Sheet
import com.kriya.app.ui.components.EmptyState
import com.kriya.app.ui.components.GradientHero
import com.kriya.app.ui.components.MacroCard
import com.kriya.app.ui.components.Pill
import com.kriya.app.ui.components.SectionHeader
import com.kriya.app.ui.components.SurfaceCard
import com.kriya.app.ui.theme.Indigo
import com.kriya.app.ui.theme.Mint

@Composable
fun HomeScreen(
    vm: KriyaViewModel,
    onOpenMacro: (Macro) -> Unit,
    onOpenSheet: (Sheet) -> Unit,
    modifier: Modifier = Modifier
) {
    val state = vm.state
    var query by remember { mutableStateOf("") }
    var showSearch by remember { mutableStateOf(false) }

    val armed = state.macros.count { it.enabled && it.ready }
    val attention = state.macros.count { it.ready.not() }

    val filtered = remember(state.macros, query) {
        if (query.isBlank()) state.macros
        else state.macros.filter {
            it.name.contains(query, true) ||
                it.category.contains(query, true) ||
                Catalog.summarise(it.triggers, it.constraints, it.actions).contains(query, true)
        }
    }

    LazyColumn(
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(bottom = 120.dp)
    ) {
        item {
            Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            "Kriya",
                            style = MaterialTheme.typography.displaySmall,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            "Your phone, on autopilot",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    IconButton(onClick = { showSearch = !showSearch }) {
                        Icon(Icons.Rounded.Search, contentDescription = "Search automations")
                    }
                    Box(
                        modifier = Modifier
                            .size(42.dp)
                            .clip(CircleShape)
                            .background(
                                Brush.linearGradient(
                                    listOf(Indigo.copy(alpha = 0.9f), Mint.copy(alpha = 0.9f))
                                )
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            "⚡",
                            style = MaterialTheme.typography.titleMedium
                        )
                    }
                }

                if (showSearch) {
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        placeholder = { Text("Search by name or action…") },
                        singleLine = true,
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                Spacer(Modifier.height(16.dp))
                HeroCard(vm = vm, armed = armed, attention = attention, onOpenSheet = onOpenSheet)
            }
        }

        if (state.findings.any { it.severity == com.kriya.app.engine.Severity.ERROR }) {
            item {
                Column(Modifier.padding(horizontal = 20.dp, vertical = 4.dp)) {
                    SurfaceCard(onClick = { onOpenSheet(Sheet.Fixes) }) {
                        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Rounded.ErrorOutline,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error
                            )
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(
                                    "${state.findings.count { it.severity == com.kriya.app.engine.Severity.ERROR }} thing${if (state.findings.count { it.severity == com.kriya.app.engine.Severity.ERROR } == 1) "" else "s"} need attention",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Text(
                                    state.findings.first { it.severity == com.kriya.app.engine.Severity.ERROR }.title,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                            Text(
                                "Fix",
                                color = MaterialTheme.colorScheme.primary,
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }
            }
        }

        if (state.macros.isNotEmpty()) {
            item {
                SectionHeader("Your automations") {
                    TextButton(onClick = { onOpenSheet(Sheet.Templates) }) {
                        Text("Templates")
                    }
                }
            }
            items(filtered, key = { it.id }) { macro ->
                Column(Modifier.padding(horizontal = 20.dp, vertical = 5.dp)) {
                    MacroCard(
                        macro = macro,
                        nextRun = vm.nextRunLabel(macro),
                        highlighted = macro.id == state.lastHighlight,
                        onOpen = { onOpenMacro(macro) },
                        onToggle = { vm.toggle(macro, it) },
                        onRun = { vm.runNow(macro) }
                    )
                }
            }
        } else {
            item {
                EmptyState(
                    emoji = "🪄",
                    title = "No automations yet",
                    body = "Start from a ready-made template — every one of them works out of the box."
                ) {
                    Button(onClick = { onOpenSheet(Sheet.Templates) }) { Text("Browse templates") }
                }
            }
        }

        item {
            Spacer(Modifier.height(20.dp))
            Column(Modifier.padding(horizontal = 20.dp)) {
                SurfaceCard(onClick = { onOpenSheet(Sheet.Templates) }) {
                    Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("✨", style = MaterialTheme.typography.headlineMedium)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                "Need inspiration?",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                "Curated starters that only use features Kriya really ships.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HeroCard(vm: KriyaViewModel, armed: Int, attention: Int, onOpenSheet: (Sheet) -> Unit) {
    val state = vm.state
    GradientHero(
        modifier = Modifier.padding(top = 2.dp),
        colors = listOf(Color(0xFF22315A), Color(0xFF141B25), Color(0xFF1B2B3A))
    ) {
        Column(Modifier.padding(20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(if (state.engineEnabled) Color(0xFF3DDC97) else Color(0xFF8894A8))
                        )
                        Spacer(Modifier.width(7.dp))
                        Text(
                            if (state.engineEnabled) "Engine watching" else "Engine paused",
                            style = MaterialTheme.typography.labelLarge,
                            color = Color(0xFFEAF0FA),
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        if (armed == 0) "Nothing armed yet" else "$armed automation${if (armed == 1) "" else "s"} armed",
                        style = MaterialTheme.typography.headlineMedium,
                        color = Color.White
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        vm.stateSummary(),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color(0xFFB9C6DA)
                    )
                }
                Box(
                    modifier = Modifier
                        .size(54.dp)
                        .clip(RoundedCornerShape(18.dp))
                        .background(Color.White.copy(alpha = 0.08f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Rounded.Bolt, contentDescription = null, tint = Color(0xFFB9C8FF))
                }
            }

            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill(
                    text = "${state.log.count { it.outcome == com.kriya.app.data.Outcome.SUCCESS && it.at > System.currentTimeMillis() - 86_400_000 }} runs today",
                    color = Color(0xFF3DDC97),
                    filled = true
                )
                if (attention > 0) {
                    Pill(text = "$attention need setup", color = Color(0xFFFFB74D), filled = true)
                }
                if (state.permissions.any { it.required && !it.granted }) {
                    Pill(text = "Setup incomplete", color = Color(0xFFFF7A8A), filled = true)
                }
            }

            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = { vm.setEngine(!state.engineEnabled) },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (state.engineEnabled) Color.White.copy(alpha = 0.14f) else Color(0xFF6F8CFF),
                        contentColor = Color.White
                    ),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Text(if (state.engineEnabled) "Pause engine" else "Start engine")
                }
                Button(
                    onClick = { onOpenSheet(Sheet.Fixes) },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color.White.copy(alpha = 0.10f),
                        contentColor = Color.White
                    ),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Text("Health check")
                }
            }
        }
    }
}

@Composable
fun QuickAddRow(onNew: () -> Unit, onTemplates: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Button(
            onClick = onNew,
            modifier = Modifier.weight(1f),
            shape = RoundedCornerShape(14.dp),
            contentPadding = PaddingValues(vertical = 14.dp)
        ) {
            Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text("New automation")
        }
        Button(
            onClick = onTemplates,
            modifier = Modifier.weight(1f),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant,
                contentColor = MaterialTheme.colorScheme.onSurface
            ),
            contentPadding = PaddingValues(vertical = 14.dp)
        ) {
            Text("✨ Templates")
        }
    }
}

