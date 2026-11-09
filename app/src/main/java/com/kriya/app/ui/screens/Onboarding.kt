package com.kriya.app.ui.screens

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
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowForward
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.kriya.app.engine.PermissionHub
import com.kriya.app.ui.KriyaViewModel
import com.kriya.app.ui.components.SurfaceCard
import kotlinx.coroutines.launch

private data class Slide(
    val emoji: String,
    val title: String,
    val body: String,
    val color: Long
)

private val slides = listOf(
    Slide(
        "⚡", "Automate in three steps",
        "Every automation is just: when this happens → only when these conditions match → do this. No scripting, no guesswork.",
        0xFF6F8CFF
    ),
    Slide(
        "🗣️", "Always in plain English",
        "Each automation is summarised as one readable sentence, so you can tell at a glance what it will do.",
        0xFF3DDC97
    ),
    Slide(
        "🔍", "No silent failures",
        "If a macro is skipped, Kriya writes down exactly why — a missing permission, a constraint, or a failed action.",
        0xFFFFB74D
    ),
    Slide(
        "🛟", "Set it up once, properly",
        "Battery optimisation is the reason automations die on Xiaomi, Oppo and Samsung phones. Kriya checks it for you.",
        0xFFE879A8
    )
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OnboardingSheet(vm: KriyaViewModel, onDone: () -> Unit) {
    val context = LocalContext.current
    val pager = rememberPagerState(pageCount = { slides.size + 1 })
    val scope = rememberCoroutineScope()

    ModalBottomSheet(
        onDismissRequest = onDone,
        containerColor = MaterialTheme.colorScheme.surface
    ) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 28.dp)) {
            HorizontalPager(state = pager) { page ->
                if (page < slides.size) {
                    val slide = slides[page]
                    Column(Modifier.fillMaxWidth()) {
                        Box(
                            Modifier
                                .size(76.dp)
                                .clip(CircleShape)
                                .background(Color(slide.color).copy(alpha = 0.16f)),
                            contentAlignment = Alignment.Center
                        ) { Text(slide.emoji, style = MaterialTheme.typography.displaySmall) }
                        Spacer(Modifier.height(18.dp))
                        Text(
                            slide.title,
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            slide.body,
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                } else {
                    Column(Modifier.fillMaxWidth()) {
                        Text(
                            "Two taps to go live",
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(Modifier.height(12.dp))
                        PermissionHub.items(context).take(3).forEach { item ->
                            SurfaceCard(modifier = Modifier.padding(bottom = 8.dp)) {
                                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Text(item.emoji, style = MaterialTheme.typography.titleLarge)
                                    Spacer(Modifier.width(12.dp))
                                    Column(Modifier.weight(1f)) {
                                        Text(
                                            item.title,
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.Medium
                                        )
                                        Text(
                                            item.why,
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    TextButton(onClick = { if (!item.granted) item.open() }) {
                                        Text(if (item.granted) "Done" else "Allow")
                                    }
                                }
                            }
                        }
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "You can change all of this later in Setup.",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            Spacer(Modifier.height(20.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    repeat(slides.size + 1) { i ->
                        Box(
                            Modifier
                                .size(if (i == pager.currentPage) 20.dp else 7.dp, 7.dp)
                                .clip(CircleShape)
                                .background(
                                    if (i == pager.currentPage) MaterialTheme.colorScheme.primary
                                    else MaterialTheme.colorScheme.outline
                                )
                        )
                    }
                }
                Spacer(Modifier.weight(1f))
                if (pager.currentPage < slides.size) {
                    Button(
                        onClick = { scope.launch { pager.animateScrollToPage(pager.currentPage + 1) } },
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("Next")
                        Spacer(Modifier.width(6.dp))
                        Icon(Icons.Rounded.ArrowForward, contentDescription = null, modifier = Modifier.size(16.dp))
                    }
                } else {
                    Button(onClick = onDone, shape = RoundedCornerShape(12.dp)) { Text("Start using Kriya") }
                }
            }
        }
    }
}
