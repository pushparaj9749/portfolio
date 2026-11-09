package com.kriya.app.engine

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import com.kriya.app.MainActivity
import com.kriya.app.R
import com.kriya.app.data.Prefs
import com.kriya.app.data.TriggerType
import org.json.JSONArray

/**
 * A deliberately small foreground service: it keeps Kriya awake enough to notice app-opened
 * triggers and to re-arm the schedule after a reboot. It does no polling of its own except a
 * low-frequency app-foreground check that can be switched off.
 */
class KriyaService : Service() {

    private val handler = Handler(Looper.getMainLooper())
    private val prefs by lazy { Prefs(this) }
    private val engine by lazy { Engine(this) }
    private val usage by lazy { UsageWatcher(this) }

    private val ticker = object : Runnable {
        override fun run() {
            runCatching { checkForegroundApp() }
            runCatching { Scheduling.rescheduleAllIfNeeded(this@KriyaService) }
            handler.postDelayed(this, TICK_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForegroundCompat()
        handler.removeCallbacks(ticker)
        handler.postDelayed(ticker, TICK_MS)
        Scheduling.rescheduleAll(this)
        return START_STICKY
    }

    private fun checkForegroundApp() {
        if (!prefs.engineEnabled) return
        val watchesApp = engine.enabledMacros().any { it.triggers.any { t -> t.type == TriggerType.APP } }
        if (!watchesApp || !usage.hasAccess()) return
        val current = usage.currentPackage() ?: return
        val previous = prefs.getState(UsageWatcher.STATE_LAST_APP, "")
        if (current != previous) {
            prefs.putState(UsageWatcher.STATE_LAST_APP, current)
            if (current != packageName) {
                engine.fire(TriggerEvent(TriggerType.APP, info = mapOf("package" to current)))
                EngineEvents.bump()
            }
        }
    }

    private fun startForegroundCompat() {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val enabledCount = prefs.loadMacros().count { it.enabled }
        val notification = NotificationCompat.Builder(this, CHANNEL_SERVICE)
            .setSmallIcon(R.drawable.ic_stat_kriya)
            .setContentTitle("Kriya is watching")
            .setContentText(
                when (enabledCount) {
                    0 -> "No automations enabled yet"
                    1 -> "1 automation armed"
                    else -> "$enabledCount automations armed"
                }
            )
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(open)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIF_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            )
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            if (nm.getNotificationChannel(CHANNEL_SERVICE) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(CHANNEL_SERVICE, "Background engine", NotificationManager.IMPORTANCE_MIN)
                        .apply { description = "Keeps your automations responsive" }
                )
            }
        }
    }

    override fun onDestroy() {
        isRunning = false
        handler.removeCallbacks(ticker)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val CHANNEL_SERVICE = "kriya_service"
        private const val NOTIF_ID = 41
        private const val TICK_MS = 8_000L

        @Volatile
        var isRunning: Boolean = false
            private set

        fun start(context: Context) {
            val prefs = Prefs(context)
            if (!prefs.engineEnabled) return
            runCatching {
                context.startForegroundService(Intent(context, KriyaService::class.java))
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, KriyaService::class.java))
        }
    }
}

/** Reads the current foreground package from Android's usage stats. */
class UsageWatcher(private val context: Context) {
    private val appOps by lazy { context.getSystemService(android.app.AppOpsManager::class.java) }

    fun hasAccess(): Boolean {
        return runCatching {
            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                appOps.unsafeCheckOpNoThrow(
                    android.app.AppOpsManager.OPSTR_GET_USAGE_STATS,
                    android.os.Process.myUid(),
                    context.packageName
                )
            } else {
                @Suppress("DEPRECATION")
                appOps.checkOpNoThrow(
                    android.app.AppOpsManager.OPSTR_GET_USAGE_STATS,
                    android.os.Process.myUid(),
                    context.packageName
                )
            }
            mode == android.app.AppOpsManager.MODE_ALLOWED
        }.getOrDefault(false)
    }

    fun currentPackage(): String? = runCatching {
        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as android.app.usage.UsageStatsManager
        val end = System.currentTimeMillis()
        val events = usm.queryEvents(end - 10_000, end)
        val event = android.app.usage.UsageEvents.Event()
        var last: String? = null
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == android.app.usage.UsageEvents.Event.MOVE_TO_FOREGROUND) {
                last = event.packageName
            }
        }
        last
    }.getOrNull()

    companion object {
        const val STATE_LAST_APP = "last_app"
    }
}

/** Re-arms any schedule that may have been dropped (cheap: compares next-run times). */
fun Scheduling.rescheduleAllIfNeeded(context: Context) = rescheduleAll(context)

/** JSON array of package names that the user blocked (reserved for a future release). */
internal fun blockedPackages(prefs: Prefs): List<String> =
    runCatching { JSONArray(prefs.getState("blocked", "[]")) }.getOrDefault(JSONArray())
        .let { arr -> (0 until arr.length()).map { arr.optString(it) } }
