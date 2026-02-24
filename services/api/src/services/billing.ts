import { createHmac, timingSafeEqual } from "node:crypto";
import { BillingError } from "@imageops/core";
import { ulid } from "ulid";
import { z } from "zod";

export type BillingCheckoutInput = {
  subjectId: string;
  plan: "pro" | "team";
  successUrl: string;
  cancelUrl: string;
  now: Date;
  ttlSeconds: number;
};

export type BillingCheckoutOutput = {
  providerSessionId: string;
  checkoutUrl: string;
  expiresAt: string;
};

export type ParsedBillingWebhook = {
  eventId: string;
  checkoutSessionId: string;
  subjectId: string;
  plan: "pro" | "team";
  status: "paid" | "canceled" | "expired";
};

export interface BillingService {
  createCheckoutSession(input: BillingCheckoutInput): Promise<BillingCheckoutOutput>;
  signWebhookPayload(payload: string): string;
  verifyWebhookSignature(payload: string, signature: string): boolean;
  parseWebhookPayload(payload: string): ParsedBillingWebhook | null;
}

const hmacWebhookSchema = z.object({
  eventId: z.string().min(1),
  checkoutSessionId: z.string().min(1),
  subjectId: z.string().min(1),
  plan: z.enum(["pro", "team"]),
  status: z.enum(["paid", "canceled", "expired"])
});

const STRIPE_WEBHOOK_STATUS_BY_TYPE: Record<string, ParsedBillingWebhook["status"]> = {
  "checkout.session.completed": "paid",
  "checkout.session.expired": "expired",
  "checkout.session.async_payment_failed": "canceled"
};

function safeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export class HmacBillingService implements BillingService {
  private readonly publicBaseUrl: string;
  private readonly providerSecret: string;
  private readonly webhookSecret: string;

  constructor(input: { publicBaseUrl: string; providerSecret: string; webhookSecret: string }) {
    this.publicBaseUrl = input.publicBaseUrl;
    this.providerSecret = input.providerSecret;
    this.webhookSecret = input.webhookSecret;
  }

  async createCheckoutSession(input: BillingCheckoutInput): Promise<BillingCheckoutOutput> {
    const providerSessionId = `chk_${ulid(input.now.getTime())}`;
    const expiresAt = new Date(input.now.getTime() + input.ttlSeconds * 1000).toISOString();
    const tokenPayload = `${providerSessionId}:${input.subjectId}:${input.plan}:${expiresAt}`;
    const token = createHmac("sha256", this.providerSecret).update(tokenPayload).digest("hex");

    const url = new URL(`${this.publicBaseUrl.replace(/\/$/, "")}/billing/checkout`);
    url.searchParams.set("session", providerSessionId);
    url.searchParams.set("subject", input.subjectId);
    url.searchParams.set("plan", input.plan);
    url.searchParams.set("token", token);
    url.searchParams.set("success_url", input.successUrl);
    url.searchParams.set("cancel_url", input.cancelUrl);

    return {
      providerSessionId,
      checkoutUrl: url.toString(),
      expiresAt
    };
  }

  signWebhookPayload(payload: string): string {
    return createHmac("sha256", this.webhookSecret).update(payload).digest("hex");
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    const expected = this.signWebhookPayload(payload);
    return safeEqualHex(signature, expected);
  }

  parseWebhookPayload(payload: string): ParsedBillingWebhook | null {
    const parsed = hmacWebhookSchema.safeParse(JSON.parse(payload));
    if (!parsed.success) {
      return null;
    }

    return {
      eventId: parsed.data.eventId,
      checkoutSessionId: parsed.data.checkoutSessionId,
      subjectId: parsed.data.subjectId,
      plan: parsed.data.plan,
      status: parsed.data.status
    };
  }
}

export class StripeBillingService implements BillingService {
  private readonly secretKey: string;
  private readonly webhookSecret: string;
  private readonly webhookToleranceSeconds: number;
  private readonly priceIdByPlan: Record<"pro" | "team", string>;
  private readonly fetchImpl: typeof fetch;
  private readonly nowProvider: () => number;

