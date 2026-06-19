package com.callops.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.callops.app.data.CallEventRepository
import com.callops.app.ui.theme.*

/**
 * ManualOutcomeSheet
 *
 * Shown after a call is placed through the system dialer (i.e. agent chose
 * "Not now — use system dialer" on the DialerRoleScreen).
 *
 * Because the system dialer handles the call natively, CallOps cannot
 * automatically track the call lifecycle. This bottom sheet asks the agent
 * to manually log the outcome so it is still captured in the CRM.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ManualOutcomeSheet(
    contactName: String,
    contactId: String,
    phoneNumber: String,
    callEventRepository: CallEventRepository,
    onDismiss: () -> Unit,
) {
    var submitted by remember { mutableStateOf(false) }

    val outcomes = listOf(
        "interested"     to "✅  Interested",
        "not_interested" to "❌  Not Interested",
        "no_answer"      to "📵  No Answer",
        "callback"       to "🔁  Callback Later",
        "do_not_call"    to "🚫  Do Not Call",
    )

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Color(0xFF111827),
        dragHandle = {
            Box(
                Modifier
                    .padding(vertical = 12.dp)
                    .width(40.dp)
                    .height(4.dp)
                    .also {
                        Surface(
                            shape = RoundedCornerShape(2.dp),
                            color = Color(0xFF374151),
                            modifier = it,
                        ) {}
                    },
            )
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 40.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (submitted) {
                // ── Confirmation view ────────────────────────────────────────
                Spacer(Modifier.height(16.dp))
                Text("✅", fontSize = 40.sp)
                Spacer(Modifier.height(12.dp))
                Text(
                    "Outcome logged!",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    "Call result saved for $contactName.",
                    fontSize = 13.sp,
                    color = Gray400,
                )
                Spacer(Modifier.height(24.dp))
                Button(
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Indigo600),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Text("Done", fontWeight = FontWeight.SemiBold)
                }
            } else {
                // ── Outcome selection view ───────────────────────────────────
                Text(
                    "Log Call Outcome",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    "How did the call with $contactName go?",
                    fontSize = 13.sp,
                    color = Gray400,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    phoneNumber,
                    fontSize = 12.sp,
                    color = Gray600,
                )
                Spacer(Modifier.height(20.dp))

                outcomes.forEach { (outcomeKey, label) ->
                    OutcomeButton(
                        label = label,
                        onClick = {
                            callEventRepository.submitManualOutcome(
                                contactId = contactId,
                                outcome = outcomeKey,
                            )
                            submitted = true
                        },
                    )
                    Spacer(Modifier.height(8.dp))
                }

                Spacer(Modifier.height(8.dp))
                TextButton(onClick = onDismiss) {
                    Text(
                        "Skip — don't log this call",
                        color = Gray600,
                        fontSize = 12.sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun OutcomeButton(label: String, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().height(48.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = Color(0xFF1F2937),
            contentColor = Color.White,
        ),
        shape = RoundedCornerShape(12.dp),
        elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp),
    ) {
        Text(
            text = label,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
