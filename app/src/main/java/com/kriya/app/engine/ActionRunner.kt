package com.kriya.app.engine

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.Settings
import android.speech.tts.TextToSpeech
import android.view.KeyEvent
import androidx.core.app.NotificationCompat
import com.kriya.app.MainActivity
import com.kriya.app.R
import com.kriya.app.data.ActionSpec
import com.kriya.app.data.ActionType
import java.util.Locale

data class StepResult(val ok: Boolean, val message: String)

/**
 * Executes a single action. Every branch returns a *reason*, never just a boolean, so the
 * run log and the in-app debugger can show what actually happened.
 */
class ActionRunner(private val context: Context) {

    private val audio get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    fun run(action: ActionSpec): StepResult = try {
        when (action.type) {
            ActionType.DND -> dnd(action)
            ActionType.RINGER -> ringer(action)
            ActionType.VOLUME -> volume(action)
            ActionType.TTS -> speak(action)
            ActionType.MEDIA_PLAY_PAUSE -> media(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, "Toggled media playback")
            ActionType.MEDIA_NEXT -> media(KeyEvent.KEYCODE_MEDIA_NEXT, "Skipped to next track")
            ActionType.WIFI_PANEL -> openSettings(Settings.ACTION_WIFI_SETTINGS, "Opened Wi-Fi settings")
            ActionType.BLUETOOTH_PANEL -> openSettings(Settings.ACTION_BLUETOOTH_SETTINGS, "Opened Bluetooth settings")
            ActionType.BRIGHTNESS -> brightness(action)
            ActionType.TORCH -> torch(action)
            ActionType.VIBRATE -> vibrate(action)
            ActionType.NOTIFY -> notifyUser(action)
            ActionType.OPEN_APP -> openApp(action)
            ActionType.WAIT -> {
                Thread.sleep((action.i("seconds", 5).coerceIn(0, 600) * 1000).toLong())
                StepResult(true, "Waited ${action.i("seconds", 5)} s")
            }
        }
    } catch (e: SecurityException) {
        StepResult(false, "Missing permission: ${e.message ?: "denied by system"}")
    } catch (e: Exception) {
        StepResult(false, "Failed: ${e.message ?: e.javaClass.simpleName}")
    }