  constructor(input: {
    secretKey: string;
    webhookSecret: string;
    webhookToleranceSeconds?: number;
    priceIdByPlan: Record<"pro" | "team", string>;
    fetchImpl?: typeof fetch;
    nowProvider?: () => number;
  }) {
    this.secretKey = input.secretKey;
    this.webhookSecret = input.webhookSecret;
    this.webhookToleranceSeconds = input.webhookToleranceSeconds ?? 300;
    this.priceIdByPlan = input.priceIdByPlan;
    this.fetchImpl = input.fetchImpl || fetch;
    this.nowProvider = input.nowProvider || (() => Date.now());
  }

  async createCheckoutSession(input: BillingCheckoutInput): Promise<BillingCheckoutOutput> {
    const form = new URLSearchParams();
    form.set("mode", "subscription");
    form.set("success_url", input.successUrl);
    form.set("cancel_url", input.cancelUrl);
    form.set("line_items[0][price]", this.priceIdByPlan[input.plan]);
    form.set("line_items[0][quantity]", "1");
    form.set("metadata[subjectId]", input.subjectId);
    form.set("metadata[plan]", input.plan);

    const response = await this.fetchImpl("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    });

    if (!response.ok) {
      const body = await response.text();
      throw new BillingError(`Stripe checkout session failed: ${response.status} ${body}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const sessionId = String(payload.id || "").trim();
    const checkoutUrl = String(payload.url || "").trim();
    if (!sessionId || !checkoutUrl) {
      throw new BillingError("Stripe checkout response missing id/url.");
    }

    const expiresAtUnix = Number(payload.expires_at || 0);
    const expiresAt = Number.isFinite(expiresAtUnix) && expiresAtUnix > 0
      ? new Date(expiresAtUnix * 1000).toISOString()
      : new Date(input.now.getTime() + input.ttlSeconds * 1000).toISOString();

    return {
      providerSessionId: sessionId,
      checkoutUrl,
      expiresAt
    };
  }

  signWebhookPayload(payload: string): string {
    const timestamp = Math.floor(this.nowProvider() / 1000);
    const signed = createHmac("sha256", this.webhookSecret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");
    return `t=${timestamp},v1=${signed}`;
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    const pieces = signature.split(",").map((part) => part.trim());
    const timestampPart = pieces.find((part) => part.startsWith("t="));
    const signatures = pieces.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));

    if (!timestampPart || signatures.length === 0) {
      return false;
    }

    const timestamp = timestampPart.slice(2);
    if (!/^\d+$/.test(timestamp)) {
      return false;
    }
    const timestampSeconds = Number.parseInt(timestamp, 10);
    const nowSeconds = Math.floor(this.nowProvider() / 1000);
    if (Math.abs(nowSeconds - timestampSeconds) > this.webhookToleranceSeconds) {
      return false;
    }

    const expected = createHmac("sha256", this.webhookSecret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");

    return signatures.some((candidate) => safeEqualHex(candidate, expected));
  }

  parseWebhookPayload(payload: string): ParsedBillingWebhook | null {
    const raw = JSON.parse(payload) as Record<string, unknown>;
    const eventId = String(raw.id || "").trim();
    const eventType = String(raw.type || "").trim();
    const status = STRIPE_WEBHOOK_STATUS_BY_TYPE[eventType];

    if (!eventId || !status) {
      return null;
    }

    const dataObject = raw.data && typeof raw.data === "object"
      ? (raw.data as { object?: Record<string, unknown> }).object
      : undefined;
    if (!dataObject || typeof dataObject !== "object") {
      return null;
    }

    const checkoutSessionId = String(dataObject.id || "").trim();
    const metadata = dataObject.metadata && typeof dataObject.metadata === "object"
      ? (dataObject.metadata as Record<string, unknown>)
      : {};

    const subjectId = String(metadata.subjectId || metadata.subject_id || "").trim();
    const plan = String(metadata.plan || "").trim();

    if (!checkoutSessionId || !subjectId || (plan !== "pro" && plan !== "team")) {
      return null;
    }

    return {
      eventId,
      checkoutSessionId,
      subjectId,
      plan,
      status
    };
  }
}
