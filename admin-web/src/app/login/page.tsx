'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginWithGoogle, ApiError } from '@/lib/api';
import { saveSession, isAuthenticated } from '@/lib/auth';

declare global {
  interface Window {
    google: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          renderButton: (
            element: HTMLElement,
            config: {
              theme: string;
              size: string;
              shape: string;
              width: number;
            }
          ) => void;
        };
      };
    };
  }
}

type Status = 'idle' | 'loading' | 'error';

export default function LoginPage() {
  const router = useRouter();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated()) {
      router.replace('/dashboard');
    }
  }, [router]);

  // Initialise Google Identity Services once the script is loaded
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setStatus('error');
      setErrorMessage('Google Client ID is not configured. Check your .env.local file.');
      return;
    }

    function initGSI() {
      if (!window.google) return;

      window.google.accounts.id.initialize({
        client_id: clientId!,
        callback: handleGoogleSignIn,
        use_fedcm_for_prompt: true,
      });

      if (buttonRef.current) {
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          width: 300,
        });
      }
    }

    // GSI script might already be loaded or might fire onload
    if (window.google) {
      initGSI();
    } else {
      const script = document.querySelector('script[src*="gsi/client"]');
      if (script) script.addEventListener('load', initGSI);
    }
  }, []);

  async function handleGoogleSignIn(response: { credential: string }) {
    setStatus('loading');
    setErrorMessage('');

    try {
      const result = await loginWithGoogle(response.credential);
      saveSession(result.token, result.user);
      router.replace('/dashboard');
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Something went wrong. Please try again.';
      setStatus('error');
      setErrorMessage(message);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">
      {/* Background glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-indigo-600/20 blur-[120px]" />
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm">
        {/* Logo + wordmark */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 rounded-2xl gradient-brand flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/30">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-white">
              <path
                d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
                fill="currentColor"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">CallOps</h1>
          <p className="text-sm text-gray-400 mt-1">Admin Dashboard</p>
        </div>

        {/* Sign-in box */}
        <div className="glass rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-white text-center mb-1">
            Welcome back
          </h2>
          <p className="text-sm text-gray-400 text-center mb-8">
            Sign in with your Google account to continue
          </p>

          {/* Loading state */}
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-400">Signing you in…</p>
            </div>
          )}

          {/* Google Sign-In button */}
          {status !== 'loading' && (
            <div className="flex justify-center">
              <div ref={buttonRef} id="google-signin-button" />
            </div>
          )}

          {/* Error state */}
          {status === 'error' && errorMessage && (
            <div
              role="alert"
              className="mt-5 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 text-center"
            >
              {errorMessage}
            </div>
          )}
        </div>

        <p className="text-xs text-gray-600 text-center mt-6">
          CallOps · Restricted access
        </p>
      </div>
    </div>
  );
}
