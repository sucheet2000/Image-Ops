import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps an async Express route handler so any rejection is passed to Express error handling.
 *
 * @param fn - The async route handler to wrap; receives `(req, res, next)` and may reject.
 * @returns An Express `RequestHandler` that invokes `fn` and forwards any rejection to `next`.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}
