package com.callops.app.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.callops.app.ui.theme.*
import com.callops.app.viewmodel.AuthState
import com.callops.app.viewmodel.AuthViewModel
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call

@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onLoginSuccess: () -> Unit,
) {
    val context = LocalContext.current
    val authState by viewModel.authState.collectAsState()

    // Navigate on success
    LaunchedEffect(authState) {
        if (authState is AuthState.Success) {
            onLoginSuccess()
            viewModel.resetState()
        }
    }

    // Background gradient
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.radialGradient(
                    colors = listOf(
                        Color(0xFF1E1B4B), // indigo-950
                        Gray950,
                    ),
                    radius = 900f,
                )
            ),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 32.dp),
        ) {

            // ── Logo ──────────────────────────────────────────────────────────
            Box(
                modifier = Modifier
                    .size(72.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .background(
                        Brush.linearGradient(
                            colors = listOf(Indigo500, Violet400)
                        )
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Default.Call,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(36.dp),
                )
            }

            Spacer(modifier = Modifier.height(20.dp))

            Text(
                text = "CallOps",
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
            Text(
                text = "PSR Agent App",
                fontSize = 14.sp,
                color = Gray400,
                modifier = Modifier.padding(top = 4.dp),
            )

            Spacer(modifier = Modifier.height(48.dp))

            // ── Sign-in card ──────────────────────────────────────────────────
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(
                    containerColor = Color(0x0DFFFFFF), // rgba white 5%
                ),
                border = androidx.compose.foundation.BorderStroke(
                    1.dp, Color(0x14FFFFFF)
                ),
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(horizontal = 24.dp, vertical = 32.dp),
                ) {
                    Text(
                        text = "Welcome back",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color.White,
                    )
                    Text(
                        text = "Sign in with your Google account\nto view your assigned contacts",
                        fontSize = 13.sp,
                        color = Gray400,
                        textAlign = TextAlign.Center,
                        lineHeight = 20.sp,
                        modifier = Modifier.padding(top = 8.dp, bottom = 28.dp),
                    )

                    when (val state = authState) {
                        is AuthState.Loading -> {
                            CircularProgressIndicator(
                                color = Indigo400,
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(36.dp),
                            )
                            Text(
                                text = "Signing you in…",
                                fontSize = 13.sp,
                                color = Gray400,
                                modifier = Modifier.padding(top = 12.dp),
                            )
                        }

                        is AuthState.Error -> {
                            // Error message
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp),
                                color = Color(0x1AF87171),
                                tonalElevation = 0.dp,
                            ) {
                                Text(
                                    text = state.message,
                                    fontSize = 13.sp,
                                    color = RedError,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.padding(12.dp),
                                )
                            }

                            Spacer(modifier = Modifier.height(16.dp))

                            GoogleSignInButton(
                                onClick = { viewModel.signInWithGoogle(context) },
                                label = "Try again",
                            )
                        }

                        else -> {
                            GoogleSignInButton(
                                onClick = { viewModel.signInWithGoogle(context) },
                                label = "Sign in with Google",
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = "CallOps · Restricted access",
                fontSize = 11.sp,
                color = Gray600,
            )
        }
    }
}

@Composable
private fun GoogleSignInButton(
    onClick: () -> Unit,
    label: String,
) {
    Button(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = Indigo600,
            contentColor = Color.White,
        ),
        elevation = ButtonDefaults.buttonElevation(
            defaultElevation = 0.dp,
            pressedElevation = 4.dp,
        ),
    ) {
        Text(
            text = label,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}
