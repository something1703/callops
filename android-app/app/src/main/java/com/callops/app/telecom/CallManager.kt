package com.callops.app.telecom

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.util.Log
import com.callops.app.data.model.CallEventPayload
import java.time.Instant
import java.time.format.DateTimeFormatter

/**
 * CallManager — the single entry point for placing calls from the app.
 *
 * Uses MANAGE_OWN_CALLS permission to register a PhoneAccount and place
 * outgoing calls via TelecomManager.placeCall() WITHOUT requiring the user
 * to set us as the default dialer.
 *
 * The ConnectionService (CallOpsConnectionService) handles the actual call
 * lifecycle from there.
 */
class CallManager(private val context: Context) {

    companion object {
        private const val TAG = "CallManager"
        const val PHONE_ACCOUNT_ID = "callops_account"
        const val EXTRA_CONTACT_ID = "contact_id"
        const val EXTRA_CONTACT_NAME = "contact_name"
    }

    private val telecomManager =
        context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager

    val phoneAccountHandle = PhoneAccountHandle(
        ComponentName(context, CallOpsConnectionService::class.java),
        PHONE_ACCOUNT_ID,
    )

    /**
     * Register our PhoneAccount with the system if not already registered.
     * Must be called once (e.g. on first launch after MANAGE_OWN_CALLS granted).
     */
    @Suppress("MissingPermission")
    fun registerPhoneAccount() {
        val account = PhoneAccount.builder(phoneAccountHandle, "CallOps")
            .setCapabilities(PhoneAccount.CAPABILITY_CALL_PROVIDER)
            .build()
        telecomManager.registerPhoneAccount(account)
        Log.i(TAG, "PhoneAccount registered")
    }

    /**
     * Place an outgoing call to [phoneNumber] for [contactId]/[contactName].
     * Returns true if the call was handed off to TelecomManager successfully.
     */
    @Suppress("MissingPermission")
    fun placeCall(
        phoneNumber: String,
        contactId: String,
        contactName: String,
    ): Boolean {
        return try {
            val uri = Uri.fromParts("tel", phoneNumber, null)
            val extras = Bundle().apply {
                putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, phoneAccountHandle)
                putString(EXTRA_CONTACT_ID, contactId)
                putString(EXTRA_CONTACT_NAME, contactName)
            }
            telecomManager.placeCall(uri, extras)
            // Update ActiveCallHolder with contact info (Connection will be created shortly)
            ActiveCallHolder.updateContactInfo(contactName, phoneNumber, contactId)
            Log.i(TAG, "placeCall → $phoneNumber (contact: $contactName)")
            true
        } catch (e: Exception) {
            Log.e(TAG, "placeCall failed", e)
            false
        }
    }
}

// ── Timestamp helper used by ConnectionService ─────────────────────────────────

fun nowIso(): String = DateTimeFormatter.ISO_INSTANT.format(Instant.now())

fun elapsedSeconds(from: String, to: String): Int {
    return try {
        val fromInstant = Instant.parse(from)
        val toInstant = Instant.parse(to)
        ((toInstant.epochSecond - fromInstant.epochSecond).coerceAtLeast(0)).toInt()
    } catch (e: Exception) {
        0
    }
}

// ── Event builder helper ───────────────────────────────────────────────────────

fun buildCallEventPayload(
    state: String,
    timestamp: String,
    ringDuration: Int? = null,
    talkDuration: Int? = null,
    recordingKey: String? = null,
) = CallEventPayload(
    state = state,
    event_timestamp = timestamp,
    ring_duration_seconds = ringDuration,
    talk_duration_seconds = talkDuration,
    recording_s3_key = recordingKey,
)
