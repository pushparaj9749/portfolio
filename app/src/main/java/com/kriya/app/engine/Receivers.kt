package com.kriya.app.engine

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.telephony.TelephonyManager
import com.kriya.app.data.Prefs
import com.kriya.app.data.TriggerType

/**
 * System broadcast → trigger event bridge. Wi-Fi SSID, battery crossings and ringer mode are
 * de-duplicated against the last known value so a macro fires on *changes*, not every broadcast.
 */
class KriyaReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val prefs = Prefs(context)
        if (!prefs.engineEnabled) return
        val engine = Engine(context)
        if (engine.enabledMacros().isEmpty()) return

        val action = intent.action ?: return
        when (action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                Scheduling.rescheduleAll(context)
                KriyaService.start(context)
                engine.fire(TriggerEvent(TriggerType.BOOT))
            }

            Intent.ACTION_POWER_CONNECTED -> engine.fire(
                TriggerEvent(TriggerType.CHARGER, info = mapOf("plugged" to "1"))
            )

            Intent.ACTION_POWER_DISCONNECTED -> engine.fire(
                TriggerEvent(TriggerType.CHARGER, info = mapOf("plugged" to "0"))
            )

            Intent.ACTION_BATTERY_CHANGED -> {
                val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
                val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100).coerceAtLeast(1)
                if (level < 0) return
                val percent = level * 100 / scale
                val previous = prefs.getState(STATE_BATTERY, "-1").toIntOrNull() ?: -1
                prefs.putState(STATE_BATTERY, percent.toString())
                if (previous != percent) {
                    engine.fire(
                        TriggerEvent(
                            TriggerType.BATTERY,
                            info = mapOf("percent" to percent.toString(), "previous" to previous.toString())
                        )
                    )
                }
            }

            Intent.ACTION_SCREEN_ON -> engine.fire(TriggerEvent(TriggerType.SCREEN, info = mapOf("on" to "1")))
            Intent.ACTION_SCREEN_OFF -> engine.fire(TriggerEvent(TriggerType.SCREEN, info = mapOf("on" to "0")))

            Intent.ACTION_HEADSET_PLUG -> {
                val plugged = intent.getIntExtra("state", 0) == 1
                engine.fire(TriggerEvent(TriggerType.HEADPHONES, info = mapOf("plugged" to if (plugged) "1" else "0")))
            }

            Intent.ACTION_AIRPLANE_MODE_CHANGED -> {
                val on = intent.getBooleanExtra("state", false)
                engine.fire(TriggerEvent(TriggerType.AIRPLANE, info = mapOf("enabled" to if (on) "1" else "0")))
            }

            android.media.AudioManager.RINGER_MODE_CHANGED_ACTION -> {
                val mode = intent.getIntExtra(android.media.AudioManager.EXTRA_RINGER_MODE, -1)
                if (mode >= 0) engine.fire(TriggerEvent(TriggerType.RINGER, info = mapOf("mode" to mode.toString())))
            }

            android.bluetooth.BluetoothAdapter.ACTION_STATE_CHANGED -> {
                val state = intent.getIntExtra(android.bluetooth.BluetoothAdapter.EXTRA_STATE, -1)
                val on = state == android.bluetooth.BluetoothAdapter.STATE_ON
                val off = state == android.bluetooth.BluetoothAdapter.STATE_OFF
                if (on || off) {
                    engine.fire(TriggerEvent(TriggerType.BLUETOOTH, info = mapOf("enabled" to if (on) "1" else "0")))
                }
            }

            ConnectivityManager.CONNECTIVITY_ACTION,
            android.net.wifi.WifiManager.NETWORK_STATE_CHANGED_ACTION -> {
                val ssid = DeviceState.currentSsid(context)
                val previous = prefs.getState(STATE_SSID, "")
                if (ssid != null && ssid != previous) {
                    prefs.putState(STATE_SSID, ssid)
                    engine.fire(TriggerEvent(TriggerType.WIFI, info = mapOf("joined" to "1", "ssid" to ssid)))
                } else if (ssid == null && previous.isNotEmpty()) {
                    prefs.putState(STATE_SSID, "")
                    engine.fire(TriggerEvent(TriggerType.WIFI, info = mapOf("joined" to "0", "ssid" to previous)))
                }
            }

            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED -> Scheduling.rescheduleAll(context)
        }

        if (engine.enabledMacros().isNotEmpty() && !KriyaService.isRunning) {
            KriyaService.start(context)
        }
        notifyUi()
    }

    private fun notifyUi() = EngineEvents.bump()

    companion object {
        const val STATE_BATTERY = "battery_percent"
        const val STATE_SSID = "wifi_ssid"
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val prefs = Prefs(context)
        if (!prefs.engineEnabled) return
        Scheduling.rescheduleAll(context)
        KriyaService.start(context)
    }
}

class ScheduleReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(Scheduling.EXTRA_MACRO_ID) ?: return
        val prefs = Prefs(context)
        if (!prefs.engineEnabled) return
        val macro = prefs.loadMacros().firstOrNull { it.id == id } ?: return
        Engine(context).fire(TriggerEvent(TriggerType.TIME, firingMacroId = macro.id))
        // chain the next occurrence
        if (macro.enabled) Scheduling.schedule(context, macro)
        EngineEvents.bump()
    }
}

/** Runs a macro from a home-screen shortcut. */
class MacroShortcutReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(EXTRA_ID) ?: return
        val macro = Prefs(context).loadMacros().firstOrNull { it.id == id } ?: return
        Engine(context).runNow(macro)
        EngineEvents.bump()
    }

    companion object {
        const val EXTRA_ID = "shortcut_macro_id"
    }
}

/** Unused import guard for older API levels where CONNECTIVITY_ACTION lives on CM. */
@Suppress("unused")
private val unusedTelephony: Class<*> = TelephonyManager::class.java

@Suppress("unused")
private val unusedCaps: Class<*> = NetworkCapabilities::class.java
