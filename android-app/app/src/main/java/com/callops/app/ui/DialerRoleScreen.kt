package com.callops.app.ui

import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.RequiresApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.callops.app.ui.theme.*

/**
 * DialerRoleScreen
 *
 * Shown once before the agent's first call.
 * Explains why we need the default dialer role, then presents two paths:
 *
 *  1. "Enable Calling" → requests ROLE_DIALER → custom in-app call screen + call logging
 *  2. "Not now"        → opens system dialer via ACTION_CALL (always works, shows manual outcome prompt)
 */
@RequiresApi(Build.VERSION_CODES.Q)
@Composable
fun DialerRoleScreen(
    phoneNumber: String,
    contactId: String,
    contactName: String,
    onRoleGranted: () -> Unit,
    onDeclined: () -> Unit,
) {
    val context = LocalContext.current
    val roleManager = context.getSystemService(Context.ROLE_SERVICE) as RoleManager

    // Already has the role — skip straight to granted
    val alreadyHasRole = remember { roleManager.isRoleHeld(RoleManager.ROLE_DIALER) }
    if (alreadyHasRole) {
        LaunchedEffect(Unit) { onRoleGranted() }
        return
    }

    val roleRequestLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult(),
    ) { _ ->
        if (roleManager.isRoleHeld(RoleManager.ROLE_DIALER)) {
            onRoleGranted()
        } else {
            // Role declined — launch system dialer directly
            launchSystemDialer(context, phoneNumber)
            onDeclined()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(Color(0xFF0A0A14), Gray950),
                )
            ),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(0.dp),
        ) {
            // Icon
            Surface(
                shape = RoundedCornerShape(24.dp),
                color = Indigo600.copy(alpha = 0.15f),
                modifier = Modifier.size(80.dp),
            ) {
                Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                    Icon(
                        imageVector = Icons.Default.Call,
                        contentDescription = null,
                        tint = Indigo400,
                        modifier = Modifier.size(38.dp),
                    )
                }
            }

            Spacer(modifier = Modifier.height(28.dp))

            Text(
                "Enable calling in CallOps",
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                textAlign = TextAlign.Center,
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                "Calling ${contactName}",
                fontSize = 14.sp,
                color = Indigo400,
                textAlign = TextAlign.Center,
            )

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                "To place calls through the CallOps custom in-call screen, the app needs to be set as your default phone app.\n\n" +
                "Your existing dialer app will be restored the moment CallOps is no longer your default. You can change this at any time in System Settings → Default apps.",
                fontSize = 14.sp,
                color = Gray400,
                textAlign = TextAlign.Center,
                lineHeight = 22.sp,
            )

            Spacer(modifier = Modifier.height(12.dp))

            // What we use it for — honest breakdown
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = Color(0x08FFFFFF),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    PermissionRow("✅", "Place calls over your SIM card")
                    PermissionRow("✅", "Show a custom call screen with contact info")
                    PermissionRow("✅", "Log call duration to your CRM automatically")
                    PermissionRow("❌", "Access your personal contacts or call history")
                    PermissionRow("❌", "Record calls without showing you a status")
                }
            }

            Spacer(modifier = Modifier.height(28.dp))

            // Primary CTA — request dialer role
            Button(
                onClick = {
                    val intent = roleManager.createRequestRoleIntent(RoleManager.ROLE_DIALER)
                    roleRequestLauncher.launch(intent)
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Indigo600),
                shape = RoundedCornerShape(14.dp),
            ) {
                Text("Enable Calling", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Secondary dismiss — use system dialer (call still placed, no in-app tracking)
            TextButton(
                onClick = {
                    launchSystemDialer(context, phoneNumber)
                    onDeclined()
                },
            ) {
                Text(
                    "Not now — use system dialer",
                    color = Gray400,
                    fontSize = 13.sp,
                )
            }
        }
    }
}

/** Opens the native phone app dial screen for [phoneNumber]. */
fun launchSystemDialer(context: Context, phoneNumber: String) {
    val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:$phoneNumber"))
    context.startActivity(intent)
}

@Composable
private fun PermissionRow(emoji: String, text: String) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(emoji, fontSize = 14.sp)
        Text(text, fontSize = 13.sp, color = Gray300)
    }
}
