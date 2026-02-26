'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getApiBaseUrl, setApiToken } from '../lib/api-client';
import { setViewerDisplayName, setViewerPlan, setViewerSubjectId } from '../lib/session';

type GoogleCredentialResponse = {
  credential?: string;
};

type AuthPayload = {
  token: string;
  profile: {
    subjectId: string;
    plan: string;
  };
};

type GoogleIdTokenClaims = {
  name?: string;
  email?: string;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
          }) => void;
          renderButton: (element: HTMLElement, config: Record<string, unknown>) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export function GoogleAuthPanel() {
  const [message, setMessage] = useState('Sign in with Google to start secure API sessions.');
  const clientId = useMemo(() => process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '', []);
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  function parseGoogleClaims(idToken: string): GoogleIdTokenClaims | null {
    try {
      const payloadSegment = idToken.split('.')[1] || '';
      const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
      const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
      const decoded = atob(`${normalized}${padding}`);
      return JSON.parse(decoded) as GoogleIdTokenClaims;
    } catch {
      return null;
    }
  }

  function setToken(token: string): void {
    setApiToken(token);

    const isLocalHost =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const securePart = isLocalHost ? '' : '; Secure';
    document.cookie = `image_ops_api_token=${encodeURIComponent(token)}; path=/; max-age=3600; SameSite=Lax${securePart}`;
  }

  useEffect(() => {
    if (!clientId) {
      setMessage('Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID');
      return;
    }

    let script: HTMLScriptElement | null = null;
    let cancelled = false;

    const initializeGoogle = () => {
      if (cancelled) {
        return;
      }
      const googleId = window.google?.accounts?.id;
      if (!googleId) {
        setMessage('Google SDK failed to initialize.');
        return;
      }

      googleId.initialize({
        client_id: clientId,
        callback: async (response: GoogleCredentialResponse) => {
          if (!response.credential) {
            setMessage('Missing Google credential.');
            return;
          }

          try {
            const authResponse = await fetch(`${getApiBaseUrl()}/api/auth/google`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ idToken: response.credential }),
            });

            if (!authResponse.ok) {
              setMessage('Google authentication failed.');
              return;
            }

            const payload = (await authResponse.json()) as AuthPayload;
            setToken(payload.token);
            setViewerSubjectId(payload.profile.subjectId);
            if (
              payload.profile.plan === 'free' ||
              payload.profile.plan === 'pro' ||
              payload.profile.plan === 'team'
            ) {
              setViewerPlan(payload.profile.plan);
            }
            const claims = parseGoogleClaims(response.credential);
            let resolvedName: string | null = null;
            if (claims?.name) {
              resolvedName = claims.name;
              setViewerDisplayName(claims.name);
            } else if (claims?.email) {
              const localPart = claims.email.split('@')[0]?.trim();
              if (localPart) {
                const formatted = localPart
                  .split(/[._-]+/)
                  .filter(Boolean)
                  .map((word) => word[0]!.toUpperCase() + word.slice(1))
                  .join(' ');
                if (formatted) {
                  resolvedName = formatted;
                  setViewerDisplayName(formatted);
                }
              }
            }
            setMessage(
              `Signed in as ${resolvedName || payload.profile.subjectId} (${payload.profile.plan}).`
            );
            const nextPath = searchParams.get('next');
            const safeNextPath =
              nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : null;
            router.replace(safeNextPath || '/dashboard');
          } catch (error) {
            setMessage(
              `Auth request failed: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        },
      });

      if (buttonRef.current) {
        googleId.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
        });
      }

      googleId.prompt();
    };

    if (window.google?.accounts?.id) {
      initializeGoogle();
      return () => {
        cancelled = true;
      };
    }

    const existing = document.getElementById('google-identity-sdk');
    if (existing instanceof HTMLScriptElement) {
      script = existing;
      existing.addEventListener('load', initializeGoogle, { once: true });
    } else {
      script = document.createElement('script');
      script.id = 'google-identity-sdk';
      script.dataset.imageOpsManaged = 'true';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.addEventListener('load', initializeGoogle, { once: true });
      script.addEventListener(
        'error',
        () => {
          if (!cancelled) {
            setMessage('Failed to load Google SDK.');
          }
        },
        { once: true }
      );
      document.body.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (script && document.body.contains(script) && script.dataset.imageOpsManaged === 'true') {
        document.body.removeChild(script);
      }
    };
  }, [clientId, router, searchParams]);

  return (
    <section className="editorial-card reveal-el" data-delay="180">
      <span className="section-label">Google Login</span>
      <h2 style={{ marginTop: '0.65rem' }}>Secure sign-in</h2>
      <div ref={buttonRef} style={{ marginTop: '0.9rem', minHeight: 44 }} />
      <p style={{ marginTop: '0.85rem', color: 'var(--muted)' }}>{message}</p>
    </section>
  );
}
