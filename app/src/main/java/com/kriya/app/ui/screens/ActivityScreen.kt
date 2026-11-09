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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.kriya.app.data.Outcome
import com.kriya.app.data.RunLog
import com.kriya.app.ui.KriyaViewModel
import com.kriya.app.ui.components.EmptyState
import com.kriya.app.ui.components.SectionHeader
import com.kriya.app.ui.components.SurfaceCard
import com.kriya.app.ui.components.timeAgo

@Composable
fun ActivityScreen(vm: KriyaViewModel, modifier: Modifier = Modifier) {
    val log = vm.state.log
    LazyColumn(modifier = modifier.fillMaxWidth(), contentPadding = PaddingValues(bottom = 120.dp)) {
        item {
            Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
                Text("Activity", style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold)
                Text(
                    "Every run, skip and failure — with the reason.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        if (log.isEmpty()) {
            item {
                EmptyState(
                    emoji = "🧾",
                    title = "Nothing has run yet",
                    body = "As soon as an automation fires, you'll see exactly what it did here."
                )
            }
        } else {
            item {
                SectionHeader("Last ${log.size} events") {
                    TextButton(onClick = { vm.clearLog() }) { Text("Clear") }
                }
            }
            items(log, key = { it.id }) { entry -> LogRow(entry) }
        }
    }
}

@Composable
private fun LogRow(entry: RunLog) {
    val (color, emoji) = when (entry.outcome) {
        Outcome.SUCCESS -> Color(0xFF3DDC97) to "✓"
        Outcome.SKIPPED -> Color(0xFF9AA8BF) to "…"
        Outcome.BLOCKED -> Color(0xFFFFB74D) to "⏸"
        Outcome.FAILED -> Color(0xFFFF7A8A) to "!"
    }
    Row(Modifier.padding(horizontal = 20.dp, vertical = 4.dp)) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                Modifier.size(28.dp).clip(CircleShape).background(color.copy(alpha = 0.16f)),
                contentAlignment = Alignment.Center
            ) { Text(emoji, color = color, style = MaterialTheme.typography.labelLarge) }
            Box(Modifier.width(2.dp).height(28.dp).background(MaterialTheme.colorScheme.outline.copy(alpha = 0.4f)))
        }
        Spacer(Modifier.width(12.dp))
        SurfaceCard {
            Column(Modifier.padding(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        entry.macroName,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        timeAgo(entry.at),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Spacer(Modifier.height(3.dp))
                Text(
                    entry.message.ifBlank { entry.outcome.name.lowercase() },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(6.dp))
                Box(
                    Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(color.copy(alpha = 0.14f))
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Text(
                        when (entry.outcome) {
                            Outcome.SUCCESS -> "Ran"
                            Outcome.SKIPPED -> "Skipped"
                            Outcome.BLOCKED -> "Blocked"
                            Outcome.FAILED -> "Failed"
                        },
                        style = MaterialTheme.typography.labelMedium,
                        color = color,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}
