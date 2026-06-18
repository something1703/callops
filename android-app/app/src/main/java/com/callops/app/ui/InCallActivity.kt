package com.callops.app.ui

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import com.callops.app.telecom.ActiveCallHolder
import com.callops.app.ui.theme.CallOpsTheme
import com.callops.app.ui.theme.Gray950
import kotlinx.coroutines.launch

/**
 * InCallActivity
 *
 * Fullscreen activity launched by CallOpsInCallService when a call is placed.
 * Configured with showOnLockScreen + turnScreenOn in the Manifest so it
 * appears over the lockscreen.
 *
 * Automatically finishes itself when the call ends (ActiveCallHolder.callInfo
 * emits null).
 */
class InCallActivity : ComponentActivity() {

    companion object {
        fun createIntent(context: Context): Intent =
            Intent(context, InCallActivity::class.java).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP,
                )
            }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Finish when the call holder is cleared (call ended)
        lifecycleScope.launch {
            ActiveCallHolder.callInfo.collect { info ->
                if (info == null) {
                    finish()
                }
            }
        }

        setContent {
            CallOpsTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Gray950,
                ) {
                    InCallScreen(
                        onEndCall = {
                            // Disconnect via the telecom Call object
                            ActiveCallHolder.callInfo.value?.call?.disconnect()
                        },
                    )
                }
            }
        }
    }
}
