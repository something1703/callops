package com.callops.app.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val DarkColorScheme = darkColorScheme(
    primary         = Indigo500,
    onPrimary       = White,
    primaryContainer= Indigo600,
    secondary       = Violet400,
    onSecondary     = White,
    background      = Gray950,
    onBackground    = Gray100,
    surface         = Gray900,
    onSurface       = Gray100,
    surfaceVariant  = Gray800,
    onSurfaceVariant= Gray400,
    outline         = Gray700,
    error           = RedError,
    onError         = White,
)

/**
 * CallOps always runs in dark mode — no light theme variant needed for Phase 1–4.
 */
@Composable
fun CallOpsTheme(content: @Composable () -> Unit) {
    val view = LocalView.current

    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = Color.Transparent.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
        }
    }

    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography  = CallOpsTypography,
        content     = content,
    )
}
