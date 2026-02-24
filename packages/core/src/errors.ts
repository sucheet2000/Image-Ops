export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "AppError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class QuotaExceededError extends AppError {
  constructor() {
    super("QUOTA_EXCEEDED", 429, "Image quota exceeded for this period");
  }
}

export class AuthError extends AppError {
  constructor(message = "Unauthorized") {
    super("UNAUTHORIZED", 401, message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super("NOT_FOUND", 404, `${resource} not found`);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super("VALIDATION_ERROR", 400, message);
  }
}

export class BillingError extends AppError {
  constructor(message: string) {
    super("BILLING_ERROR", 402, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", 409, message);
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super("RATE_LIMITED", 429, "Too many requests. Please wait and try again.");
  }
}
