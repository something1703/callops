package com.callops.app.viewmodel

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialException
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.callops.app.BuildConfig
import com.callops.app.data.TokenStore
import com.callops.app.data.api.ApiClient
import com.callops.app.data.model.GoogleAuthRequest
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class AuthState {
    data object Idle : AuthState()
    data object Loading : AuthState()
    data object Success : AuthState()
    data class Error(val message: String) : AuthState()
}

class AuthViewModel(private val tokenStore: TokenStore) : ViewModel() {

    private val _authState = MutableStateFlow<AuthState>(AuthState.Idle)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    /**
     * Launches Google Credential Manager sign-in flow.
     * On success, sends the ID token to our backend to get a CallOps JWT.
     * Every path (success and error) is handled without crashing.
     */
    fun signInWithGoogle(context: Context) {
        _authState.value = AuthState.Loading

        viewModelScope.launch {
            try {
                val googleIdOption = GetGoogleIdOption.Builder()
                    .setFilterByAuthorizedAccounts(false)   // show all Google accounts on the device
                    .setServerClientId(BuildConfig.GOOGLE_CLIENT_ID)
                    .setAutoSelectEnabled(true)             // auto-select if only one account
                    .build()

                val request = GetCredentialRequest.Builder()
                    .addCredentialOption(googleIdOption)
                    .build()

                val credentialManager = CredentialManager.create(context)
                val result = credentialManager.getCredential(context, request)

                val googleIdCredential = GoogleIdTokenCredential.createFrom(result.credential.data)
                val idToken = googleIdCredential.idToken

                // Exchange the Google ID token for a CallOps JWT
                val response = ApiClient.apiService.loginWithGoogle(
                    GoogleAuthRequest(id_token = idToken)
                )

                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    tokenStore.saveSession(
                        token = body.token,
                        userId = body.user.id,
                        name = body.user.name,
                        email = body.user.email,
                        role = body.user.role,
                    )
                    _authState.value = AuthState.Success
                } else {
                    val errorMsg = when (response.code()) {
                        403 -> "Your Google account is not registered in CallOps. Contact an admin."
                        401 -> "Sign-in failed. Please try again."
                        else -> "Something went wrong (${response.code()}). Please try again."
                    }
                    _authState.value = AuthState.Error(errorMsg)
                }

            } catch (e: GetCredentialException) {
                // User cancelled or no accounts available — not a crash
                _authState.value = AuthState.Error(
                    "Sign-in was cancelled or no Google account found on this device."
                )
            } catch (t: Throwable) {
                val isNetworkError = t is java.io.IOException || t.cause is java.io.IOException
                _authState.value = AuthState.Error(
                    if (isNetworkError) {
                        "Connection error. Make sure the app can reach the CallOps server."
                    } else {
                        "Sign-in error: ${t.localizedMessage ?: t.javaClass.simpleName}"
                    }
                )
            }
        }
    }

    fun signOut() {
        viewModelScope.launch {
            tokenStore.clearSession()
            _authState.value = AuthState.Idle
        }
    }

    fun resetState() {
        _authState.value = AuthState.Idle
    }
}
