package com.callops.app.data.api

import com.callops.app.data.model.AuthResponse
import com.callops.app.data.model.CallEventsRequest
import com.callops.app.data.model.CallEventsResponse
import com.callops.app.data.model.ContactsResponse
import com.callops.app.data.model.GoogleAuthRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST

interface ApiService {

    @POST("/api/auth/google")
    suspend fun loginWithGoogle(
        @Body body: GoogleAuthRequest,
    ): Response<AuthResponse>

    @GET("/api/auth/me")
    suspend fun getMe(
        @Header("Authorization") bearerToken: String,
    ): Response<AuthResponse>

    /**
     * Returns only the calling agent's active assigned contacts.
     * Server enforces this scope via the JWT — never trust client-supplied agent ID.
     */
    @GET("/api/assignments/mine")
    suspend fun getMyContacts(
        @Header("Authorization") bearerToken: String,
    ): Response<ContactsResponse>

    /**
     * Agent submits all state transitions for a completed call.
     * Server verifies the contact is in an active assignment for this agent.
     */
    @POST("/api/calls/events")
    suspend fun submitCallEvents(
        @Header("Authorization") bearerToken: String,
        @Body body: CallEventsRequest,
    ): Response<CallEventsResponse>
}
