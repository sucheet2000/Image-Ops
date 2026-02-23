"use client";

import { useEffect, useMemo, useState } from "react";

type GoogleCredentialResponse = {
  credential?: string;
};

type AuthPayload = {
  token: string;
  tokenType: string;
  expiresIn: number;
  profile: {
    subjectId: string;
    plan: string;
  };
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

const TOKEN_KEY = "image_ops_api_token";

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
}

function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  document.cookie = `image_ops_api_token=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
}

export function GoogleAuthPanel() {
  const [message, setMessage] = useState("Sign in with Google to start secure API sessions.");
  const clientId = useMemo(() => process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "", []);

  useEffect(() => {
    if (!clientId) {
      setMessage("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID");
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;

    script.onload = () => {
      const googleId = window.google?.accounts?.id;
      if (!googleId) {
        setMessage("Google SDK failed to initialize.");
        return;
      }

      googleId.initialize({
        client_id: clientId,
        callback: async (response: GoogleCredentialResponse) => {
          if (!response.credential) {
            setMessage("Missing Google credential.");
            return;
          }

          try {
            const authResponse = await fetch(`${getApiBaseUrl()}/api/auth/google`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ idToken: response.credential })
            });

            if (!authResponse.ok) {
              setMessage("Google authentication failed.");
              return;
            }

            const payload = (await authResponse.json()) as AuthPayload;
            setToken(payload.token);
            setMessage(`Signed in as ${payload.profile.subjectId} (${payload.profile.plan}).`);
          } catch (error) {
            setMessage(`Auth request failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      });

      const button = document.getElementById("google-signin-button");
      if (button) {
        googleId.renderButton(button, {
          theme: "outline",
          size: "large",
          text: "continue_with"
        });
      }

      googleId.prompt();
    };

    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, [clientId]);

  return (
    <section className="card">
      <h2>Google Login</h2>
      <div id="google-signin-button" style={{ minHeight: 44 }} />
      <p>{message}</p>
    </section>
  );
}
