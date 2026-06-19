package com.callops.app.data.model

/**
 * All network-layer data models live here.
 * Column names match SCHEMA.md exactly — see AGENT.md.
 */

data class AuthUser(
    val id: String,
    val email: String,
    val name: String,
    val role: String,           // "admin" | "team_lead" | "agent"
)

data class AuthResponse(
    val token: String,
    val user: AuthUser,
)

data class GoogleAuthRequest(
    val id_token: String,
)

data class Contact(
    val id: String,
    val full_name: String,
    val phone_number: String,
    val region: String?,
    val status: String,         // contact_status enum value
    val tags: List<String>,
)

/**
 * Response wrapper from GET /api/assignments/mine.
 * Each item is a flattened contact + assignment metadata.
 */
data class AssignedContact(
    val assignment_id: String,
    val assigned_at: String,
    // Contact fields (same names as SCHEMA.md)
    val id: String,
    val full_name: String,
    val phone_number: String,
    val region: String?,
    val status: String,
    val tags: List<String>,
)

data class ContactsResponse(
    val contacts: List<AssignedContact>,
)

data class ApiError(
    val error: String,
    val message: String,
)

// ── Phase 3: Call event models ────────────────────────────────────────────────

data class CallEventPayload(
    val state: String,              // dialing | ringing | active | ended | failed
    val event_timestamp: String,    // ISO-8601 UTC
    val ring_duration_seconds: Int? = null,
    val talk_duration_seconds: Int? = null,
    val recording_s3_key: String? = null,
)

data class CallEventsRequest(
    val call_id: String,
    val contact_id: String,
    val events: List<CallEventPayload>,
)

data class CallEventsResponse(
    val ok: Boolean,
    val call_id: String,
    val events_written: Int,
)

data class RecordingPresignRequest(
    val call_id: String,
)

data class RecordingPresignResponse(
    val presigned_url: String,
    val s3_key: String,
)
