import { describe, expect, it } from "vitest";
import { loadApiConfig } from "../src/config";

function baseEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    WEB_ORIGIN: "http://localhost:3000",
    S3_BUCKET: "image-ops-temp",
    S3_ACCESS_KEY: "test-key",
    S3_SECRET_KEY: "test-secret"
  };
}

describe("loadApiConfig production safeguards", () => {
  it("rejects auth placeholder defaults when API_AUTH_REQUIRED=true", () => {
    expect(() =>
      loadApiConfig({
        ...baseEnv(),
        API_AUTH_REQUIRED: "true"
      })
    ).toThrow(/AUTH_TOKEN_SECRET must not use the development default when API_AUTH_REQUIRED=true/i);
  });

  it("accepts explicit auth values when API_AUTH_REQUIRED=true", () => {
    const config = loadApiConfig({
      ...baseEnv(),
      API_AUTH_REQUIRED: "true",
      GOOGLE_CLIENT_ID: "google-client-prod-1",
      AUTH_TOKEN_SECRET: "auth-token-secret-prod-1"
    });

    expect(config.apiAuthRequired).toBe(true);
    expect(config.googleClientId).toBe("google-client-prod-1");
  });

  it("rejects development defaults in production", () => {
    expect(() =>
      loadApiConfig({
        ...baseEnv(),
        NODE_ENV: "production",
        JOB_REPO_DRIVER: "postgres",
        POSTGRES_URL: "postgres://user:pass@localhost:5432/image_ops",
        BILLING_PROVIDER_SECRET: "prod-provider-secret-1",
        BILLING_WEBHOOK_SECRET: "prod-webhook-secret-1"
      })
    ).toThrow(/AUTH_TOKEN_SECRET must not use the development default in production/i);
  });

  it("accepts explicit production-safe values", () => {
    const config = loadApiConfig({
      ...baseEnv(),
      NODE_ENV: "production",
      JOB_REPO_DRIVER: "postgres",
      POSTGRES_URL: "postgres://user:pass@localhost:5432/image_ops",
      AUTH_TOKEN_SECRET: "prod-auth-token-secret-1",
      BILLING_PROVIDER_SECRET: "prod-provider-secret-1",
      BILLING_WEBHOOK_SECRET: "prod-webhook-secret-1"
    });

    expect(config.nodeEnv).toBe("production");
    expect(config.jobRepoDriver).toBe("postgres");
  });
});
