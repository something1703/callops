package com.callops.app.navigation

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.*
import androidx.core.content.ContextCompat
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.callops.app.data.CallEventRepository
import com.callops.app.data.TokenStore
import com.callops.app.telecom.ActiveCallHolder
import com.callops.app.telecom.CallManager
import com.callops.app.ui.ContactsScreen
import com.callops.app.ui.DialerRoleScreen
import com.callops.app.ui.LoginScreen
import com.callops.app.ui.ManualOutcomeSheet
import com.callops.app.ui.launchSystemDialer
import com.callops.app.viewmodel.AuthViewModel
import com.callops.app.viewmodel.ContactsViewModel
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.runBlocking

object Routes {
    const val LOGIN = "login"
    const val CONTACTS = "contacts"
    const val DIALER_ROLE = "dialer_role/{phone}/{contactId}/{contactName}"

    fun dialerRole(phone: String, contactId: String, contactName: String) =
        "dialer_role/${encode(phone)}/${encode(contactId)}/${encode(contactName)}"

    private fun encode(s: String) = java.net.URLEncoder.encode(s, "UTF-8")
}

@Composable
fun CallOpsNavGraph(tokenStore: TokenStore) {
    val navController = rememberNavController()

    val startDestination = remember {
        val hasToken = runBlocking { tokenStore.userFlow().firstOrNull() != null }
        if (hasToken) Routes.CONTACTS else Routes.LOGIN
    }

    val authViewModel = remember { AuthViewModel(tokenStore) }
    val contactsViewModel = remember { ContactsViewModel(tokenStore) }

    val context = androidx.compose.ui.platform.LocalContext.current
    val callManager = remember { CallManager(context) }
    val callEventRepository = remember { CallEventRepository(tokenStore, context) }
    remember {
        ActiveCallHolder.callEventRepository = callEventRepository
        callManager.registerPhoneAccount()
    }

    // ── Manual outcome sheet state (shown after system-dialer call) ──────────
    var showOutcomeSheet by remember { mutableStateOf(false) }
    var outcomeContactId by remember { mutableStateOf("") }
    var outcomeContactName by remember { mutableStateOf("") }
    var outcomePhone by remember { mutableStateOf("") }

    // ── Runtime CALL_PHONE permission launcher ────────────────────────────────
    // pendingCall stores what to do once permission is granted
    var pendingCallPhone by remember { mutableStateOf<String?>(null) }
    var pendingCallContactId by remember { mutableStateOf<String?>(null) }
    var pendingCallContactName by remember { mutableStateOf<String?>(null) }

    val callPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        val phone = pendingCallPhone ?: return@rememberLauncherForActivityResult
        val cId   = pendingCallContactId ?: return@rememberLauncherForActivityResult
        val cName = pendingCallContactName ?: return@rememberLauncherForActivityResult
        if (granted) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                navController.navigate(Routes.dialerRole(phone, cId, cName))
            } else {
                callManager.placeCall(phone, cId, cName)
            }
        }
        // If denied, do nothing — user can try again
    }

    /** Entry point called when the agent taps the call button. */
    fun initiateCall(phone: String, contactId: String, contactName: String) {
        val hasPermission = ContextCompat.checkSelfPermission(
            context, Manifest.permission.CALL_PHONE,
        ) == PackageManager.PERMISSION_GRANTED

        if (hasPermission) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                navController.navigate(Routes.dialerRole(phone, contactId, contactName))
            } else {
                callManager.placeCall(phone, contactId, contactName)
            }
        } else {
            // Store pending call details, then request permission
            pendingCallPhone = phone
            pendingCallContactId = contactId
            pendingCallContactName = contactName
            callPermissionLauncher.launch(Manifest.permission.CALL_PHONE)
        }
    }

    NavHost(
        navController = navController,
        startDestination = startDestination,
    ) {
        composable(Routes.LOGIN) {
            LoginScreen(
                viewModel = authViewModel,
                onLoginSuccess = {
                    navController.navigate(Routes.CONTACTS) {
                        popUpTo(Routes.LOGIN) { inclusive = true }
                    }
                },
            )
        }

        composable(Routes.CONTACTS) {
            ContactsScreen(
                contactsViewModel = contactsViewModel,
                authViewModel = authViewModel,
                onSignOut = {
                    navController.navigate(Routes.LOGIN) {
                        popUpTo(Routes.CONTACTS) { inclusive = true }
                    }
                },
                onCall = { phone, contactId, contactName ->
                    // CallOps in-app calling: requests CALL_PHONE permission + DialerRole
                    initiateCall(phone, contactId, contactName)
                },
                onCallSystemDialer = { phone, contactId, contactName ->
                    // System dialer: open native phone app directly + show manual outcome sheet
                    launchSystemDialer(context, phone)
                    outcomeContactId = contactId
                    outcomeContactName = contactName
                    outcomePhone = phone
                    showOutcomeSheet = true
                },
            )
        }

        composable(
            route = Routes.DIALER_ROLE,
            arguments = listOf(
                navArgument("phone") { type = NavType.StringType },
                navArgument("contactId") { type = NavType.StringType },
                navArgument("contactName") { type = NavType.StringType },
            ),
        ) { backStackEntry ->
            val phone = java.net.URLDecoder.decode(
                backStackEntry.arguments?.getString("phone") ?: "", "UTF-8"
            )
            val contactId = java.net.URLDecoder.decode(
                backStackEntry.arguments?.getString("contactId") ?: "", "UTF-8"
            )
            val contactName = java.net.URLDecoder.decode(
                backStackEntry.arguments?.getString("contactName") ?: "", "UTF-8"
            )

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                DialerRoleScreen(
                    phoneNumber = phone,
                    contactId = contactId,
                    contactName = contactName,
                    onRoleGranted = {
                        navController.popBackStack()
                        callManager.placeCall(phone, contactId, contactName)
                    },
                    onDeclined = {
                        // System dialer was launched inside DialerRoleScreen.
                        // Show a manual outcome prompt so the agent can still log the result.
                        navController.popBackStack()
                        outcomeContactId = contactId
                        outcomeContactName = contactName
                        outcomePhone = phone
                        showOutcomeSheet = true
                    },
                )
            }
        }
    }

    // ── Manual outcome bottom sheet ───────────────────────────────────────────
    if (showOutcomeSheet) {
        ManualOutcomeSheet(
            contactName = outcomeContactName,
            contactId = outcomeContactId,
            phoneNumber = outcomePhone,
            callEventRepository = callEventRepository,
            onDismiss = { showOutcomeSheet = false },
        )
    }
}
