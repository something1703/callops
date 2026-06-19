package com.callops.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PhoneForwarded
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshContainer
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.callops.app.data.StoredUser
import com.callops.app.data.model.AssignedContact
import com.callops.app.ui.theme.*
import com.callops.app.viewmodel.AuthViewModel
import com.callops.app.viewmodel.ContactsState
import com.callops.app.viewmodel.ContactsViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContactsScreen(
    contactsViewModel: ContactsViewModel,
    authViewModel: AuthViewModel,
    onSignOut: () -> Unit,
    onCall: (phone: String, contactId: String, contactName: String) -> Unit = { _, _, _ -> },
    onCallSystemDialer: (phone: String, contactId: String, contactName: String) -> Unit = { _, _, _ -> },
) {
    val state by contactsViewModel.state.collectAsState()
    val user by contactsViewModel.user.collectAsState()

    val pullRefreshState = rememberPullToRefreshState()

    // Trigger load when pull-to-refresh fires
    LaunchedEffect(pullRefreshState.isRefreshing) {
        if (pullRefreshState.isRefreshing) {
            contactsViewModel.loadContacts()
        }
    }

    // Stop refresh indicator when load settles
    LaunchedEffect(state) {
        if (state !is ContactsState.Loading) {
            pullRefreshState.endRefresh()
        }
    }

    Scaffold(
        containerColor = Gray950,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            "My Contacts",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color.White,
                        )
                        user?.let {
                            Text(
                                it.name,
                                fontSize = 12.sp,
                                color = Gray400,
                            )
                        }
                    }
                },
                actions = {
                    TextButton(
                        onClick = {
                            authViewModel.signOut()
                            onSignOut()
                        },
                    ) {
                        Text("Sign out", color = Gray400, fontSize = 13.sp)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Gray950,
                    scrolledContainerColor = Gray900,
                ),
            )
        },
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .nestedScroll(pullRefreshState.nestedScrollConnection),
        ) {
            when (val s = state) {

                // ── Loading skeleton ─────────────────────────────────────────
                is ContactsState.Loading -> {
                    LazyColumn(
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        items(8) { ContactSkeleton() }
                    }
                }

                // ── Populated list ───────────────────────────────────────────
                is ContactsState.Success -> {
                    LazyColumn(
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        item {
                            Text(
                                "${s.contacts.size} contacts assigned",
                                fontSize = 12.sp,
                                color = Gray600,
                                modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp),
                            )
                        }
                        items(s.contacts, key = { it.id }) { contact ->
                            ContactCard(
                                contact = contact,
                                onCall = {
                                    onCall(contact.phone_number, contact.id, contact.full_name)
                                },
                                onCallSystemDialer = {
                                    onCallSystemDialer(contact.phone_number, contact.id, contact.full_name)
                                },
                            )
                        }
                    }
                }

                // ── Not assigned — admin has never assigned anything yet ──────
                is ContactsState.NotAssigned -> {
                    EmptyState(
                        icon = "📋",
                        title = "No contacts assigned yet",
                        subtitle = "Your admin hasn't assigned any contacts to you.\nContact them or check back after your next shift.",
                        hint = "Pull down to refresh",
                        user = user,
                    )
                }

                // ── All done — assignments existed but all completed/gone ─────
                is ContactsState.AllDone -> {
                    EmptyState(
                        icon = "✅",
                        title = "All done for now!",
                        subtitle = "You've worked through all your assigned contacts.\nYour admin will send you a new batch soon.",
                        hint = "Pull down to check for new assignments",
                        user = user,
                    )
                }

                // ── Network / server error ───────────────────────────────────
                is ContactsState.Error -> {
                    ErrorState(
                        message = s.message,
                        onRetry = { contactsViewModel.loadContacts() },
                    )
                }
            }

            // Pull-to-refresh indicator always sits on top
            PullToRefreshContainer(
                state = pullRefreshState,
                modifier = Modifier.align(Alignment.TopCenter),
                containerColor = Gray800,
                contentColor = Indigo400,
            )
        }
    }
}

// ── Contact card ───────────────────────────────────────────────────────────────

