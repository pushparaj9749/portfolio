package com.kriya.app.engine

import com.kriya.app.data.ActionSpec
import com.kriya.app.data.ActionType
import com.kriya.app.data.ConstraintSpec
import com.kriya.app.data.TriggerSpec
import com.kriya.app.data.TriggerType
import com.kriya.app.data.ConstraintType
import java.time.LocalTime

/**
 * Single source of truth for what a trigger / constraint / action *means*.
 * The engine, the editor UI and the plain-English summary all read from here, so a new
 * capability only has to be described once.
 */
data class TriggerInfo(
    val type: TriggerType,
    val title: String,
    val emoji: String,
    val short: String,
    val group: String
)

data class ActionInfo(
    val type: ActionType,
    val title: String,
    val emoji: String,
    val short: String,
    val group: String
)

data class ConstraintInfo(
    val type: ConstraintType,
    val title: String,
    val emoji: String,
    val short: String
)

object Catalog {

    val triggers = listOf(
        TriggerInfo(TriggerType.TIME, "Time of day", "🕒", "At a set clock time", "Time"),
        TriggerInfo(TriggerType.BATTERY, "Battery level", "🔋", "Battery crosses a level", "Device"),
        TriggerInfo(TriggerType.CHARGER, "Charger", "🔌", "Plugged in or unplugged", "Device"),
        TriggerInfo(TriggerType.WIFI, "Wi-Fi", "📶", "Joins or leaves a network", "Connectivity"),
        TriggerInfo(TriggerType.BLUETOOTH, "Bluetooth", "🔵", "Bluetooth state changes", "Connectivity"),
        TriggerInfo(TriggerType.SCREEN, "Screen", "📱", "Screen turns on or off", "Device"),
        TriggerInfo(TriggerType.APP, "App opened", "🚀", "An app comes to the foreground", "Apps"),
        TriggerInfo(TriggerType.HEADPHONES, "Headphones", "🎧", "Headset plugged in or out", "Device"),
        TriggerInfo(TriggerType.AIRPLANE, "Airplane mode", "✈️", "Airplane mode toggles", "Connectivity"),
        TriggerInfo(TriggerType.RINGER, "Ringer mode", "🔔", "Silent / vibrate / sound", "Device"),
        TriggerInfo(TriggerType.BOOT, "Phone restarted", "♻️", "Runs after a reboot", "Device"),
        TriggerInfo(TriggerType.MANUAL, "Manual / shortcut", "👆", "You tap it yourself", "Manual")
    )

    val actions = listOf(
        ActionInfo(ActionType.DND, "Do Not Disturb", "🌙", "Turn Do Not Disturb on or off", "Sound"),
        ActionInfo(ActionType.RINGER, "Ringer mode", "🔔", "Silent, vibrate or sound", "Sound"),
        ActionInfo(ActionType.VOLUME, "Set volume", "🔊", "Music volume level", "Sound"),
        ActionInfo(ActionType.TTS, "Speak text", "🗣️", "Read a phrase out loud", "Sound"),
        ActionInfo(ActionType.MEDIA_PLAY_PAUSE, "Media play/pause", "⏯️", "Toggle current media", "Sound"),
        ActionInfo(ActionType.MEDIA_NEXT, "Next track", "⏭️", "Skip to the next song", "Sound"),
        ActionInfo(ActionType.WIFI_PANEL, "Open Wi-Fi panel", "📶", "Jump to Wi-Fi settings", "Connectivity"),
        ActionInfo(ActionType.BLUETOOTH_PANEL, "Open Bluetooth", "🔵", "Jump to Bluetooth settings", "Connectivity"),
        ActionInfo(ActionType.BRIGHTNESS, "Brightness", "☀️", "Set screen brightness", "Display"),
        ActionInfo(ActionType.TORCH, "Torch", "🔦", "Flashlight on / off / toggle", "Device"),
        ActionInfo(ActionType.VIBRATE, "Vibrate", "📳", "Short vibration pattern", "Feedback"),
        ActionInfo(ActionType.NOTIFY, "Post notification", "🔔", "Show a notification", "Feedback"),
        ActionInfo(ActionType.OPEN_APP, "Open an app", "🚀", "Launch any installed app", "Apps"),
        ActionInfo(ActionType.WAIT, "Wait", "⏳", "Pause before the next step", "Logic")
    )

