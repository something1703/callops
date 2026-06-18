const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://100.59.0.187:4000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options?: RequestInit & { token?: string }
): Promise<T> {
  const { token, ...fetchOptions } = options ?? {};

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.message ?? `Request failed with status ${res.status}`
    );
  }

  return body as T;
}

// ─── Auth endpoints ───────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'team_lead' | 'agent';
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export async function loginWithGoogle(id_token: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ id_token }),
  });
}

export async function getMe(token: string): Promise<{ user: AuthUser }> {
  return request<{ user: AuthUser }>('/api/auth/me', { token });
}
