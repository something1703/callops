package com.callops.app.telecom

import android.telecom.Call
import android.telecom.InCallService
import android.util.Log
import com.callops.app.ui.InCallActivity

/**
 * CallOpsInCallService
 *
 * The system binds to this service when we are set as the default dialer.
 * On call added: launches InCallActivity with the call details.
 * On call removed: signals the activity to finish.
 *
 * If the user has NOT granted us the dialer role, the system simply doesn't
 * bind to this service — the system default dialer handles the UI instead.
 * No crash, the call still works.
 */
class CallOpsInCallService : InCallService() {

    companion object {
        private const val TAG = "CallOpsInCallService"
    }

    override fun onCallAdded(call: Call) {
        super.onCallAdded(call)
        Log.i(TAG, "onCallAdded: state=${call.state}")

        // Pass the call to the singleton holder so InCallActivity can observe it
        ActiveCallHolder.setCall(call)

        // Launch InCallActivity over the lockscreen
        val intent = InCallActivity.createIntent(this)
        startActivity(intent)
    }

    override fun onCallRemoved(call: Call) {
        super.onCallRemoved(call)
        Log.i(TAG, "onCallRemoved")
        ActiveCallHolder.clearCall()
        // InCallActivity observes ActiveCallHolder and finishes itself
    }
}