    val constraints = listOf(
        ConstraintInfo(ConstraintType.CHARGING, "Charging state", "🔌", "Only while charging / on battery"),
        ConstraintInfo(ConstraintType.WIFI_NAMED, "On a Wi-Fi network", "📶", "Only on a specific network"),
        ConstraintInfo(ConstraintType.SCREEN_LOCKED, "Screen state", "🔒", "Only when locked / unlocked"),
        ConstraintInfo(ConstraintType.BATTERY_AT_LEAST, "Battery at least", "🔋", "Only above a battery level"),
        ConstraintInfo(ConstraintType.DAYS_OF_WEEK, "Days of week", "📅", "Only on chosen days")
    )

    fun trigger(type: TriggerType) = triggers.first { it.type == type }
    fun action(type: ActionType) = actions.first { it.type == type }
    fun constraint(type: ConstraintType) = constraints.first { it.type == type }

    /** Sensible defaults so a freshly-picked component is already valid. */
    fun defaultTrigger(type: TriggerType): TriggerSpec = when (type) {
        TriggerType.TIME -> TriggerSpec(type, mapOf("time" to "07:00", "days" to Schedule.EVERY_DAY))
        TriggerType.BATTERY -> TriggerSpec(type, mapOf("percent" to "20", "direction" to "0"))
        TriggerType.CHARGER -> TriggerSpec(type, mapOf("plugged" to "1"))
        TriggerType.WIFI -> TriggerSpec(type, mapOf("state" to "1", "ssid" to ""))
        TriggerType.BLUETOOTH -> TriggerSpec(type, mapOf("enabled" to "1"))
        TriggerType.SCREEN -> TriggerSpec(type, mapOf("on" to "0"))
        TriggerType.APP -> TriggerSpec(type, mapOf("package" to "", "label" to ""))
        TriggerType.HEADPHONES -> TriggerSpec(type, mapOf("plugged" to "1"))
        TriggerType.AIRPLANE -> TriggerSpec(type, mapOf("enabled" to "1"))
        TriggerType.RINGER -> TriggerSpec(type, mapOf("mode" to "1"))
        TriggerType.BOOT -> TriggerSpec(type)
        TriggerType.MANUAL -> TriggerSpec(type)
    }

    fun defaultAction(type: ActionType): ActionSpec = when (type) {
        ActionType.DND -> ActionSpec(type, mapOf("on" to "1"))
        ActionType.RINGER -> ActionSpec(type, mapOf("mode" to "0"))
        ActionType.VOLUME -> ActionSpec(type, mapOf("percent" to "40"))
        ActionType.TTS -> ActionSpec(type, mapOf("text" to "Hello from Kriya"))
        ActionType.BRIGHTNESS -> ActionSpec(type, mapOf("percent" to "50"))
        ActionType.TORCH -> ActionSpec(type, mapOf("on" to "1"))
        ActionType.VIBRATE -> ActionSpec(type, mapOf("ms" to "300"))
        ActionType.NOTIFY -> ActionSpec(type, mapOf("title" to "Kriya", "text" to "Your automation ran"))
        ActionType.OPEN_APP -> ActionSpec(type, mapOf("package" to "", "label" to ""))
        ActionType.WAIT -> ActionSpec(type, mapOf("seconds" to "5"))
        else -> ActionSpec(type)
    }

    fun defaultConstraint(type: ConstraintType): ConstraintSpec = when (type) {
        ConstraintType.CHARGING -> ConstraintSpec(type, mapOf("charging" to "1"))
        ConstraintType.WIFI_NAMED -> ConstraintSpec(type, mapOf("ssid" to ""))
        ConstraintType.SCREEN_LOCKED -> ConstraintSpec(type, mapOf("unlocked" to "0"))
        ConstraintType.BATTERY_AT_LEAST -> ConstraintSpec(type, mapOf("percent" to "30"))
        ConstraintType.DAYS_OF_WEEK -> ConstraintSpec(type, mapOf("days" to "1,2,3,4,5"))
    }

    /* ---------------- human readable text ---------------- */

