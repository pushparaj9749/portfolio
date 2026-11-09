package com.kriya.app.data

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager

data class AppEntry(val packageName: String, val label: String) {
    val emoji: String get() = label.take(1).uppercase()
}

/** Installed, launchable apps — used by the "open app" action and the app-opened trigger. */
object Apps {

    fun launchable(context: Context): List<AppEntry> {
        val pm = context.packageManager
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        @Suppress("DEPRECATION")
        val resolved = pm.queryIntentActivities(intent, 0)
        return resolved
            .mapNotNull { info ->
                val pkg = info.activityInfo?.packageName ?: return@mapNotNull null
                val label = runCatching {
                    info.loadLabel(pm).toString()
                }.getOrDefault(pkg)
                AppEntry(pkg, label)
            }
            .filter { it.packageName != context.packageName }
            .distinctBy { it.packageName }
            .sortedBy { it.label.lowercase() }
    }

    fun labelOf(context: Context, packageName: String): String {
        if (packageName.isBlank()) return ""
        return runCatching {
            val pm = context.packageManager
            pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString()
        }.getOrDefault(packageName)
    }

    fun isInstalled(context: Context, packageName: String): Boolean {
        if (packageName.isBlank()) return false
        return runCatching {
            context.packageManager.getApplicationInfo(packageName, 0)
            true
        }.getOrDefault(false)
    }

    @Suppress("unused")
    private fun flag() = PackageManager.MATCH_DEFAULT_ONLY
}
