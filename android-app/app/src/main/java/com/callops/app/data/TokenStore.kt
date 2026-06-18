package com.callops.app.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "callops_prefs")

/**
 * TokenStore — encrypted-at-rest via DataStore.
 * Stores the backend JWT and basic user info so the app survives process restarts.
 */
class TokenStore(private val context: Context) {

    companion object {
        private val KEY_TOKEN = stringPreferencesKey("auth_token")
        private val KEY_USER_ID = stringPreferencesKey("user_id")
        private val KEY_USER_NAME = stringPreferencesKey("user_name")
        private val KEY_USER_EMAIL = stringPreferencesKey("user_email")
        private val KEY_USER_ROLE = stringPreferencesKey("user_role")
    }

    val token: Flow<String?> = context.dataStore.data.map { it[KEY_TOKEN] }

    suspend fun saveSession(
        token: String,
        userId: String,
        name: String,
        email: String,
        role: String,
    ) {
        context.dataStore.edit { prefs ->
            prefs[KEY_TOKEN] = token
            prefs[KEY_USER_ID] = userId
            prefs[KEY_USER_NAME] = name
            prefs[KEY_USER_EMAIL] = email
            prefs[KEY_USER_ROLE] = role
        }
    }

    suspend fun clearSession() {
        context.dataStore.edit { it.clear() }
    }

    fun userFlow(): Flow<StoredUser?> = context.dataStore.data.map { prefs ->
        val token = prefs[KEY_TOKEN] ?: return@map null
        val id = prefs[KEY_USER_ID] ?: return@map null
        StoredUser(
            token = token,
            id = id,
            name = prefs[KEY_USER_NAME] ?: "",
            email = prefs[KEY_USER_EMAIL] ?: "",
            role = prefs[KEY_USER_ROLE] ?: "agent",
        )
    }
}

data class StoredUser(
    val token: String,
    val id: String,
    val name: String,
    val email: String,
    val role: String,
)
