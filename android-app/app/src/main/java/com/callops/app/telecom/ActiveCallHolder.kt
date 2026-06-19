package com.callops.app.telecom

import android.content.Context
import android.telecom.Call
import android.telecom.CallAudioState
import android.telecom.InCallService
import android.util.Log
import com.callops.app.data.CallEventRepository
import com.callops.app.data.model.CallEventPayload
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.util.UUID
import android.media.AudioManager
import com.callops.app.data.TokenStore
import com.callops.app.data.api.ApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.launch

/**
 * ActiveCallHolder — process-scoped singleton bridging InCallService → InCallActivity.
 *
 * Exposes live Call reference, CallAudioState, and triggers/coordinates Audio Recording.
 */
object ActiveCallHolder {

    private const val TAG = "ActiveCallHolder"

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

    // Real audio state flow (mute/routing)
    private val _audioState = MutableStateFlow<CallAudioState?>(null)
    val audioState: StateFlow<CallAudioState?> = _audioState.asStateFlow()
    var callEventRepository: CallEventRepository? = null

    private var inCallService: InCallService? = null
    private var audioRecorder: CallAudioRecorder? = null
    private var isRecordingActiveFlow = MutableStateFlow(false)
    val isRecordingActive: StateFlow<Boolean> = isRecordingActiveFlow.asStateFlow()

    private val events = mutableListOf<CallEventPayload>()
    private var dialingTimestamp: String? = null
    private var ringingTimestamp: String? = null
    private var activeTimestamp: String? = null

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val submittedStates = mutableSetOf<String>()

    private val callCallback = object : Call.Callback() {
        override fun onStateChanged(call: Call, state: Int) {
            _callState.value = state
            handleStateTransition(state, nowIso())
        }
    }

    fun setInCallService(service: InCallService) {
        inCallService = service
        // Populate initial audio state if available
        service.callAudioState?.let { updateAudioState(it) }
    }

    fun clearInCallService() {
        inCallService = null
        _audioState.value = null
    }

    fun setMuted(muted: Boolean, context: Context? = null) {
        Log.i(TAG, "setMuted: $muted")
        inCallService?.setMuted(muted)
        context?.let {
            try {
                val audioManager = it.getSystemService(Context.AUDIO_SERVICE) as AudioManager
                audioManager.isMicrophoneMute = muted
                Log.i(TAG, "AudioManager setMicrophoneMute: $muted")
            } catch (e: Exception) {
                Log.w(TAG, "Failed to set audio manager mute state: ${e.message}")
            }
        }
    }

    fun setSpeaker(speakerOn: Boolean, context: Context? = null) {
        val route = if (speakerOn) CallAudioState.ROUTE_SPEAKER else CallAudioState.ROUTE_EARPIECE
        Log.i(TAG, "setSpeaker: $speakerOn (route=$route)")
        inCallService?.setAudioRoute(route)
        context?.let {
            try {
                val audioManager = it.getSystemService(Context.AUDIO_SERVICE) as AudioManager
                audioManager.isSpeakerphoneOn = speakerOn
                audioManager.mode = if (speakerOn) AudioManager.MODE_IN_COMMUNICATION else AudioManager.MODE_IN_CALL
                Log.i(TAG, "AudioManager setSpeakerphoneOn: $speakerOn")
            } catch (e: Exception) {
                Log.w(TAG, "Failed to set audio manager speaker route: ${e.message}")
            }
        }
    }

    fun updateAudioState(state: CallAudioState) {
        _audioState.value = state
    }

    private fun normalizePhoneNumber(phone: String): String {
        val digits = phone.filter { it.isDigit() }
        return if (digits.length >= 10) digits.takeLast(10) else digits
    }

    private fun resolveContactFromNumber(rawPhone: String, context: Context) {
        val normPhone = normalizePhoneNumber(rawPhone)
        if (normPhone.isEmpty()) return

        scope.launch {
            try {
                val tokenStore = TokenStore(context.applicationContext)
                val storedUser = tokenStore.userFlow().firstOrNull() ?: return@launch
                val bearerToken = "Bearer ${storedUser.token}"
                val response = ApiClient.apiService.getMyContacts(bearerToken)
                if (response.isSuccessful && response.body() != null) {
                    val contacts = response.body()!!.contacts
                    val matched = contacts.find { normalizePhoneNumber(it.phone_number) == normPhone }
                    if (matched != null) {
                        Log.i(TAG, "Resolved contact for number $rawPhone: ID=${matched.id}, Name=${matched.full_name}")
                        updateContactInfo(matched.full_name, matched.phone_number, matched.id)
                        catchUpPendingEvents()
                    } else {
                        Log.w(TAG, "No matching contact in assigned contacts for: $rawPhone")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error resolving contact from phone number", e)
            }
        }
    }

    private fun submitEventLive(
        state: String,
        timestamp: String,
        ringDuration: Int? = null,
        talkDuration: Int? = null,
        audioFile: File? = null
    ) {
        val contactId = _callInfo.value?.contactId ?: ""
        if (contactId.isEmpty()) {
            Log.d(TAG, "Cannot submit event live for state $state: contactId is empty")
            return
        }

        val key = "${state}_${timestamp}"
        if (submittedStates.contains(key)) return
        submittedStates.add(key)

        val callId = _callInfo.value?.callId ?: return
        val event = buildCallEventPayload(state, timestamp, ringDuration, talkDuration)
        Log.i(TAG, "Submitting event live: state=$state, callId=$callId")
        callEventRepository?.submitEvents(callId, contactId, listOf(event), audioFile)
    }

    private fun catchUpPendingEvents() {
        dialingTimestamp?.let { submitEventLive("dialing", it) }
        ringingTimestamp?.let { submitEventLive("ringing", it) }
        activeTimestamp?.let {
            submitEventLive("active", it)
            if (audioRecorder?.isActive?.value != true) {
                val callId = _callInfo.value?.callId ?: UUID.randomUUID().toString()
                Log.i(TAG, "Starting call recorder (catchup) for callId: $callId")
                audioRecorder?.start(callId)
                isRecordingActiveFlow.value = audioRecorder?.isActive?.value ?: false
            }
        }
    }

    private fun handleStateTransition(state: Int, ts: String) {
        val contactId = _callInfo.value?.contactId ?: ""

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
                    
                    if (contactId.isNotEmpty()) {
                        val callId = _callInfo.value?.callId ?: UUID.randomUUID().toString()
                        Log.i(TAG, "Starting call recorder for callId: $callId")
                        audioRecorder?.start(callId)
                        isRecordingActiveFlow.value = audioRecorder?.isActive?.value ?: false
                    }
                }
            }
            Call.STATE_DISCONNECTED -> {
                if (contactId.isNotEmpty()) {
                    submitEndedEvent(contactId, ts)
                }
            }
        }

