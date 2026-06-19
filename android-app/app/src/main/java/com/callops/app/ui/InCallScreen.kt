package com.callops.app.ui

import android.telecom.Call
import android.telecom.CallAudioState
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.callops.app.telecom.ActiveCallHolder
import com.callops.app.ui.theme.*
import kotlinx.coroutines.delay

/**
 * InCallScreen — the custom in-call UI.
 *
 * Toggles call controls based on call state and direction:
 * - Incoming + Ringing: Shows Accept / Decline buttons.
 * - Outgoing / Active: Shows Mute / Speaker / End Call buttons.
 */
@Composable
fun InCallScreen(onEndCall: () -> Unit) {
    val callInfo by ActiveCallHolder.callInfo.collectAsState()
    val callState by ActiveCallHolder.callState.collectAsState()
    val audioState by ActiveCallHolder.audioState.collectAsState()
    val isRecordingActive by ActiveCallHolder.isRecordingActive.collectAsState()

    val contactName = callInfo?.contactName?.ifBlank { "Unknown" } ?: "Unknown"
    val phoneNumber = callInfo?.phoneNumber ?: ""

    // ── Audio route and mute observations ─────────────────────────────────────
    val isMuted = audioState?.isMuted ?: false
    val isSpeaker = (audioState?.route ?: CallAudioState.ROUTE_EARPIECE) == CallAudioState.ROUTE_SPEAKER

    // ── Elapsed timer (starts when call becomes ACTIVE) ───────────────────────
    var elapsedSeconds by remember { mutableIntStateOf(0) }
    var timerRunning by remember { mutableStateOf(false) }

    LaunchedEffect(callState) {
        if (callState == Call.STATE_ACTIVE && !timerRunning) {
            timerRunning = true
        }
    }
    LaunchedEffect(timerRunning) {
        if (timerRunning) {
            while (true) {
                delay(1000)
                elapsedSeconds++
            }
        }
    }

    // ── Call state & direction derivation ─────────────────────────────────────
    val isActive = callState == Call.STATE_ACTIVE
    val isEnding = callState == Call.STATE_DISCONNECTING || callState == Call.STATE_DISCONNECTED
    val isIncoming = callInfo?.call?.details?.callDirection == Call.Details.DIRECTION_INCOMING
    val isRingingIncoming = isIncoming && callState == Call.STATE_RINGING

    val statusText = when (callState) {
        Call.STATE_DIALING, Call.STATE_CONNECTING -> "Calling…"
        Call.STATE_RINGING -> if (isIncoming) "Incoming Call…" else "Ringing…"
        Call.STATE_ACTIVE -> if (elapsedSeconds > 0) formatElapsed(elapsedSeconds) else "Connected"
        Call.STATE_DISCONNECTING -> "Ending…"
        else -> "Connecting…"
    }
    val ringColor = if (isActive) GreenActive else AmberWarn

    // ── Pulsing ring animation ────────────────────────────────────────────────
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = if (isEnding) 1f else 1.18f,
        animationSpec = infiniteRepeatable(
            animation = tween(900, easing = EaseInOutSine),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pulseScale",
    )

    // ── Layout ────────────────────────────────────────────────────────────────
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(Color(0xFF0F0F1A), Gray950),
                )
            ),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(0.dp),
        ) {
            Spacer(modifier = Modifier.height(64.dp))

            // ── Pulsing avatar ring ───────────────────────────────────────────
            Box(contentAlignment = Alignment.Center) {
                // Outer pulse ring
                Box(
                    modifier = Modifier
                        .size(120.dp)
                        .scale(pulseScale)
                        .background(ringColor.copy(alpha = 0.15f), CircleShape),
                )
                // Inner avatar circle
                Box(
                    modifier = Modifier
                        .size(90.dp)
                        .background(ringColor.copy(alpha = 0.25f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = contactName.firstOrNull()?.uppercaseChar()?.toString() ?: "?",
                        fontSize = 36.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                    )
                }
            }

            Spacer(modifier = Modifier.height(28.dp))

            // ── Contact name ──────────────────────────────────────────────────
            Text(
                text = contactName,
                fontSize = 28.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color.White,
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = phoneNumber,
                fontSize = 15.sp,
                color = Gray400,
            )

            Spacer(modifier = Modifier.height(20.dp))

            // ── Status / elapsed ──────────────────────────────────────────────
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = ringColor.copy(alpha = 0.15f),
            ) {
                Text(
                    text = statusText,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium,
                    color = ringColor,
                    fontFamily = if (isActive) FontFamily.Monospace else FontFamily.Default,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                )
            }

            Spacer(modifier = Modifier.weight(1f))

            // ── Call Controls ─────────────────────────────────────────────────
            if (isRingingIncoming) {
                // Incoming call accept/reject panel
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 40.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Decline (Reject)
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(70.dp)
                                .background(RedError, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            IconButton(
                                onClick = {
                                    callInfo?.call?.reject(false, null)
                                },
                                modifier = Modifier.size(70.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Default.CallEnd,
                                    contentDescription = "Decline Call",
                                    tint = Color.White,
                                    modifier = Modifier.size(32.dp),
                                )
                            }
                        }
                        Text("Decline", fontSize = 11.sp, color = Gray600)
                    }

                    // Answer (Accept)
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(70.dp)
                                .background(GreenActive, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            IconButton(
                                onClick = {
                                    @Suppress("Deprecation")
                                    callInfo?.call?.answer(0)
                                },
                                modifier = Modifier.size(70.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Call,
                                    contentDescription = "Answer Call",
                                    tint = Color.White,
                                    modifier = Modifier.size(32.dp),
                                )
                            }
                        }
                        Text("Answer", fontSize = 11.sp, color = Gray600)
                    }
                }
            } else {
                // Outgoing/Active standard calling controls
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 40.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Mute
                    CallControlButton(
                        icon = if (isMuted) Icons.Default.MicOff else Icons.Default.Mic,
                        label = if (isMuted) "Unmute" else "Mute",
                        isActive = isMuted,
                        activeColor = AmberWarn,
                        onClick = {
                            ActiveCallHolder.setMuted(!isMuted)
                        },
                    )

                    // End Call — oversized red button
                    Box(
                        modifier = Modifier
                            .size(80.dp)
                            .background(RedError, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        IconButton(
                            onClick = onEndCall,
                            modifier = Modifier.size(80.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Default.CallEnd,
                                contentDescription = "End call",
                                tint = Color.White,
                                modifier = Modifier.size(36.dp),
                            )
                        }
                    }

                    // Speaker
                    CallControlButton(
                        icon = Icons.AutoMirrored.Filled.VolumeUp,
                        label = "Speaker",
                        isActive = isSpeaker,
                        activeColor = Indigo400,
                        onClick = {
                            ActiveCallHolder.setSpeaker(!isSpeaker)
                        },
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // ── Recording status chip ──────────────────────────────────────────
            Row(
                horizontalArrangement = Arrangement.Center,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = if (isActive && isRecordingActive)
                        RedError.copy(alpha = 0.15f)
                    else
                        Color(0x08FFFFFF),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(5.dp),
                    ) {
                        if (isActive && isRecordingActive) {
                            Box(
                                modifier = Modifier
                                    .size(6.dp)
                                    .background(RedError, CircleShape),
                            )
                            Text("REC", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = RedError)
                        } else {
                            Text("Recording unavailable", fontSize = 10.sp, color = Gray700)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

// ── Control button ─────────────────────────────────────────────────────────────

@Composable
private fun CallControlButton(
    icon: ImageVector,
    label: String,
    isActive: Boolean,
    activeColor: Color,
    onClick: () -> Unit,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            modifier = Modifier
                .size(60.dp)
                .background(
                    if (isActive) activeColor.copy(alpha = 0.2f) else Color(0x14FFFFFF),
                    CircleShape,
                ),
            contentAlignment = Alignment.Center,
        ) {
            IconButton(onClick = onClick, modifier = Modifier.size(60.dp)) {
                Icon(
                    imageVector = icon,
                    contentDescription = label,
                    tint = if (isActive) activeColor else Gray400,
                    modifier = Modifier.size(26.dp),
                )
            }
        }
        Text(label, fontSize = 11.sp, color = Gray600)
    }
}

// ── Elapsed time formatter ─────────────────────────────────────────────────────

private fun formatElapsed(seconds: Int): String {
    val m = seconds / 60
    val s = seconds % 60
    return "%02d:%02d".format(m, s)
}
