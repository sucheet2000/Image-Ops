import { z } from "zod";
import { AppError } from "@imageops/core";
import CircuitBreaker from "opossum";

export type BackgroundRemoveResult = {
  bytes: Buffer;
  contentType: string;
};

export interface BackgroundRemoveProvider {
  removeBackground(input: { bytes: Buffer; contentType: string }): Promise<BackgroundRemoveResult>;
}

export class NonRetryableProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableProviderError";
  }
}

const responseSchema = z.object({
  contentType: z.string().min(1)
});

export class HttpBackgroundRemoveProvider implements BackgroundRemoveProvider {
  private readonly breaker: CircuitBreaker<[Buffer, string], BackgroundRemoveResult>;

  constructor(
    private readonly config: {
      endpointUrl: string;
      apiKey?: string;
      timeoutMs: number;
      maxRetries: number;
      backoffBaseMs?: number;
      backoffMaxMs?: number;
      onRetry?: (payload: { attempt: number; maxRetries: number; reason: string }) => void;
      onCircuitStateChange?: (state: "open" | "halfOpen" | "close") => void;
    }
  ) {
    this.breaker = new CircuitBreaker<[Buffer, string], BackgroundRemoveResult>(
      async (bytes, contentType) => this.callProvider(bytes, contentType),
      {
        timeout: config.timeoutMs,
        errorThresholdPercentage: 50,
        resetTimeout: 60000,
        volumeThreshold: 5
      }
    );
    this.breaker.on("open", () => this.config.onCircuitStateChange?.("open"));
    this.breaker.on("halfOpen", () => this.config.onCircuitStateChange?.("halfOpen"));
    this.breaker.on("close", () => this.config.onCircuitStateChange?.("close"));
  }

  private async callProvider(bytes: Buffer, contentType: string): Promise<BackgroundRemoveResult> {
    const response = await fetch(this.config.endpointUrl, {
      method: "POST",
      headers: {
        "content-type": contentType,
        ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {})
      },
      body: bytes,
      signal: AbortSignal.timeout(this.config.timeoutMs)
    });

    if (!response.ok) {
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new NonRetryableProviderError(`Background remove provider rejected request with status ${response.status}`);
      }
      throw new AppError(
        "BACKGROUND_REMOVE_PROVIDER_ERROR",
        502,
        `Background remove provider returned status ${response.status}`
      );
    }

    const parsedContentType = response.headers.get("content-type") || "image/png";
    const checked = responseSchema.parse({ contentType: parsedContentType });
    const arrayBuffer = await response.arrayBuffer();

    return {
      bytes: Buffer.from(arrayBuffer),
      contentType: checked.contentType
    };
  }

  async removeBackground(input: { bytes: Buffer; contentType: string }): Promise<BackgroundRemoveResult> {
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt <= this.config.maxRetries) {
      attempt += 1;
      try {
        return await this.breaker.fire(input.bytes, input.contentType);
      } catch (error) {
        if (error instanceof NonRetryableProviderError) {
          throw error;
        }

        lastError = error;
        if (attempt > this.config.maxRetries) {
          break;
        }

        const baseDelay = this.config.backoffBaseMs ?? 250;
        const maxDelay = this.config.backoffMaxMs ?? 1000;
        const delay = Math.min(baseDelay * 2 ** (attempt - 1), maxDelay);
        this.config.onRetry?.({
          attempt,
          maxRetries: this.config.maxRetries,
          reason: error instanceof Error ? error.message : String(error)
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new AppError("BACKGROUND_REMOVE_FAILED", 502, `Background remove failed after retries: ${String(lastError)}`);
  }
}
