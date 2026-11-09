package com.kriya.app.engine

import com.kriya.app.data.ActionSpec
import com.kriya.app.data.ActionType
import com.kriya.app.data.ConstraintSpec
import com.kriya.app.data.ConstraintType
import com.kriya.app.data.Macro
import com.kriya.app.data.TriggerSpec
import com.kriya.app.data.TriggerType

data class Template(
    val key: String,
    val title: String,
    val emoji: String,
    val blurb: String,
    val tag: String,
    val color: Long,
    val build: (id: String) -> Macro
)

/**
 * Curated, *working* starters. Everything here only uses capabilities Kriya actually ships,
 * so a template can never be a dead end (a common complaint about community template stores).
 */
object Templates {

    private fun macro(
        id: String,
        name: String,
        icon: String,
        color: Long,
        tag: String,
        triggers: List<TriggerSpec>,
        actions: List<ActionSpec>,
        constraints: List<ConstraintSpec> = emptyList()
    ) = Macro(
        id = id,
        name = name,
        icon = icon,
        color = color,
        category = tag,
        triggers = triggers,
        actions = actions,
        constraints = constraints
    )

    val all: List<Template> = listOf(
        Template(
            "sleep", "Wind down for sleep", "🌙",
            "Silences the phone and turns the torch off every night at 11 PM.",
            "Sleep", 0xFF8B7CFF
        ) { id ->
            macro(
                id, "Wind down for sleep", "🌙", 0xFF8B7CFF, "Sleep",
                listOf(TriggerSpec(TriggerType.TIME, mapOf("time" to "23:00", "days" to Schedule.EVERY_DAY))),
                listOf(
                    ActionSpec(ActionType.RINGER, mapOf("mode" to "0")),
                    ActionSpec(ActionType.DND, mapOf("on" to "1")),
                    ActionSpec(ActionType.TORCH, mapOf("on" to "0")),
                    ActionSpec(ActionType.VIBRATE, mapOf("ms" to "120"))
                )
            )
        },
        Template(
            "morning", "Good morning setup", "☀️",
            "Restores sound, full brightness and a spoken summary on weekdays.",
            "Morning", 0xFFFFB74D
        ) { id ->
            macro(
                id, "Good morning setup", "☀️", 0xFFFFB74D, "Morning",
                listOf(TriggerSpec(TriggerType.TIME, mapOf("time" to "07:00", "days" to "1,2,3,4,5"))),
                listOf(
                    ActionSpec(ActionType.DND, mapOf("on" to "0")),
                    ActionSpec(ActionType.RINGER, mapOf("mode" to "2")),
                    ActionSpec(ActionType.BRIGHTNESS, mapOf("percent" to "80")),
                    ActionSpec(ActionType.TTS, mapOf("text" to "Good morning. Have a great day."))
                )
            )
        },
        Template(
            "battery", "Low battery rescue", "🔋",
            "Below 15% while unplugged: dims the screen and warns you.",
            "Battery", 0xFF3DDC97
        ) { id ->
            macro(
                id, "Low battery rescue", "🔋", 0xFF3DDC97, "Battery",
                listOf(TriggerSpec(TriggerType.BATTERY, mapOf("percent" to "15", "direction" to "0"))),
                listOf(
                    ActionSpec(ActionType.BRIGHTNESS, mapOf("percent" to "20")),
                    ActionSpec(ActionType.NOTIFY, mapOf("title" to "Battery low", "text" to "Dropped below 15% — time to charge."))
                ),
                listOf(ConstraintSpec(ConstraintType.CHARGING, mapOf("charging" to "0")))
            )
        },
        Template(
            "office", "Office arrival", "💼",
            "Joining the office Wi-Fi switches to vibrate on weekdays.",
            "Work", 0xFF7C9CFF
        ) { id ->
            macro(
                id, "Office arrival", "💼", 0xFF7C9CFF, "Work",
                listOf(TriggerSpec(TriggerType.WIFI, mapOf("state" to "1", "ssid" to ""))),
                listOf(
                    ActionSpec(ActionType.RINGER, mapOf("mode" to "1")),
                    ActionSpec(ActionType.NOTIFY, mapOf("title" to "Kriya", "text" to "Switched to vibrate for work."))
                ),
                listOf(ConstraintSpec(ConstraintType.DAYS_OF_WEEK, mapOf("days" to "1,2,3,4,5")))
            )
        },
        Template(
            "headphones", "Headphones = play", "🎧",
            "Plug in headphones and the music starts at a safe volume.",
            "Music", 0xFFE879A8
        ) { id ->
            macro(
                id, "Headphones = play", "🎧", 0xFFE879A8, "Music",
                listOf(TriggerSpec(TriggerType.HEADPHONES, mapOf("plugged" to "1"))),
                listOf(
                    ActionSpec(ActionType.VOLUME, mapOf("percent" to "35")),
                    ActionSpec(ActionType.MEDIA_PLAY_PAUSE)
                )
            )
        },
        Template(
            "desk", "Desk night light", "🔦",
            "Charging after 9 PM turns the torch on for a quick hand-free moment.",
            "Night", 0xFFFFD166
        ) { id ->
            macro(
                id, "Desk night light", "🔦", 0xFFFFD166, "Night",
                listOf(TriggerSpec(TriggerType.CHARGER, mapOf("plugged" to "1"))),
                listOf(
                    ActionSpec(ActionType.TORCH, mapOf("on" to "1")),
                    ActionSpec(ActionType.WAIT, mapOf("seconds" to "10")),
                    ActionSpec(ActionType.TORCH, mapOf("on" to "0"))
                )
            )
        },
        Template(
            "focus", "Focus session", "🎯",
            "Tap a shortcut for a spoken reminder and Do Not Disturb on.",
            "Focus", 0xFF4DD0E1
        ) { id ->
            macro(
                id, "Focus session", "🎯", 0xFF4DD0E1, "Focus",
                listOf(TriggerSpec(TriggerType.MANUAL)),
                listOf(
                    ActionSpec(ActionType.DND, mapOf("on" to "1")),
                    ActionSpec(ActionType.TTS, mapOf("text" to "Focus mode on. See you in 45 minutes."))
                )
            )
        },
        Template(
            "silent", "Silent at bedtime, loud at 7", "🔔",
            "Two time-based moods for the whole day.",
            "Routines", 0xFF9CCC65
        ) { id ->
            macro(
                id, "Quiet hours", "🤫", 0xFF9CCC65, "Routines",
                listOf(
                    TriggerSpec(TriggerType.TIME, mapOf("time" to "22:30", "days" to Schedule.EVERY_DAY)),
                    TriggerSpec(TriggerType.MANUAL)
                ),
                listOf(ActionSpec(ActionType.RINGER, mapOf("mode" to "0")))
            )
        }
    )

    fun byKey(key: String): Template? = all.firstOrNull { it.key == key }
}
