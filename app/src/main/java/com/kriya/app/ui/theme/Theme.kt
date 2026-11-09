package com.kriya.app.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat

/* Brand palette — a calm indigo/mint pair, high contrast in both modes. */
val Indigo = Color(0xFF6F8CFF)
val IndigoDeep = Color(0xFF4B5FE8)
val Mint = Color(0xFF3DDC97)
val Amber = Color(0xFFFFB74D)
val Rose = Color(0xFFE879A8)

val NightBg = Color(0xFF0B0F14)
val NightSurface = Color(0xFF141B25)
val NightSurfaceHigh = Color(0xFF1C2533)
val NightOutline = Color(0xFF2B3648)
val NightText = Color(0xFFEAF0FA)
val NightMuted = Color(0xFF9AA8BF)

val DayBg = Color(0xFFF6F7FB)
val DaySurface = Color(0xFFFFFFFF)
val DaySurfaceHigh = Color(0xFFEFF2F9)
val DayOutline = Color(0xFFDDE3EF)
val DayText = Color(0xFF101725)
val DayMuted = Color(0xFF5D6B82)

private val DarkScheme = darkColorScheme(
    primary = Indigo,
    onPrimary = Color(0xFF081021),
    primaryContainer = IndigoDeep,
    onPrimaryContainer = Color(0xFFEAF0FF),
    secondary = Mint,
    onSecondary = Color(0xFF04170F),
    tertiary = Amber,
    background = NightBg,
    onBackground = NightText,
    surface = NightSurface,
    onSurface = NightText,
    surfaceVariant = NightSurfaceHigh,
    onSurfaceVariant = NightMuted,
    outline = NightOutline,
    outlineVariant = NightOutline,
    error = Color(0xFFFF7A8A),
    onError = Color(0xFF2A0006)
)

private val LightScheme = lightColorScheme(
    primary = IndigoDeep,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE2E8FF),
    onPrimaryContainer = Color(0xFF0B1440),
    secondary = Color(0xFF139C68),
    onSecondary = Color.White,
    tertiary = Color(0xFFB26B00),
    background = DayBg,
    onBackground = DayText,
    surface = DaySurface,
    onSurface = DayText,
    surfaceVariant = DaySurfaceHigh,
    onSurfaceVariant = DayMuted,
    outline = DayOutline,
    outlineVariant = DayOutline,
    error = Color(0xFFC0263A),
    onError = Color.White
)

private val AppTypography = Typography(
    displaySmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 32.sp,
        lineHeight = 38.sp,
        letterSpacing = (-0.5).sp
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 25.sp,
        lineHeight = 31.sp,
        letterSpacing = (-0.3).sp
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 19.sp,
        lineHeight = 25.sp
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 16.sp,
        lineHeight = 22.sp
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        letterSpacing = 0.1.sp
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        letterSpacing = 0.2.sp
    )
)

@Composable
fun KriyaTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colors = if (darkTheme) DarkScheme else LightScheme
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !darkTheme
                isAppearanceLightNavigationBars = !darkTheme
            }
        }
    }
    MaterialTheme(colorScheme = colors, typography = AppTypography, content = content)
}
