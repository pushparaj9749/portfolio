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
                required = false
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
                required = true
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
                required = false
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
                required = false
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
                required = false
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
                required = false
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
}
