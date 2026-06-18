package com.callops.app.navigation

import android.os.Build
import androidx.compose.runtime.*
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
import com.callops.app.viewmodel.AuthViewModel
import com.callops.app.viewmodel.ContactsViewModel
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.runBlocking

object Routes {
    const val LOGIN = "login"
    const val CONTACTS = "contacts"
    const val DIALER_ROLE = "dialer_role/{phone}/{contactId}/{contactName}"

    fun dialerRole(phone: String, contactId: String, contactName: String) =
        "dialer_role/$phone/$contactId/$contactName"
}

@Composable
fun CallOpsNavGraph(tokenStore: TokenStore) {
    val navController = rememberNavController()

    // Determine start destination from persisted token
    val startDestination = remember {
        val hasToken = runBlocking { tokenStore.userFlow().firstOrNull() != null }
        if (hasToken) Routes.CONTACTS else Routes.LOGIN
    }

    val authViewModel = remember { AuthViewModel(tokenStore) }
    val contactsViewModel = remember { ContactsViewModel(tokenStore) }

    // Wire up CallManager and CallEventRepository into ActiveCallHolder
    val context = androidx.compose.ui.platform.LocalContext.current
    val callManager = remember { CallManager(context) }
    val callEventRepository = remember { CallEventRepository(tokenStore, context) }
    remember {
        ActiveCallHolder.callEventRepository = callEventRepository
        callManager.registerPhoneAccount()
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
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        // Navigate to DialerRoleScreen which will request the role then place the call
                        navController.navigate(Routes.dialerRole(phone, contactId, contactName))
                    } else {
                        // Android 9 and below — place call directly (MANAGE_OWN_CALLS sufficient)
                        callManager.placeCall(phone, contactId, contactName)
                    }
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
            val phone = backStackEntry.arguments?.getString("phone") ?: ""
            val contactId = backStackEntry.arguments?.getString("contactId") ?: ""
            val contactName = backStackEntry.arguments?.getString("contactName") ?: ""

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                DialerRoleScreen(
                    onRoleGranted = {
                        navController.popBackStack()
                        callManager.placeCall(phone, contactId, contactName)
                    },
                    onDeclined = {
                        // Place call anyway — system dialer UI will be used
                        navController.popBackStack()
                        callManager.placeCall(phone, contactId, contactName)
                    },
                )
            }
        }
    }
}
