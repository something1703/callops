package com.callops.app.data

import android.content.Context
import android.util.Log
import com.callops.app.data.api.ApiClient
import com.callops.app.data.model.CallEventPayload
import com.callops.app.data.model.CallEventsRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.launch

/**
 * CallEventRepository
 *
 * Single responsibility: POST call events to the backend after a call ends.
 * Uses its own CoroutineScope with a SupervisorJob so a failed submit does NOT
 * crash the app or affect any other coroutine.
 */
class CallEventRepository(
    private val tokenStore: TokenStore,
    context: Context,
) {
    companion object {
        private const val TAG = "CallEventRepository"
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    @Suppress("unused")
    private val appContext = context.applicationContext

    /**
     * Submits a list of call-lifecycle events (dialing, active, ended, etc.)
     * for a call that was handled in-app through the ConnectionService.
     */
    fun submitEvents(
        callId: String,
        contactId: String,
        events: List<CallEventPayload>,
    ) {
        if (events.isEmpty()) {
            Log.w(TAG, "submitEvents called with empty events list — skipping")
            return
        }

        scope.launch {
            try {
                val storedUser = tokenStore.userFlow().firstOrNull() ?: run {
                    Log.w(TAG, "No stored token — cannot submit call events for call $callId")
                    return@launch
                }

                val response = ApiClient.apiService.submitCallEvents(
                    bearerToken = "Bearer ${storedUser.token}",
                    body = CallEventsRequest(
                        call_id = callId,
                        contact_id = contactId,
                        events = events,
                    ),
                )

                if (response.isSuccessful) {
                    Log.i(TAG, "Call events submitted: callId=$callId events=${events.size}")
                } else {
                    Log.e(TAG, "Failed to submit call events: HTTP ${response.code()} — callId=$callId")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Network error submitting call events for callId=$callId", e)
            }
        }
    }

    /**
     * Submits a manual call outcome for calls placed via the system dialer.
     * Because the system dialer handles the call natively, we create two
     * synthetic events (dialing + ended) to represent the call in the CRM.
     */
    fun submitManualOutcome(
        contactId: String,
        outcome: String,
        durationSeconds: Int = 0,
    ) {
        scope.launch {
            try {
                val storedUser = tokenStore.userFlow().firstOrNull() ?: run {
                    Log.w(TAG, "No stored token — cannot submit manual outcome for contact $contactId")
                    return@launch
                }
                val callId = java.util.UUID.randomUUID().toString()
                val now = java.time.Instant.now().toString()
                val events = listOf(
                    CallEventPayload(state = "dialing", event_timestamp = now),
                    CallEventPayload(
                        state = "ended",
                        event_timestamp = now,
                        talk_duration_seconds = durationSeconds,
                    ),
                )
                val response = ApiClient.apiService.submitCallEvents(
                    bearerToken = "Bearer ${storedUser.token}",
                    body = CallEventsRequest(
                        call_id = callId,
                        contact_id = contactId,
                        events = events,
                    ),
                )
                if (response.isSuccessful) {
                    Log.i(TAG, "Manual outcome submitted: contactId=$contactId outcome=$outcome")
                } else {
                    Log.e(TAG, "Failed to submit manual outcome: HTTP ${response.code()}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Network error submitting manual outcome: contactId=$contactId", e)
            }
        }
    }
}
