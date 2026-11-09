package com.kriya.app.ui

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.kriya.app.engine.Catalog
import com.kriya.app.engine.Finding
import com.kriya.app.engine.Severity
import com.kriya.app.engine.Templates
import com.kriya.app.ui.components.SurfaceCard

sealed interface Sheet {
    data object Templates : Sheet
    data class TemplateDetail(val key: String) : Sheet
    data object Fixes : Sheet
}

object ToastBus {
    val message = mutableStateOf<String?>(null)
    fun show(text: String) { message.value = text }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppSheet(sheet: Sheet, vm: KriyaViewModel, currentTab: Tab, onDismiss: () -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surface
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(bottom = 32.dp)
        ) {
            when (sheet) {
                is Sheet.Templates -> TemplateGallery(vm) { onDismiss() }
                is Sheet.TemplateDetail -> TemplateDetail(vm, sheet.key) { onDismiss() }
                is Sheet.Fixes -> HealthCheck(vm)
            }
        }
    }
}

@Composable
private fun SheetTitle(title: String, subtitle: String) {
    Text(title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
    Spacer(Modifier.height(4.dp))
    Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Spacer(Modifier.height(16.dp))
}

@Composable
private fun TemplateGallery(vm: KriyaViewModel, close: () -> Unit) {
    var detail by remember { mutableStateOf<String?>(null) }
    SheetTitle("Template gallery", "Ready to use in one tap. Everything here is fully supported.")
    Templates.all.forEach { template ->
        SurfaceCard(
            modifier = Modifier.padding(bottom = 8.dp),
            onClick = { detail = template.key }
        ) {
            Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .size(44.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color(template.color).copy(alpha = 0.16f)),
                    contentAlignment = Alignment.Center
                ) { Text(template.emoji, style = MaterialTheme.typography.titleLarge) }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(template.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(
                        template.blurb,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
    if (detail != null) {
        val template = Templates.byKey(detail!!)
        if (template != null) {
            Spacer(Modifier.height(12.dp))
            SurfaceCard {
                Column(Modifier.padding(16.dp)) {
                    Text(
                        Catalog.summarise(
                            template.build("x").triggers,
                            template.build("x").constraints,
                            template.build("x").actions
                        ),
                        style = MaterialTheme.typography.bodyLarge
                    )
                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = {
                            vm.useTemplate(template.key)
                            close()
                        },
                        shape = RoundedCornerShape(12.dp)
                    ) { Text("Add \"${template.title}\"") }
                }
            }
        }
    }
}

@Composable
private fun TemplateDetail(vm: KriyaViewModel, key: String, close: () -> Unit) {
    val template = Templates.byKey(key)
    if (template == null) {
        Text("Template not found")
        return
    }
    val macro = remember { template.build("preview") }
    Box(
        Modifier
            .size(64.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(Color(template.color).copy(alpha = 0.16f)),
        contentAlignment = Alignment.Center
    ) { Text(template.emoji, style = MaterialTheme.typography.headlineMedium) }
    Spacer(Modifier.height(12.dp))
    SheetTitle(template.title, template.blurb)

    SurfaceCard {
        Column(Modifier.padding(16.dp)) {
            Text("When", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            macro.triggers.forEach { Text("• " + Catalog.triggerTitle(it), style = MaterialTheme.typography.bodyLarge) }
            if (macro.constraints.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Text("Only when", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.tertiary)
                macro.constraints.forEach {
                    Text("• " + com.kriya.app.engine.Constraints.describe(it), style = MaterialTheme.typography.bodyLarge)
                }
            }
            Spacer(Modifier.height(10.dp))
            Text("Then", style = MaterialTheme.typography.labelLarge, color = Color(0xFF3DDC97))
            macro.actions.forEach { Text("• " + Catalog.actionTitle(it), style = MaterialTheme.typography.bodyLarge) }
        }
    }
    Spacer(Modifier.height(14.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Button(
            onClick = {
                vm.useTemplate(template.key)
                close()
            },
            modifier = Modifier.weight(1f),
            shape = RoundedCornerShape(12.dp),
            contentPadding = PaddingValues(vertical = 14.dp)
        ) { Text("Add automation") }
        TextButton(onClick = close) { Text("Cancel") }
    }
}

@Composable
private fun HealthCheck(vm: KriyaViewModel) {
    SheetTitle("Health check", "Kriya checked your automations and permissions against this device.")
    val findings = vm.state.findings
    findings.forEach { finding ->
        FindingCard(finding) {
            vm.setTab(Tab.SETTINGS)
        }
    }
    Spacer(Modifier.height(10.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = { vm.recheckPermissions() }, shape = RoundedCornerShape(12.dp)) {
            Text("Re-check")
        }
        Button(
            onClick = { vm.setEngine(true) },
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant,
                contentColor = MaterialTheme.colorScheme.onSurface
            )
        ) { Text("Start engine") }
    }
}

@Composable
private fun FindingCard(finding: Finding, onFix: () -> Unit) {
    val (color, icon) = when (finding.severity) {
        Severity.ERROR -> MaterialTheme.colorScheme.error to Icons.Rounded.ErrorOutline
        Severity.WARN -> Color(0xFFFFB74D) to Icons.Rounded.WarningAmber
        Severity.INFO -> Color(0xFF3DDC97) to Icons.Rounded.CheckCircle
    }
    SurfaceCard(modifier = Modifier.padding(bottom = 8.dp)) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(
                    finding.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f)
                )
            }
            Spacer(Modifier.height(6.dp))
            Text(
                finding.detail,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (finding.fix.isNotBlank()) {
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Rounded.Info, contentDescription = null, tint = color, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(finding.fix, style = MaterialTheme.typography.labelLarge, color = color)
                }
            }
        }
    }
}
