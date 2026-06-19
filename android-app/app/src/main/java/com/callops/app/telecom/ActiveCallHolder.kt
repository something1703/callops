package com.callops.app.telecom

import android.telecom.Call
import com.callops.app.data.CallEventRepository
import com.callops.app.data.model.CallEventPayload
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID

/**
 * ActiveCallHolder — process-scoped singleton bridging InCallService → InCallActivity.
 *
 * InCallService cannot communicate directly with an Activity via constructor injection.
 * This singleton holds the live Call reference and a StateFlow of call state
 * that InCallActivity (and InCallScreen composable) observes.
 *
 * Cleared when InCallService.onCallRemoved() fires.
 */
object ActiveCallHolder {

    data class CallInfo(
        val call: Call?,
        val callId: String = UUID.randomUUID().toString(),
        val contactName: String = "",
        val phoneNumber: String = "",
        val contactId: String = "",
    )

    private val _callInfo = MutableStateFlow<CallInfo?>(null)
    val callInfo: StateFlow<CallInfo?> = _callInfo.asStateFlow()

    private val _callState = MutableStateFlow<Int>(Call.STATE_NEW)
    val callState: StateFlow<Int> = _callState.asStateFlow()

    var callEventRepository: CallEventRepository? = null

    private val events = mutableListOf<CallEventPayload>()
    private var dialingTimestamp: String? = null
    private var ringingTimestamp: String? = null
    private var activeTimestamp: String? = null

    private val callCallback = object : Call.Callback() {
        override fun onStateChanged(call: Call, state: Int) {
            _callState.value = state
            handleStateTransition(state, nowIso())
        }
    }

    private fun handleStateTransition(state: Int, ts: String) {
        val contactId = _callInfo.value?.contactId ?: ""
        if (contactId.isEmpty()) return

        when (state) {
            Call.STATE_RINGING -> {
                if (ringingTimestamp == null) {
                    ringingTimestamp = ts
                    events += buildCallEventPayload("ringing", ts)
                }
            }
            Call.STATE_ACTIVE -> {
                if (activeTimestamp == null) {
                    activeTimestamp = ts
                    events += buildCallEventPayload("active", ts)
                }
            }
            Call.STATE_DISCONNECTED -> {
                submitEndedEvent(contactId, ts)
            }
        }
    }

    private fun submitEndedEvent(contactId: String, ts: String) {
        if (events.any { it.state == "ended" }) return
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
        onCallEventsReady(contactId, events.toList())
    }

    fun setCall(call: Call, contactName: String = "", phoneNumber: String = "", contactId: String = "") {
        call.registerCallback(callCallback)
        _callState.value = call.state

        // Initialize event tracking variables
        events.clear()
        dialingTimestamp = null
        ringingTimestamp = null
        activeTimestamp = null

        val currentInfo = _callInfo.value
        val resolvedName = if (contactName.isNotEmpty()) contactName else (currentInfo?.contactName ?: "")
        val resolvedPhone = if (phoneNumber.isNotEmpty()) phoneNumber else (currentInfo?.phoneNumber ?: "")
        val resolvedContactId = if (contactId.isNotEmpty()) contactId else (currentInfo?.contactId ?: "")
        val callId = currentInfo?.callId ?: UUID.randomUUID().toString()

        _callInfo.value = CallInfo(call, callId, resolvedName, resolvedPhone, resolvedContactId)

        // Capture initial dialing state
        val ts = nowIso()
        dialingTimestamp = ts
        events += buildCallEventPayload("dialing", ts)

        // If the call is already in a ringing or active state, handle it
        handleStateTransition(call.state, ts)
    }

    fun clearCall() {
        _callInfo.value?.call?.unregisterCallback(callCallback)
        
        // Ensure ended event is submitted if not already done
        val info = _callInfo.value
        if (info != null && info.contactId.isNotEmpty()) {
            submitEndedEvent(info.contactId, nowIso())
        }

        _callInfo.value = null
        _callState.value = Call.STATE_DISCONNECTED
    }

    fun updateContactInfo(contactName: String, phoneNumber: String, contactId: String) {
        val current = _callInfo.value
        if (current != null) {
            _callInfo.value = current.copy(contactName = contactName, phoneNumber = phoneNumber, contactId = contactId)
        } else {
            // Called before InCallService.onCallAdded — pre-populate
            _callInfo.value = CallInfo(call = null, contactName = contactName, phoneNumber = phoneNumber, contactId = contactId)
        }
    }

    /**
     * Called when the call reaches an ended/failed state.
     * Delegates to [callEventRepository] for the backend POST.
     */
    fun onCallEventsReady(contactId: String, events: List<CallEventPayload>) {
        val callId = _callInfo.value?.callId ?: UUID.randomUUID().toString()
        callEventRepository?.submitEvents(callId, contactId, events)
    }
}