        if (contactId.isNotEmpty()) {
            when (state) {
                Call.STATE_RINGING -> submitEventLive("ringing", ts)
                Call.STATE_ACTIVE -> submitEventLive("active", ts)
            }
        }
    }

    private fun submitEndedEvent(contactId: String, ts: String) {
        val key = "ended_$ts"
        if (submittedStates.contains(key)) return

        val ringDuration = ringingTimestamp?.let { r ->
            activeTimestamp?.let { a -> elapsedSeconds(r, a) } ?: 0
        }
        val talkDuration = activeTimestamp?.let { a -> elapsedSeconds(a, ts) }
        
        isRecordingActiveFlow.value = false
        val wavFile = audioRecorder?.stop()
        if (wavFile != null) {
            Log.i(TAG, "WAV recording generated: ${wavFile.absolutePath} (${wavFile.length()} bytes)")
        } else {
            Log.w(TAG, "No WAV recording generated for this call")
        }

        events += buildCallEventPayload(
            state = "ended",
            timestamp = ts,
            ringDuration = ringDuration,
            talkDuration = talkDuration,
        )

        submitEventLive(
            state = "ended",
            timestamp = ts,
            ringDuration = ringDuration,
            talkDuration = talkDuration,
            audioFile = wavFile
        )
    }

    fun setCall(
        call: Call,
        contactName: String = "",
        phoneNumber: String = "",
        contactId: String = "",
        context: Context? = null
    ) {
        call.registerCallback(callCallback)
        _callState.value = call.state

        val appContext = context?.applicationContext
        if (appContext != null) {
            audioRecorder = CallAudioRecorder(appContext.cacheDir)
            if (callEventRepository == null) {
                callEventRepository = CallEventRepository(TokenStore(appContext), appContext)
            }
        }

        // Initialize event tracking variables
        events.clear()
        submittedStates.clear()
        dialingTimestamp = null
        ringingTimestamp = null
        activeTimestamp = null
        isRecordingActiveFlow.value = false

        val currentInfo = _callInfo.value
        var resolvedName = if (contactName.isNotEmpty()) contactName else (currentInfo?.contactName ?: "")
        var resolvedPhone = if (phoneNumber.isNotEmpty()) phoneNumber else (currentInfo?.phoneNumber ?: "")
        val resolvedContactId = if (contactId.isNotEmpty()) contactId else (currentInfo?.contactId ?: "")
        
        if (resolvedPhone.isEmpty()) {
            resolvedPhone = call.details?.handle?.schemeSpecificPart ?: ""
        }
        
        val callId = currentInfo?.callId ?: UUID.randomUUID().toString()
        _callInfo.value = CallInfo(call, callId, resolvedName, resolvedPhone, resolvedContactId)

        // Capture initial dialing state
        val ts = nowIso()
        dialingTimestamp = ts
        events += buildCallEventPayload("dialing", ts)

        if (resolvedContactId.isNotEmpty()) {
            submitEventLive("dialing", ts)
        } else if (appContext != null && resolvedPhone.isNotEmpty()) {
            resolveContactFromNumber(resolvedPhone, appContext)
        }

        // If the call is already in a ringing or active state, handle it
        handleStateTransition(call.state, ts)
    }

    fun clearCall() {
        _callInfo.value?.call?.unregisterCallback(callCallback)
        
        val info = _callInfo.value
        if (info != null && info.contactId.isNotEmpty()) {
            submitEndedEvent(info.contactId, nowIso())
        }

        _callInfo.value = null
        _callState.value = Call.STATE_DISCONNECTED
        audioRecorder = null
        isRecordingActiveFlow.value = false
    }

    fun updateContactInfo(contactName: String, phoneNumber: String, contactId: String) {
        val current = _callInfo.value
        if (current != null) {
            _callInfo.value = current.copy(contactName = contactName, phoneNumber = phoneNumber, contactId = contactId)
        } else {
            _callInfo.value = CallInfo(call = null, contactName = contactName, phoneNumber = phoneNumber, contactId = contactId)
        }
    }

    fun onCallEventsReady(contactId: String, events: List<CallEventPayload>, audioFile: File? = null) {
        val callId = _callInfo.value?.callId ?: UUID.randomUUID().toString()
        callEventRepository?.submitEvents(callId, contactId, events, audioFile)
    }
}
