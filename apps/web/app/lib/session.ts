export type ViewerPlan = "free" | "pro" | "team";
export type ViewerSession = {
  subjectId: string | null;
  plan: ViewerPlan;
  isAuthenticated: boolean;
};

const TOKEN_KEY = "image_ops_api_token";
const PLAN_KEY = "image_ops_subject_plan";

function parseBase64Url(input: string): string | null {
  try {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    return atob(`${normalized}${pad}`);
  } catch {
    return null;
  }
}

function parseClaimsFromToken(token: string): { sub?: string; plan?: ViewerPlan } | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  const payloadRaw = parseBase64Url(parts[1] || "");
  if (!payloadRaw) {
    return null;
  }

  try {
    const payload = JSON.parse(payloadRaw) as { sub?: string; plan?: string };
    const plan = payload.plan === "free" || payload.plan === "pro" || payload.plan === "team"
      ? payload.plan
      : undefined;
    const sub = typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : undefined;
    return { sub, plan };
  } catch {
    return null;
  }
}

function readApiToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

export function getViewerSession(): ViewerSession {
  if (typeof window === "undefined") {
    return { subjectId: null, plan: "free", isAuthenticated: false };
  }

  const explicitPlan = localStorage.getItem(PLAN_KEY);
  const token = readApiToken();
  if (!token) {
    const plan = explicitPlan === "free" || explicitPlan === "pro" || explicitPlan === "team" ? explicitPlan : "free";
    return { subjectId: null, plan, isAuthenticated: false };
  }

  const claims = parseClaimsFromToken(token);
  const plan = claims?.plan || (explicitPlan === "free" || explicitPlan === "pro" || explicitPlan === "team" ? explicitPlan : "free");
  return {
    subjectId: claims?.sub || null,
    plan,
    isAuthenticated: Boolean(claims?.sub)
  };
}

export function getViewerPlan(): ViewerPlan {
  return getViewerSession().plan;
}
