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
 *
 * On failure: logs the error. A production Phase 4 hardening would add
 * WorkManager-based retry — kept simple here as per Phase 3 scope.
 */
class CallEventRepository(
    private val tokenStore: TokenStore,
    context: Context,
) {
    companion object {
        private const val TAG = "CallEventRepository"
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    // Not currently used but kept for future WorkManager integration:
    @Suppress("unused")
    private val appContext = context.applicationContext

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
                    Log.e(
                        TAG,
                        "Failed to submit call events: HTTP ${response.code()} — callId=$callId",
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Network error submitting call events for callId=$callId", e)
            }
        }
    }
}
