package com.kriya.app.data

import org.json.JSONArray
import org.json.JSONObject

/** JSON (de)serialisation for macros and the run log. Uses org.json only — no reflection. */
object Codec {

    fun encodeMacros(macros: List<Macro>): String = JSONArray().also { arr ->
        macros.forEach { arr.put(macroTo(o = it)) }
    }.toString()

    fun decodeMacros(json: String): List<Macro> {
        val arr = if (json.trimStart().startsWith("[")) JSONArray(json)
        else JSONArray().put(JSONObject(json))
        return (0 until arr.length()).mapNotNull { i -> arr.optJSONObject(i)?.toMacro(0xFF7C9CFF) }
    }

    /** Accepts a single shared macro object or a pasted list. */
    fun decodeSingleMacro(json: String): Macro? = runCatching { decodeMacros(json).firstOrNull() }.getOrNull()

    fun encodeMacro(macro: Macro): String = macroTo(o = macro).toString(2)

    fun encodeLogs(logs: List<RunLog>): String = JSONArray().also { arr ->
        logs.forEach { l ->
            arr.put(JSONObject().apply {
                put("id", l.id)
                put("macroId", l.macroId)
                put("macroName", l.macroName)
                put("at", l.at)
                put("outcome", l.outcome.name)
                put("message", l.message)
            })
        }
    }.toString()

    fun decodeLogs(json: String): List<RunLog> = runCatching {
        val arr = JSONArray(json)
        (0 until arr.length()).mapNotNull { i ->
            arr.optJSONObject(i)?.let { o ->
                RunLog(
                    id = o.optLong("id"),
                    macroId = o.optString("macroId"),
                    macroName = o.optString("macroName"),
                    at = o.optLong("at"),
                    outcome = runCatching { Outcome.valueOf(o.optString("outcome")) }
                        .getOrDefault(Outcome.SUCCESS),
                    message = o.optString("message")
                )
            }
        }
    }.getOrDefault(emptyList())

    /* ---------------- internals ---------------- */

    private fun macroTo(o: Macro): JSONObject = JSONObject().apply {
        put("id", o.id)
        put("name", o.name)
        put("icon", o.icon)
        put("color", o.color)
        put("category", o.category)
        put("enabled", o.enabled)
        put("runCount", o.runCount)
        put("lastRunAt", o.lastRunAt)
        put("lastResult", o.lastResult)
        put("createdAt", o.createdAt)
        put("triggers", JSONArray().also { a ->
            o.triggers.forEach { t -> a.put(JSONObject().apply {
                put("type", t.type.name); put("params", JSONObject(t.params as Map<*, *>))
            }) }
        })
        put("constraints", JSONArray().also { a ->
            o.constraints.forEach { c -> a.put(JSONObject().apply {
                put("type", c.type.name); put("params", JSONObject(c.params as Map<*, *>))
            }) }
        })
        put("actions", JSONArray().also { a ->
            o.actions.forEach { c -> a.put(JSONObject().apply {
                put("type", c.type.name); put("params", JSONObject(c.params as Map<*, *>))
            }) }
        })
    }

    private fun JSONObject.toMacro(fallbackColor: Long): Macro {
        fun spec(i: Int, key: String) = optJSONArray(key)?.optJSONObject(i)
        fun paramsOf(o: JSONObject?): Map<String, String> {
            val o = o ?: return emptyMap()
            val m = LinkedHashMap<String, String>()
            o.keys().forEach { k -> m[k] = o.optString(k, "") }
            return m
        }

        return Macro(
            id = optString("id", "macro-${System.currentTimeMillis()}"),
            name = optString("name", "Untitled macro"),
            icon = optString("icon", "⚡"),
            color = optLong("color", fallbackColor),
            category = optString("category", "General"),
            enabled = optBoolean("enabled", true),
            runCount = optInt("runCount", 0),
            lastRunAt = optLong("lastRunAt", 0L),
            lastResult = optString("lastResult", ""),
            createdAt = optLong("createdAt", System.currentTimeMillis()),
            triggers = (0 until (optJSONArray("triggers")?.length() ?: 0)).mapNotNull {
                spec(it, "triggers")?.let { o ->
                    TriggerSpec(
                        runCatching { TriggerType.valueOf(o.optString("type")) }.getOrDefault(TriggerType.MANUAL),
                        paramsOf(o.optJSONObject("params"))
                    )
                }
            },
            constraints = (0 until (optJSONArray("constraints")?.length() ?: 0)).mapNotNull {
                spec(it, "constraints")?.let { o ->
                    ConstraintSpec(
                        runCatching { ConstraintType.valueOf(o.optString("type")) }.getOrDefault(ConstraintType.CHARGING),
                        paramsOf(o.optJSONObject("params"))
                    )
                }
            },
            actions = (0 until (optJSONArray("actions")?.length() ?: 0)).mapNotNull {
                spec(it, "actions")?.let { o ->
                    ActionSpec(
                        runCatching { ActionType.valueOf(o.optString("type")) }.getOrDefault(ActionType.NOTIFY),
                        paramsOf(o.optJSONObject("params"))
                    )
                }
            }
        )
    }
}
