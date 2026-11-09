package com.kriya.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.PauseCircleOutline
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.kriya.app.data.Macro
import com.kriya.app.engine.Catalog
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId

@Composable
fun MacroCard(
    macro: Macro,
    nextRun: String?,
    highlighted: Boolean = false,
    onOpen: () -> Unit,
    onToggle: (Boolean) -> Unit,
    onRun: () -> Unit,
    modifier: Modifier = Modifier
) {
    val accent = Color(macro.color)
    val border by animateColorAsState(
        targetValue = if (highlighted) accent.copy(alpha = 0.8f)
        else MaterialTheme.colorScheme.outline.copy(alpha = 0.45f),
        label = "border"
    )
    SurfaceCard(modifier = modifier, onClick = onOpen) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(46.dp)
                        .clip(androidx.compose.foundation.shape.RoundedCornerShape(15.dp))
                        .background(accent.copy(alpha = 0.16f)),
                    contentAlignment = Alignment.Center
                ) { Text(macro.icon, style = MaterialTheme.typography.titleLarge) }

                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            macro.name,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false)
                        )
                        if (!macro.ready) {
                            Spacer(Modifier.width(6.dp))
                            Icon(
                                Icons.Rounded.ErrorOutline,
                                contentDescription = "Incomplete macro",
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                    Text(
                        text = Catalog.summarise(macro.triggers, macro.constraints, macro.actions),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Switch(checked = macro.enabled, onCheckedChange = onToggle)
            }

            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (macro.enabled && macro.ready) {
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .clip(CircleShape)
                            .background(Color(0xFF3DDC97))
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = "Armed",
                        style = MaterialTheme.typography.labelMedium,
                        color = Color(0xFF3DDC97),
                        fontWeight = FontWeight.SemiBold
                    )
                } else {
                    Icon(
                        Icons.Rounded.PauseCircleOutline,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        text = if (macro.enabled) "Needs setup" else "Off",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                if (nextRun != null && macro.enabled) {
                    Spacer(Modifier.width(12.dp))
                    Icon(
                        Icons.Rounded.Schedule,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        nextRun,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1
                    )
                }
                Spacer(Modifier.weight(1f))
                if (macro.runCount > 0) {
                    Text(
                        "${macro.runCount}× run",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.width(4.dp))
                }
                IconButton(onClick = onRun, modifier = Modifier.size(34.dp)) {
                    Icon(
                        Icons.Rounded.PlayArrow,
                        contentDescription = "Test run",
                        tint = accent,
                        modifier = Modifier.size(22.dp)
                    )
                }
            }

            if (macro.lastResult.isNotBlank() && macro.lastRunAt > 0) {
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(androidx.compose.foundation.shape.RoundedCornerShape(10.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f))
                        .padding(horizontal = 10.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        Icons.Rounded.Bolt,
                        contentDescription = null,
                        tint = accent,
                        modifier = Modifier.size(13.dp)
                    )
                    Text(
                        text = "${timeAgo(macro.lastRunAt)} · ${macro.lastResult}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

@Composable
fun StaleWarningCard(text: String, onClick: () -> Unit) {
    SurfaceCard(onClick = onClick) {
        Row(
            Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("🛟", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.width(12.dp))
            Text(
                text,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f)
            )
            Icon(
                Icons.Rounded.PlayArrow,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary
            )
        }
    }
}

fun timeAgo(at: Long): String {
    if (at <= 0) return "never"
    val then = LocalDateTime.ofInstant(Instant.ofEpochMilli(at), ZoneId.systemDefault())
    val now = LocalDateTime.now()
    val minutes = java.time.Duration.between(then, now).toMinutes()
    return when {
        minutes < 1 -> "just now"
        minutes < 60 -> "${minutes}m ago"
        minutes < 60 * 24 -> "${minutes / 60}h ago"
        minutes < 60 * 24 * 7 -> "${minutes / (60 * 24)}d ago"
        else -> then.format(java.time.format.DateTimeFormatter.ofPattern("d MMM"))
    }
}

