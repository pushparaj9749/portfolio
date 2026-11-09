package com.kriya.app.data

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray

/** Tiny persistence layer over SharedPreferences. All state lives in one file. */
class Prefs(context: Context) {

    private val sp: SharedPreferences =
        context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    /* ---------- macros ---------- */

    fun loadMacros(): List<Macro> {
        val raw = sp.getString(KEY_MACROS, null) ?: return emptyList()
        return runCatching { Codec.decodeMacros(raw) }.getOrDefault(emptyList())
    }

    fun saveMacros(macros: List<Macro>) {
        sp.edit().putString(KEY_MACROS, Codec.encodeMacros(macros)).apply()
    }

    /* ---------- log ---------- */

    fun loadLog(): List<RunLog> {
        val raw = sp.getString(KEY_LOG, null) ?: return emptyList()
        return runCatching { Codec.decodeLogs(raw) }.getOrDefault(emptyList())
    }

    fun appendLog(entry: RunLog) {
        val list = ArrayList(loadLog())
        list.add(0, entry)
        while (list.size > MAX_LOG) list.removeAt(list.lastIndex)
        sp.edit().putString(KEY_LOG, Codec.encodeLogs(list)).apply()
    }

    fun clearLog() = sp.edit().remove(KEY_LOG).apply()

    /* ---------- engine ---------- */

    var engineEnabled: Boolean
        get() = sp.getBoolean(KEY_ENGINE, false)
        set(value) = sp.edit().putBoolean(KEY_ENGINE, value).apply()

    var seenPermissions: Set<String>
        get() = sp.getStringSet(KEY_PERMS, emptySet()) ?: emptySet()
        set(value) = sp.edit().putStringSet(KEY_PERMS, value).apply()

    var onboardingDone: Boolean
        get() = sp.getBoolean(KEY_ONBOARDED, false)
        set(value) = sp.edit().putBoolean(KEY_ONBOARDED, value).apply()

    var batterySaverNoticeShown: Boolean
        get() = sp.getBoolean(KEY_BATT_NOTICE, false)
        set(value) = sp.edit().putBoolean(KEY_BATT_NOTICE, value).apply()

    /** Last observed values, used to detect crossings (battery %, previous ssid, ...). */
    fun getState(key: String, fallback: String = ""): String = sp.getString("state_$key", fallback) ?: fallback
    fun putState(key: String, value: String) = sp.edit().putString("state_$key", value).apply()

    fun snapshotForBackup(): Pair<List<Macro>, List<RunLog>> = loadMacros() to loadLog()

    fun restoreMacros(macros: List<Macro>, replace: Boolean) {
        val merged = if (replace) macros else (macros + loadMacros()).distinctBy { it.id }
        saveMacros(merged)
    }

    fun rawMacrosJson(): String = sp.getString(KEY_MACROS, "[]") ?: "[]"

    fun categoriesJson(): String = sp.getString(KEY_CATEGORIES, "[]") ?: "[]"

    fun saveCategories(list: List<Category>) {
        val arr = JSONArray()
        list.forEach { c ->
            arr.put(org.json.JSONObject().apply {
                put("name", c.name); put("emoji", c.emoji); put("color", c.color)
            })
        }
        sp.edit().putString(KEY_CATEGORIES, arr.toString()).apply()
    }

    fun loadCategories(): List<Category> = runCatching {
        val arr = JSONArray(categoriesJson())
        (0 until arr.length()).mapNotNull { i ->
            arr.optJSONObject(i)?.let {
                Category(it.optString("name"), it.optString("emoji", "📁"), it.optLong("color", 0xFF7C9CFF))
            }
        }
    }.getOrDefault(emptyList())

    companion object {
        private const val FILE = "kriya_prefs"
        private const val KEY_MACROS = "macros"
        private const val KEY_LOG = "run_log"
        private const val KEY_ENGINE = "engine_enabled"
        private const val KEY_PERMS = "seen_perms"
        private const val KEY_ONBOARDED = "onboarded"
        private const val KEY_CATEGORIES = "categories"
        private const val KEY_BATT_NOTICE = "battery_notice"
        private const val MAX_LOG = 200
    }
}
