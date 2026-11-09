package com.kriya.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.kriya.app.data.Prefs
import com.kriya.app.ui.screens.ActivityScreen
import com.kriya.app.ui.screens.BuildScreen
import com.kriya.app.ui.screens.EditorScreen
import com.kriya.app.ui.screens.HomeScreen
import com.kriya.app.ui.screens.OnboardingSheet
import com.kriya.app.ui.screens.SetupScreen

@Composable
fun KriyaRoot(prefs: Prefs, vm: KriyaViewModel = viewModel()) {
    val state = vm.state
    var sheet by remember { mutableStateOf<Sheet?>(null) }
    val context = LocalContext.current

    // Refresh live device state whenever the app comes back to the foreground.
    LaunchedEffect(Unit) {
        vm.refresh()
    }

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        val editing = vm.editing

        if (editing != null) {
            BackHandler { vm.closeEditor(save = false) }
            EditorScreen(
                vm = vm,
                macro = editing,
                onBack = { vm.closeEditor(save = false) }
            )
        } else {
            Scaffold(
                containerColor = MaterialTheme.colorScheme.background,
                bottomBar = {
                    NavigationBar(
                        containerColor = MaterialTheme.colorScheme.surface,
                        tonalElevation = 0.dp
                    ) {
                        Tab.entries.forEach { tab ->
                            NavigationBarItem(
                                selected = vm.tab == tab,
                                onClick = { vm.setTab(tab) },
                                icon = {
                                    Icon(
                                        when (tab) {
                                            Tab.HOME -> Icons.Rounded.Home
                                            Tab.BUILD -> Icons.Rounded.Tune
                                            Tab.LOG -> Icons.Rounded.History
                                            Tab.SETTINGS -> Icons.Rounded.Settings
                                        },
                                        contentDescription = tab.label
                                    )
                                },
                                label = { Text(tab.label) },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = MaterialTheme.colorScheme.primary,
                                    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            )
                        }
                    }
                }
            ) { padding ->
                Box(
                    Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .statusBarsPadding()
                ) {
                    when (vm.tab) {
                        Tab.HOME -> HomeScreen(
                            vm = vm,
                            onOpenMacro = { vm.openEditor(it) },
                            onOpenSheet = { sheet = it }
                        )
                        Tab.BUILD -> BuildScreen(vm = vm, onOpenSheet = { sheet = it })
                        Tab.LOG -> ActivityScreen(vm)
                        Tab.SETTINGS -> SetupScreen(vm)
                    }

                    // Quick add button on Home
                    if (vm.tab == Tab.HOME) {
                        Row(
                            Modifier
                                .align(Alignment.BottomCenter)
                                .navigationBarsPadding()
                                .padding(bottom = 12.dp)
                        ) {
                            androidx.compose.material3.ExtendedFloatingActionButton(
                                onClick = { vm.newMacro() },
                                containerColor = MaterialTheme.colorScheme.primary,
                                contentColor = Color.White,
                                shape = RoundedCornerShape(16.dp)
                            ) {
                                Icon(Icons.Rounded.Bolt, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                                Text("New automation", fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
            }
        }

        // Toast
        val toast = ToastBus.message.value ?: vm.toast
        LaunchedEffect(toast) {
            if (toast != null) {
                kotlinx.coroutines.delay(2200)
                ToastBus.message.value = null
                vm.dismissToast()
            }
        }
        AnimatedVisibility(
            visible = toast != null,
            enter = slideInVertically { it / 2 } + fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.BottomCenter)
        ) {
            Snackbar(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 84.dp),
                shape = RoundedCornerShape(14.dp)
            ) { Text(toast ?: "") }
        }

        // Run result sheet
        vm.lastResult?.let { result ->
            RunResultDialog(result = result, onDismiss = { vm.clearResult() })
        }

        sheet?.let {
            AppSheet(sheet = it, vm = vm, currentTab = vm.tab) { sheet = null }
        }

        if (vm.onboarding) {
            OnboardingSheet(
                vm = vm,
                onDone = { vm.finishOnboarding() }
            )
        }
    }
}

@Composable
private fun RunResultDialog(result: com.kriya.app.engine.RunResult, onDismiss: () -> Unit) {
    val (emoji, color) = when (result.outcome) {
        com.kriya.app.data.Outcome.SUCCESS -> "✅" to Color(0xFF3DDC97)
        com.kriya.app.data.Outcome.BLOCKED -> "⏸" to Color(0xFFFFB74D)
        com.kriya.app.data.Outcome.FAILED -> "⚠️" to MaterialTheme.colorScheme.error
        com.kriya.app.data.Outcome.SKIPPED -> "…" to MaterialTheme.colorScheme.onSurfaceVariant
    }
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(emoji)
                Spacer(Modifier.width(8.dp))
                Column {
                    Text(result.macroName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(
                        result.headline,
                        style = MaterialTheme.typography.bodyMedium,
                        color = color
                    )
                }
            }
        },
        text = {
            Column {
                if (result.steps.isEmpty()) {
                    Text(
                        "Kriya checked the conditions first and stopped — that's why nothing happened.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                result.steps.forEachIndexed { i, (action, step) ->
                    Row(Modifier.padding(vertical = 3.dp)) {
                        Text(if (step.ok) "✓" else "✕", color = if (step.ok) Color(0xFF3DDC97) else MaterialTheme.colorScheme.error)
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text(
                                com.kriya.app.engine.Catalog.actionTitle(action),
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Medium
                            )
                            Text(
                                step.message,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    "Every run is also saved in Activity.",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Got it") } }
    )
}
