package com.kriya.app.data

/** All persisted model types. Plain Kotlin — no Android / JSON dependencies. */
enum class TriggerType {
    TIME, BATTERY, CHARGER, WIFI, BLUETOOTH, SCREEN, APP, HEADPHONES, AIRPLANE, RINGER, BOOT, MANUAL
}

enum class ConstraintType {
    CHARGING, WIFI_NAMED, SCREEN_LOCKED, BATTERY_AT_LEAST, DAYS_OF_WEEK
}

enum class ActionType {
    DND, RINGER, WIFI_PANEL, BLUETOOTH_PANEL, VOLUME, BRIGHTNESS, VIBRATE, NOTIFY, TTS,
    OPEN_APP, TORCH, MEDIA_NEXT, MEDIA_PLAY_PAUSE, WAIT
}

data class TriggerSpec(
    val type: TriggerType,
    val params: Map<String, String> = emptyMap()
) {
    fun s(key: String, fallback: String = ""): String = params[key] ?: fallback
    fun i(key: String, fallback: Int = 0): Int = params[key]?.toIntOrNull() ?: fallback
    fun b(key: String, fallback: Boolean = false): Boolean =
        params[key]?.toBooleanStrictOrNull() ?: fallback
}

data class ConstraintSpec(
    val type: ConstraintType,
    val params: Map<String, String> = emptyMap()
) {
    fun s(key: String, fallback: String = ""): String = params[key] ?: fallback
    fun i(key: String, fallback: Int = 0): Int = params[key]?.toIntOrNull() ?: fallback
    fun b(key: String, fallback: Boolean = false): Boolean =
        params[key]?.toBooleanStrictOrNull() ?: fallback
}

data class ActionSpec(
    val type: ActionType,
    val params: Map<String, String> = emptyMap()
) {
    fun s(key: String, fallback: String = ""): String = params[key] ?: fallback
    fun i(key: String, fallback: Int = 0): Int = params[key]?.toIntOrNull() ?: fallback
    fun b(key: String, fallback: Boolean = false): Boolean =
        params[key]?.toBooleanStrictOrNull() ?: fallback
}

data class Macro(
    val id: String,
    val name: String,
    val icon: String = "⚡",
    val color: Long = 0xFF7C9CFF,
    val category: String = "General",
    val enabled: Boolean = true,
    val triggers: List<TriggerSpec> = emptyList(),
    val constraints: List<ConstraintSpec> = emptyList(),
    val actions: List<ActionSpec> = emptyList(),
    val runCount: Int = 0,
    val lastRunAt: Long = 0L,
    val lastResult: String = "",
    val createdAt: Long = System.currentTimeMillis()
) {
    val ready: Boolean get() = triggers.isNotEmpty() && actions.isNotEmpty()
    val trigger: TriggerSpec? get() = triggers.firstOrNull()
}

enum class Outcome { SUCCESS, SKIPPED, BLOCKED, FAILED }

data class RunLog(
    val id: Long = System.currentTimeMillis(),
    val macroId: String,
    val macroName: String,
    val at: Long = System.currentTimeMillis(),
    val outcome: Outcome,
    val message: String
)

data class Category(val name: String, val emoji: String, val color: Long)
