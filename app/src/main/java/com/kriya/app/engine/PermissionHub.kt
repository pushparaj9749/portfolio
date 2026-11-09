package com.kriya.app.engine

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat

data class PermissionItem(
    val key: String,
    val title: String,
    val why: String,
    val emoji: String,
    val granted: Boolean,
    val required: Boolean,
    val steps: List<String>,
    val open: () -> Unit
)

/** Collects every special access Kriya can use, with a plain-language reason for each. */
object PermissionHub {

    fun items(context: Context): List<PermissionItem> {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val packageUri = Uri.parse("package:${context.packageName}")

        return listOf(
            PermissionItem(
                key = Perms.NOTIFICATIONS,
                title = "Notifications",
                why = "So Kriya can show you results and warnings.",
                emoji = "🔔",
                granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
                        PackageManager.PERMISSION_GRANTED
                } else nm.areNotificationsEnabled(),
                required = false,
                steps = listOf(
                    "Tap the button below — Kriya's notification page opens directly",
                    "Turn \"Allow notifications\" ON",
                    "Come back and tap \"Re-check\""
                )
            ) {
                runCatching {
                    context.startActivity(
                        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                }
            },
            PermissionItem(
                key = Perms.BATTERY_OPT,
                title = "Battery optimisation off",
                why = "Phones from Xiaomi, Oppo, Vivo, Samsung and OnePlus silently freeze automation apps. This is the single biggest reason macros stop working.",
                emoji = "🔋",
                granted = pm.isIgnoringBatteryOptimizations(context.packageName),
                required = true,
                steps = listOf(
                    "Tap the button below — a dialog should appear with Kriya already selected",
                    "Choose \"Don't optimise\" or \"Unrestricted\"",
                    "If nothing happens: go to Settings → Apps → Kriya → Battery → Unrestricted",
                    "Can't find Kriya? Use \"Open App info\" above — battery is one tap from there"
                )
            ) {
                runCatching {
                    context.startActivity(
                        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, packageUri)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                }
            },
            PermissionItem(
                key = "dnd",
                title = "Do Not Disturb access",
                why = "Needed to switch silent / vibrate / DND from an automation.",
                emoji = "🌙",
                granted = nm.isNotificationPolicyAccessGranted,
                required = false,
                steps = listOf(
                    "Tap the button below to open DND access settings",
                    "Find \"Kriya\" in the list and toggle it ON",
                    "Don't see it? Scroll down or type \"Kriya\" in the Settings search bar"
                )
            ) {
                runCatching {
                    context.startActivity(
                        Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                }
            },
            PermissionItem(
                key = Perms.EXACT_ALARM,
                title = "Alarms & reminders",
                why = "Lets time triggers fire at the exact minute instead of a few minutes late.",
                emoji = "⏰",
                granted = Scheduling.canScheduleExact(context),
                required = false,
                steps = listOf(
                    "Tap the button below",
                    "If a toggle appears for Kriya, switch it ON",
                    "On Android 14+ this is usually granted automatically"
                )
            ) {
                runCatching {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        context.startActivity(
                            Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, packageUri)
                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        )
                    }
                }
            },
            PermissionItem(
                key = Perms.USAGE_ACCESS,
                title = "Usage access",
                why = "Only used to know which app you just opened, for \"when I open…\" triggers.",
                emoji = "🚀",
                granted = UsageWatcher(context).hasAccess(),
                required = false,
                steps = listOf(
                    "Tap the button below — opens the usage access screen",
                    "Find \"Kriya\" in the app list (use the search bar at the top)",
                    "Toggle \"Permit usage access\" ON"
                )
            ) {
                runCatching {
                    context.startActivity(
                        Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                }
            },
            PermissionItem(
                key = "write_settings",
                title = "Modify system settings",
                why = "Needed for the brightness action.",
                emoji = "☀️",
                granted = Settings.System.canWrite(context),
                required = false,
                steps = listOf(
                    "Tap the button below — Kriya should already be selected",
                    "Toggle \"Allow modifying system settings\" ON",
                    "If nothing happens: Settings → Apps → Kriya → Allow modifying system settings"
                )
            ) {
                runCatching {
                    context.startActivity(
                        Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, packageUri)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                }
            }
        )
    }

    fun grantedKeys(context: Context): Set<String> =
        items(context).filter { it.granted }.map { it.key }.toSet()

    fun missingRequired(context: Context): List<PermissionItem> =
        items(context).filter { it.required && !it.granted }

    fun openAppInfo(context: Context) {
        runCatching {
            context.startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:${context.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
    }
}
