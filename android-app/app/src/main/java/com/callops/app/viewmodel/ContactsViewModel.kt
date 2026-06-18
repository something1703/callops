package com.callops.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.callops.app.data.StoredUser
import com.callops.app.data.TokenStore
import com.callops.app.data.api.ApiClient
import com.callops.app.data.model.AssignedContact
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.launch

sealed class ContactsState {
    data object Loading : ContactsState()
    data class Success(val contacts: List<AssignedContact>) : ContactsState()

    /**
     * The agent has no active assignments at all — admin has not yet assigned any contacts.
     * Show "contact your admin" message.
     */
    data object NotAssigned : ContactsState()

    /**
     * All assigned contacts were completed/reassigned away — there genuinely are zero active.
     * This is different from NotAssigned: it means the agent *had* work but is done.
     */
    data object AllDone : ContactsState()

    data class Error(val message: String) : ContactsState()
}

class ContactsViewModel(private val tokenStore: TokenStore) : ViewModel() {

    private val _state = MutableStateFlow<ContactsState>(ContactsState.Loading)
    val state: StateFlow<ContactsState> = _state.asStateFlow()

    private val _user = MutableStateFlow<StoredUser?>(null)
    val user: StateFlow<StoredUser?> = _user.asStateFlow()

    init {
        viewModelScope.launch {
            tokenStore.userFlow().collect { storedUser ->
                _user.value = storedUser
            }
        }
        loadContacts()
    }

    fun loadContacts() {
        _state.value = ContactsState.Loading
        viewModelScope.launch {
            try {
                val storedUser = tokenStore.userFlow().firstOrNull()
                    ?: run {
                        _state.value = ContactsState.Error("Session expired. Please sign in again.")
                        return@launch
                    }

                val bearerToken = "Bearer ${storedUser.token}"
                val response = ApiClient.apiService.getMyContacts(bearerToken)

                when {
                    response.isSuccessful -> {
                        val contacts = response.body()?.contacts ?: emptyList()
                        _state.value = when {
                            contacts.isNotEmpty() -> ContactsState.Success(contacts)
                            // We can't distinguish NotAssigned vs AllDone from a 200 empty list alone.
                            // Treat as NotAssigned (the more common first-time state) — Phase 3
                            // will add a separate "total ever assigned" count to differentiate.
                            else -> ContactsState.NotAssigned
                        }
                    }
                    response.code() == 401 -> {
                        _state.value = ContactsState.Error("Session expired. Please sign in again.")
                    }
                    else -> {
                        _state.value = ContactsState.Error(
                            "Failed to load contacts (${response.code()}). Pull down to retry."
                        )
                    }
                }
            } catch (e: Exception) {
                _state.value = ContactsState.Error(
                    "Cannot reach the server. Check your connection and try again."
                )
            }
        }
    }
}
