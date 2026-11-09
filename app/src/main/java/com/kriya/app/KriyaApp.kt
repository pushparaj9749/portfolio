package com.kriya.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class KriyaApp : Application() {

    override fun onCreate() {
        super.onCreate()
        instance = this
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(
                NotificationChannel("kriya_automation", "Kriya automation", NotificationManager.IMPORTANCE_DEFAULT)
            )
            nm.createNotificationChannel(
                NotificationChannel("kriya_service", "Background engine", NotificationManager.IMPORTANCE_MIN)
            )
        }
    }

    companion object {
        lateinit var instance: KriyaApp
            private set
    }
}