    private fun notificationManager() =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    private fun ensureMainChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = notificationManager()
            if (nm.getNotificationChannel(CHANNEL_MAIN) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(CHANNEL_MAIN, "Kriya automation", NotificationManager.IMPORTANCE_DEFAULT)
                        .apply { description = "Results of your automations" }
                )
            }
        }
    }

    private fun dnd(a: ActionSpec): StepResult {
        val nm = notificationManager()
        if (!nm.isNotificationPolicyAccessGranted) {
            return StepResult(false, "Do Not Disturb access is not granted — open Kriya → Permissions")
        }
        nm.setInterruptionFilter(
            if (a.b("on", true)) NotificationManager.INTERRUPTION_FILTER_PRIORITY
            else NotificationManager.INTERRUPTION_FILTER_ALL
        )
        return StepResult(true, if (a.b("on", true)) "Do Not Disturb on" else "Do Not Disturb off")
    }

    private fun ringer(a: ActionSpec): StepResult {
        val mode = when (a.i("mode", 0)) {
            1 -> AudioManager.RINGER_MODE_VIBRATE
            2 -> AudioManager.RINGER_MODE_NORMAL
            else -> AudioManager.RINGER_MODE_SILENT
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !notificationManager().isNotificationPolicyAccessGranted) {
            return StepResult(false, "Ringer mode needs Do Not Disturb access — open Permissions")
        }
        audio.ringerMode = mode
        val label = when (mode) {
            AudioManager.RINGER_MODE_SILENT -> "silent"
            AudioManager.RINGER_MODE_VIBRATE -> "vibrate"
            else -> "sound"
        }
        return StepResult(true, "Ringer → $label")
    }

    private fun volume(a: ActionSpec): StepResult {
        val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
        val target = (a.i("percent", 40).coerceIn(0, 100) * max) / 100
        audio.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0)
        return StepResult(true, "Media volume → ${a.i("percent", 40)}%")
    }

    private fun brightness(a: ActionSpec): StepResult {
        if (!Settings.System.canWrite(context)) {
            return StepResult(false, "Brightness needs \"Modify system settings\" — open Permissions")
        }
        val value = (a.i("percent", 50).coerceIn(1, 100) * 255) / 100
        Settings.System.putInt(
            context.contentResolver,
            Settings.System.SCREEN_BRIGHTNESS_MODE,
            Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL
        )
        Settings.System.putInt(context.contentResolver, Settings.System.SCREEN_BRIGHTNESS, value)
        return StepResult(true, "Brightness → ${a.i("percent", 50)}%")
    }

    @Volatile private var torchOn = false

    private fun torch(a: ActionSpec): StepResult {
        val cm = context.getSystemService(Context.CAMERA_SERVICE) as? CameraManager
            ?: return StepResult(false, "No camera service on this device")
        val cameraId = cm.cameraIdList.firstOrNull() ?: return StepResult(false, "No torch on this device")
        val want = when (a.s("on", "1")) {
            "toggle" -> !torchOn
            "0" -> false
            else -> true
        }
        cm.setTorchMode(cameraId, want)
        torchOn = want
        return StepResult(true, "Torch ${if (want) "on" else "off"}")
    }

    private fun vibrate(a: ActionSpec): StepResult {
        val v = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            ?: return StepResult(false, "No vibrator on this device")
        val ms = a.i("ms", 300).coerceIn(20, 5000).toLong()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            v.vibrate(ms)
        }
        return StepResult(true, "Vibrated for $ms ms")
    }

    private fun notifyUser(a: ActionSpec): StepResult {
        ensureMainChannel()
        val open = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val n = NotificationCompat.Builder(context, CHANNEL_MAIN)
            .setSmallIcon(R.drawable.ic_stat_kriya)
            .setContentTitle(a.s("title", "Kriya"))
            .setContentText(a.s("text", "Your automation ran"))
            .setStyle(NotificationCompat.BigTextStyle().bigText(a.s("text", "Your automation ran")))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        return try {
            notificationManager().notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), n)
            StepResult(true, "Notification posted")
        } catch (e: SecurityException) {
            StepResult(false, "Notification permission missing")
        }
    }

    private fun speak(a: ActionSpec): StepResult {
        val text = a.s("text").ifBlank { return StepResult(false, "Nothing to say — the phrase is empty") }
        val tts = TextToSpeech(context) { status ->
            if (status == TextToSpeech.SUCCESS) {
                // The listener fires on the TTS thread; speak once ready.
            }
        }
        tts.language = Locale.getDefault()
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "kriya-${System.currentTimeMillis()}")
        Handler(Looper.getMainLooper()).postDelayed({
            runCatching { tts.stop(); tts.shutdown() }
        }, 20_000)
        return StepResult(true, "Spoke: $text")
    }

    private fun media(keyCode: Int, okMessage: String): StepResult {
        return try {
            audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
            audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, keyCode))
            StepResult(true, okMessage)
        } catch (e: Exception) {
            StepResult(false, "Media control failed: ${e.message}")
        }
    }

    private fun openSettings(action: String, okMessage: String): StepResult = try {
        context.startActivity(Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        StepResult(true, okMessage)
    } catch (e: Exception) {
        StepResult(false, "Could not open settings: ${e.message}")
    }

    private fun openApp(a: ActionSpec): StepResult {
        val pkg = a.s("package")
        if (pkg.isBlank()) return StepResult(false, "No app selected")
        val intent = context.packageManager.getLaunchIntentForPackage(pkg)
            ?: return StepResult(false, "App $pkg is not installed or has no launcher")
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return try {
            context.startActivity(intent)
            StepResult(true, "Opened ${a.s("label").ifBlank { pkg }}")
        } catch (e: Exception) {
            StepResult(false, "Could not open app: ${e.message}")
        }
    }

    companion object {
        const val CHANNEL_MAIN = "kriya_automation"

        fun dndSettingsIntent(): Intent =
            Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        fun writeSettingsIntent(pkg: String): Intent =
            Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:$pkg"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        fun usageAccessIntent(): Intent =
            Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        @Suppress("DEPRECATION")
        fun appDetailsIntent(pkg: String): Intent =
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        fun componentOf(context: Context) = ComponentName(context, com.kriya.app.MainActivity::class.java)
    }
}
