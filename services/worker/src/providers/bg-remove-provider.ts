import { z } from "zod";

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
  constructor(
    private readonly config: {
      endpointUrl: string;
      apiKey?: string;
      timeoutMs: number;
      maxRetries: number;
      backoffBaseMs?: number;
      backoffMaxMs?: number;
      onRetry?: (payload: { attempt: number; maxRetries: number; reason: string }) => void;
    }
  ) {}

  async removeBackground(input: { bytes: Buffer; contentType: string }): Promise<BackgroundRemoveResult> {
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt <= this.config.maxRetries) {
      attempt += 1;
      try {
        const response = await fetch(this.config.endpointUrl, {
          method: "POST",
          headers: {
            "content-type": input.contentType,
            ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {})
          },
          body: input.bytes,
          signal: AbortSignal.timeout(this.config.timeoutMs)
        });

        if (!response.ok) {
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            throw new NonRetryableProviderError(`Background remove provider rejected request with status ${response.status}`);
          }
          throw new Error(`Background remove provider returned status ${response.status}`);
        }

        const contentType = response.headers.get("content-type") || "image/png";
        const checked = responseSchema.parse({ contentType });
        const arrayBuffer = await response.arrayBuffer();

        return {
          bytes: Buffer.from(arrayBuffer),
          contentType: checked.contentType
        };
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

    throw new Error(`Background remove failed after retries: ${String(lastError)}`);
  }
}
