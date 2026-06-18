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

    /** Injected by MainActivity so ConnectionService can POST events. */
    var callEventRepository: CallEventRepository? = null

    private val callCallback = object : Call.Callback() {
        override fun onStateChanged(call: Call, state: Int) {
            _callState.value = state
        }
    }

    fun setCall(call: Call, contactName: String = "", phoneNumber: String = "", contactId: String = "") {
        call.registerCallback(callCallback)
        _callState.value = call.state
        _callInfo.value = CallInfo(call, UUID.randomUUID().toString(), contactName, phoneNumber, contactId)
    }

    fun clearCall() {
        _callInfo.value?.call?.unregisterCallback(callCallback)
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
     * Called by CallOpsConnection when the call reaches an ended/failed state.
     * Delegates to [callEventRepository] for the backend POST.
     */
    fun onCallEventsReady(contactId: String, events: List<CallEventPayload>) {
        val callId = _callInfo.value?.callId ?: UUID.randomUUID().toString()
        callEventRepository?.submitEvents(callId, contactId, events)
    }
}

