package com.kriya.app.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.kriya.app.BuildConfig
import com.kriya.app.engine.PermissionItem
import com.kriya.app.ui.KriyaViewModel
import com.kriya.app.ui.components.SectionHeader
import com.kriya.app.ui.components.SurfaceCard
import com.kriya.app.ui.theme.Mint

@Composable
fun SetupScreen(vm: KriyaViewModel, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val state = vm.state
    var showImport by remember { mutableStateOf(false) }
    var showExport by remember { mutableStateOf(false) }
    var importText by remember { mutableStateOf("") }
    var replaceAll by remember { mutableStateOf(false) }

    LazyColumn(modifier = modifier.fillMaxWidth(), contentPadding = PaddingValues(bottom = 120.dp)) {
        item {
            Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
                Text("Setup", style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold)
                Text(
                    "Kriya only asks for what a macro actually needs.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(16.dp))
                SurfaceCard {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                "Background engine",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                if (state.engineEnabled) "Running — triggers are watched live" else "Paused — nothing will fire",
                                style = MaterialTheme.typography.bodyMedium,
                                color = if (state.engineEnabled) Mint else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Switch(checked = state.engineEnabled, onCheckedChange = { vm.setEngine(it) })
                    }
                }
            }
        }

        item { SectionHeader("Permissions") }

        items(state.permissions.size) { index ->
            val item: PermissionItem = state.permissions[index]
            Column(Modifier.padding(horizontal = 20.dp, vertical = 4.dp)) {
                SurfaceCard(onClick = { if (!item.granted) item.open() }) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(item.emoji, style = MaterialTheme.typography.titleLarge)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    item.title,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Medium
                                )
                                if (item.required) {
                                    Spacer(Modifier.width(6.dp))
                                    Text(
                                        "required",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.error
                                    )
                                }
                            }
                            Text(
                                item.why,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        if (item.granted) {
                            Box(
                                Modifier
                                    .size(26.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(Mint.copy(alpha = 0.18f)),
                                contentAlignment = Alignment.Center
                            ) { Icon(Icons.Rounded.Check, contentDescription = "Granted", tint = Mint, modifier = Modifier.size(16.dp)) }
                        } else {
                            Icon(
                                Icons.Rounded.ChevronRight,
                                contentDescription = "Open settings",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }

        item {
            Row(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
                OutlinedButton(
                    onClick = {
                        val msg = vm.recheckPermissions()
                        vm.setTab(com.kriya.app.ui.Tab.SETTINGS)
                        vm.refresh()
                        Toast(msg)
                    },
                    shape = RoundedCornerShape(12.dp)
                ) { Text("Re-check permissions") }
            }
        }

        item { SectionHeader("Data") }

        item {
            Column(Modifier.padding(horizontal = 20.dp)) {
                SurfaceCard(onClick = { showExport = true }) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("📤", style = MaterialTheme.typography.titleLarge)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text("Export automations", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
                            Text(
                                "Copy a backup you can restore or share.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                SurfaceCard(onClick = { showImport = true }) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("📥", style = MaterialTheme.typography.titleLarge)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text("Import automations", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
                            Text(
                                "Paste a backup or a shared automation.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }

        item { SectionHeader("About") }

        item {
            Column(Modifier.padding(horizontal = 20.dp)) {
                SurfaceCard {
                    Column(Modifier.padding(16.dp)) {
                        Text("Kriya", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text(
                            "Version ${BuildConfig.VERSION_NAME} · free, no ads, no account, no telemetry.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "Design goals: explain every automation in one sentence, show the reason for every skip, and never list a capability that isn't implemented.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }

        item {
            Spacer(Modifier.height(10.dp))
            Row(Modifier.padding(horizontal = 20.dp)) {
                Button(
                    onClick = { vm.startOnboarding() },
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                        contentColor = MaterialTheme.colorScheme.onSurface
                    )
                ) { Text("Replay intro tour") }
            }
        }
    }

    if (showExport) {
        val json = remember { vm.exportJson() }
        AlertDialog(
            onDismissRequest = { showExport = false },
            title = { Text("Export") },
            text = {
                Column {
                    Text(
                        "Copy this JSON to back up or share your automations.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = json,
                        onValueChange = {},
                        readOnly = true,
                        maxLines = 8,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(onClick = {
                    clipboard.setText(AnnotatedString(json))
                    showExport = false
                }) { Text("Copy JSON") }
            },
            dismissButton = { TextButton(onClick = { showExport = false }) { Text("Close") } }
        )
    }

    if (showImport) {
        AlertDialog(
            onDismissRequest = { showImport = false },
            title = { Text("Import") },
            text = {
                Column {
                    OutlinedTextField(
                        value = importText,
                        onValueChange = { importText = it },
                        placeholder = { Text("Paste JSON here") },
                        maxLines = 6,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Switch(checked = replaceAll, onCheckedChange = { replaceAll = it })
                        Spacer(Modifier.width(8.dp))
                        Text("Replace existing automations", style = MaterialTheme.typography.bodyMedium)
                    }
                }
            },
            confirmButton = {
                Button(onClick = {
                    if (vm.importJson(importText, replaceAll)) {
                        showImport = false
                        importText = ""
                    }
                }) { Text("Import") }
            },
            dismissButton = { TextButton(onClick = { showImport = false }) { Text("Cancel") } }
        )
    }
}

/** Lightweight snackbar substitute: the root shows the toast state. */
private fun Toast(message: String) {
    com.kriya.app.ui.ToastBus.show(message)
}
