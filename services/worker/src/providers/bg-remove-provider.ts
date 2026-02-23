import { z } from "zod";

export type BackgroundRemoveResult = {
  bytes: Buffer;
  contentType: string;
};

export interface BackgroundRemoveProvider {
  removeBackground(input: { bytes: Buffer; contentType: string }): Promise<BackgroundRemoveResult>;
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
        lastError = error;
        if (attempt > this.config.maxRetries) {
          break;
        }

        const delay = Math.min(250 * 2 ** (attempt - 1), 1000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error(`Background remove failed after retries: ${String(lastError)}`);
  }
}