    fun triggerTitle(t: TriggerSpec): String = when (t.type) {
        TriggerType.TIME -> {
            val time = t.s("time", "07:00")
            val pretty = Schedule.parseTime(time)?.let { format12(it) } ?: time
            "At $pretty"
        }
        TriggerType.BATTERY -> {
            val dir = t.i("direction", 0)
            val p = t.i("percent", 20)
            when (dir) {
                1 -> "Battery rises to $p%"
                2 -> "Battery level changes"
                else -> "Battery drops to $p%"
            }
        }
        TriggerType.CHARGER -> if (t.b("plugged", true)) "When I plug in the charger" else "When I unplug the charger"
        TriggerType.WIFI -> {
            val ssid = t.s("ssid").trim()
            if (t.b("state", true)) {
                if (ssid.isEmpty()) "When I join any Wi-Fi" else "When I join \"$ssid\""
            } else {
                if (ssid.isEmpty()) "When I leave Wi-Fi" else "When I leave \"$ssid\""
            }
        }
        TriggerType.BLUETOOTH -> if (t.b("enabled", true)) "When Bluetooth turns on" else "When Bluetooth turns off"
        TriggerType.SCREEN -> if (t.b("on", false)) "When the screen turns on" else "When the screen turns off"
        TriggerType.APP -> t.s("label").ifBlank { "a chosen app" }.let { "When I open $it" }
        TriggerType.HEADPHONES -> if (t.b("plugged", true)) "When headphones connect" else "When headphones disconnect"
        TriggerType.AIRPLANE -> if (t.b("enabled", true)) "When airplane mode turns on" else "When airplane mode turns off"
        TriggerType.RINGER -> when (t.i("mode", 1)) {
            0 -> "When the phone goes silent"
            2 -> "When the phone goes loud"
            else -> "When the phone goes to vibrate"
        }
        TriggerType.BOOT -> "After my phone restarts"
        TriggerType.MANUAL -> "When I tap it"
    }

    fun actionTitle(a: ActionSpec): String = when (a.type) {
        ActionType.DND -> if (a.b("on", true)) "Turn Do Not Disturb on" else "Turn Do Not Disturb off"
        ActionType.RINGER -> when (a.i("mode", 0)) {
            1 -> "Switch to vibrate"
            2 -> "Switch to sound"
            else -> "Switch to silent"
        }
        ActionType.VOLUME -> "Set volume to ${a.i("percent", 40)}%"
        ActionType.TTS -> "Say \"${a.s("text").ifBlank { "…" }}\""
        ActionType.MEDIA_PLAY_PAUSE -> "Play / pause music"
        ActionType.MEDIA_NEXT -> "Skip to next track"
        ActionType.WIFI_PANEL -> "Open the Wi-Fi panel"
        ActionType.BLUETOOTH_PANEL -> "Open Bluetooth settings"
        ActionType.BRIGHTNESS -> "Set brightness to ${a.i("percent", 50)}%"
        ActionType.TORCH -> when (a.s("on", "1")) {
            "0" -> "Turn the torch off"
            "toggle" -> "Toggle the torch"
            else -> "Turn the torch on"
        }
        ActionType.VIBRATE -> "Vibrate for ${a.i("ms", 300)} ms"
        ActionType.NOTIFY -> "Notify me: \"${a.s("text").ifBlank { "automation ran" }}\""
        ActionType.OPEN_APP -> "Open ${a.s("label").ifBlank { "an app" }}"
        ActionType.WAIT -> "Wait ${a.i("seconds", 5)} s"
    }

    fun format12(t: LocalTime): String {
        val hour = if (t.hour % 12 == 0) 12 else t.hour % 12
        val suffix = if (t.hour < 12) "AM" else "PM"
        return "$hour:%02d $suffix".format(t.minute)
    }

    /** One-sentence summary used on cards and in the "explain" sheet. */
    fun summarise(triggers: List<TriggerSpec>, constraints: List<ConstraintSpec>, actions: List<ActionSpec>): String {
        if (triggers.isEmpty() && actions.isEmpty()) return "Empty macro — add a trigger and an action."
        val whenPart = triggers.joinToString(" or ") { triggerTitle(it) }.ifBlank { "Never" }
        val thenPart = actions.joinToString(", then ") { actionTitle(it) }.ifBlank { "nothing yet" }
        val onlyPart = constraints.takeIf { it.isNotEmpty() }
            ?.joinToString(" and ") { Constraints.describe(it).lowercaseFirst() }
            ?.let { ", but only when $it" }
            ?: ""
        return "$whenPart$onlyPart → $thenPart."
    }

    private fun String.lowercaseFirst(): String =
        if (isEmpty()) this else this[0].lowercaseChar() + substring(1)
}
