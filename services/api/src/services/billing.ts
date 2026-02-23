import { createHmac, timingSafeEqual } from "node:crypto";
import { ulid } from "ulid";

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

export interface BillingService {
  createCheckoutSession(input: BillingCheckoutInput): Promise<BillingCheckoutOutput>;
  signWebhookPayload(payload: string): string;
  verifyWebhookSignature(payload: string, signature: string): boolean;
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
    if (signature.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"));
  }
}
