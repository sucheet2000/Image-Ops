export type ViewerPlan = "free" | "pro" | "team";

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

function parsePlanFromToken(token: string): ViewerPlan | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  const payloadRaw = parseBase64Url(parts[1] || "");
  if (!payloadRaw) {
    return null;
  }

  try {
    const payload = JSON.parse(payloadRaw) as { plan?: string };
    if (payload.plan === "free" || payload.plan === "pro" || payload.plan === "team") {
      return payload.plan;
    }
    return null;
  } catch {
    return null;
  }
}

export function getViewerPlan(): ViewerPlan {
  if (typeof window === "undefined") {
    return "free";
  }

  const explicitPlan = localStorage.getItem(PLAN_KEY);
  if (explicitPlan === "free" || explicitPlan === "pro" || explicitPlan === "team") {
    return explicitPlan;
  }

  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    return "free";
  }

  return parsePlanFromToken(token) || "free";
}