@Composable
private fun ContactCard(
    contact: AssignedContact,
    onCall: () -> Unit = {},
    onCallSystemDialer: () -> Unit = {},
) {
    val statusColor = when (contact.status) {
        "new"            -> Indigo400
        "contacted"      -> AmberWarn
        "interested"     -> GreenActive
        "not_interested" -> AmberWarn
        "converted"      -> GreenActive
        "do_not_call"    -> RedError
        else             -> Gray600
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Gray900),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0x0DFFFFFF)),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Avatar circle
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0x1A6366F1)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Default.Person,
                    contentDescription = null,
                    tint = Indigo400,
                    modifier = Modifier.size(22.dp),
                )
            }

            Spacer(modifier = Modifier.width(14.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = contact.full_name,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium,
                    color = Color.White,
                )
                Text(
                    text = contact.phone_number,
                    fontSize = 13.sp,
                    color = Gray400,
                    modifier = Modifier.padding(top = 2.dp),
                )
                if (!contact.region.isNullOrBlank()) {
                    Text(
                        text = contact.region,
                        fontSize = 11.sp,
                        color = Gray600,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
                if (contact.tags.isNotEmpty()) {
                    Row(
                        modifier = Modifier.padding(top = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        contact.tags.take(3).forEach { tag ->
                            Surface(
                                shape = RoundedCornerShape(4.dp),
                                color = Color(0x14818CF8),
                            ) {
                                Text(
                                    text = tag,
                                    fontSize = 10.sp,
                                    color = Indigo400,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                )
                            }
                        }
                    }
                }
            }

            // Right column: status chip + call buttons
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = statusColor.copy(alpha = 0.15f),
                ) {
                    Text(
                        text = contact.status.replace("_", " "),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        color = statusColor,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
                if (contact.status != "do_not_call") {
                    // Primary: CallOps in-app dialer
                    IconButton(
                        onClick = onCall,
                        modifier = androidx.compose.ui.Modifier.size(36.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Call,
                            contentDescription = "Call via CallOps",
                            tint = GreenActive,
                            modifier = androidx.compose.ui.Modifier.size(20.dp),
                        )
                    }
                    // Secondary: System dialer fallback
                    IconButton(
                        onClick = onCallSystemDialer,
                        modifier = androidx.compose.ui.Modifier.size(30.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Default.PhoneForwarded,
                            contentDescription = "Call via system dialer",
                            tint = Gray600,
                            modifier = androidx.compose.ui.Modifier.size(16.dp),
                        )
                    }
                }
            }
        }
    }
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

@Composable
private fun ContactSkeleton() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Gray900),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Gray800),
            )
            Spacer(modifier = Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.6f)
                        .height(14.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(Gray800),
                )
                Spacer(modifier = Modifier.height(8.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.4f)
                        .height(12.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(Gray800),
                )
            }
        }
    }
}

// ── Generic empty state ────────────────────────────────────────────────────────

@Composable
private fun EmptyState(
    icon: String,
    title: String,
    subtitle: String,
    hint: String,
    user: StoredUser?,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(icon, fontSize = 52.sp)
        Spacer(modifier = Modifier.height(20.dp))
        Text(title, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            subtitle,
            fontSize = 14.sp,
            color = Gray400,
            textAlign = TextAlign.Center,
            lineHeight = 22.sp,
        )
        Spacer(modifier = Modifier.height(12.dp))
        Surface(
            shape = RoundedCornerShape(8.dp),
            color = Color(0x08FFFFFF),
        ) {
            Text(
                text = "↑ $hint",
                fontSize = 12.sp,
                color = Gray600,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            )
        }
        user?.let {
            Spacer(modifier = Modifier.height(16.dp))
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = Color(0x0D818CF8),
            ) {
                Text(
                    text = "Signed in as ${it.email}",
                    fontSize = 12.sp,
                    color = Indigo400,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                )
            }
        }
    }
}

// ── Error state ────────────────────────────────────────────────────────────────

@Composable
private fun ErrorState(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("⚠️", fontSize = 48.sp)
        Spacer(modifier = Modifier.height(16.dp))
        Text("Something went wrong", fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
        Spacer(modifier = Modifier.height(8.dp))
        Text(message, fontSize = 14.sp, color = Gray400, textAlign = TextAlign.Center, lineHeight = 20.sp)
        Spacer(modifier = Modifier.height(24.dp))
        Button(
            onClick = onRetry,
            colors = ButtonDefaults.buttonColors(containerColor = Indigo600),
            shape = RoundedCornerShape(12.dp),
        ) {
            Text("Try again", fontWeight = FontWeight.Medium)
        }
    }
}
