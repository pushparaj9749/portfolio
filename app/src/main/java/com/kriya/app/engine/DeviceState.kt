package com.kriya.app.engine

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.PowerManager
import java.time.DayOfWeek
import java.time.LocalDateTime

/** Reads live device state into the pure [DeviceSnapshot] used by constraint checks. */
object DeviceState {

    fun snapshot(context: Context, wifiSsidOverride: String? = null): DeviceSnapshot {
        val battery = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = battery?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = battery?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        val percent = if (level >= 0 && scale > 0) level * 100 / scale else -1
        val status = battery?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1

        val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val km = context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager

        val now = LocalDateTime.now()
        return DeviceSnapshot(
            charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL,
            wifiSsid = wifiSsidOverride ?: currentSsid(context),
            screenOn = pm?.isInteractive ?: true,
            batteryPercent = if (percent in 0..100) percent else -1,
            dayOfWeek = now.dayOfWeek ?: DayOfWeek.MONDAY,
            hour = now.hour
        )
    }

    /** True when the device is showing the lock screen (keyguard). */
    fun locked(context: Context): Boolean {
        val km = context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager ?: return false
        return km.isKeyguardLocked
    }

    fun currentSsid(context: Context): String? {
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            ?: return null
        @Suppress("DEPRECATION")
        val info = wifi.connectionInfo ?: return null
        @Suppress("DEPRECATION")
        val raw = info.ssid ?: return null
        val ssid = raw.trim().removeSurrounding("\"")
        return ssid.takeIf { it.isNotEmpty() && it != "<unknown ssid>" }
    }

    fun isOnline(context: Context): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return false
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}
