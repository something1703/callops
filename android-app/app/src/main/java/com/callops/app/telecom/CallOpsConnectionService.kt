package com.callops.app.telecom

import android.net.Uri
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.PhoneAccountHandle
import android.util.Log
import com.callops.app.data.model.CallEventPayload

/**
 * CallOpsConnectionService
 *
 * The system binds to this service (via the registered PhoneAccount) to
 * create and manage outgoing calls. It captures every state transition with
 * a millisecond-precision timestamp and, on disconnect, hands the completed
 * event list to [ActiveCallHolder] for submission to the backend.
 */
class CallOpsConnectionService : ConnectionService() {

    companion object {
        private const val TAG = "CallOpsConnectionService"
    }

    override fun onCreateOutgoingConnection(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest,
    ): Connection {
        val contactId = request.extras?.getString(CallManager.EXTRA_CONTACT_ID) ?: ""
        val contactName = request.extras?.getString(CallManager.EXTRA_CONTACT_NAME) ?: ""
        val phoneNumber = request.address?.schemeSpecificPart ?: ""

        Log.i(TAG, "onCreateOutgoingConnection → $phoneNumber (contact: $contactName)")

        val connection = CallOpsConnection(
            contactId = contactId,
            contactName = contactName,
            phoneNumber = phoneNumber,
        )
        connection.setAddress(request.address, android.telecom.TelecomManager.PRESENTATION_ALLOWED)
        connection.setCallerDisplayName(contactName, android.telecom.TelecomManager.PRESENTATION_ALLOWED)
        connection.setDialing()

        // Update shared holder with contact info so InCallActivity can display it
        ActiveCallHolder.updateContactInfo(contactName, phoneNumber, contactId)

        return connection
    }

    override fun onCreateOutgoingConnectionFailed(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest?,
    ) {
        Log.e(TAG, "onCreateOutgoingConnectionFailed")
    }
}

// ── CallOpsConnection — state machine + event collector ───────────────────────

class CallOpsConnection(
    val contactId: String,
    val contactName: String,
    val phoneNumber: String,
) : Connection() {

    companion object {
        private const val TAG = "CallOpsConnection"
    }

    private val events = mutableListOf<CallEventPayload>()
    private var dialingTimestamp: String? = null
    private var ringingTimestamp: String? = null
    private var activeTimestamp: String? = null

    init {
        // Capture the DIALING event at construction time
        val ts = nowIso()
        dialingTimestamp = ts
        events += buildCallEventPayload("dialing", ts)
        Log.i(TAG, "DIALING at $ts")
    }

    override fun onStateChanged(state: Int) {
        val ts = nowIso()
        when (state) {
            STATE_RINGING -> {
                ringingTimestamp = ts
                events += buildCallEventPayload("ringing", ts)
                Log.i(TAG, "RINGING at $ts")
            }
            STATE_ACTIVE -> {
                activeTimestamp = ts
                events += buildCallEventPayload("active", ts)
                Log.i(TAG, "ACTIVE at $ts")
            }
            STATE_DISCONNECTED -> {
                val ringDuration = ringingTimestamp?.let { r ->
                    activeTimestamp?.let { a -> elapsedSeconds(r, a) } ?: 0
                }
                val talkDuration = activeTimestamp?.let { a -> elapsedSeconds(a, ts) }
                events += buildCallEventPayload(
                    state = "ended",
                    timestamp = ts,
                    ringDuration = ringDuration,
                    talkDuration = talkDuration,
                )
                Log.i(TAG, "ENDED at $ts — ring=${ringDuration}s talk=${talkDuration}s")
                onCallEnded()
            }
        }
    }

    private fun onCallEnded() {
        // Delegate event submission to ActiveCallHolder observer
        ActiveCallHolder.onCallEventsReady(contactId, events.toList())
    }
}
