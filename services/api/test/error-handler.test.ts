import type { NextFunction, Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as logModule from "../src/lib/log";
import { errorHandler } from "../src/server";

type MockResponse = Pick<Response, "headersSent" | "status" | "json">;

function createMockResponse(headersSent: boolean): MockResponse {
  return {
    headersSent,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("errorHandler", () => {
  it("returns a generic 500 response and logs full error details", () => {
    const logSpy = vi.spyOn(logModule, "logError").mockImplementation(() => {});
    const response = createMockResponse(false);
    const next = vi.fn() as NextFunction;
    const error = new Error("sensitive failure details");

    errorHandler(error, {} as Request, response as Response, next);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred."
    });
    expect(logSpy).toHaveBeenCalledWith(
      "api.error",
      expect.objectContaining({
        error: expect.objectContaining({
          name: "Error",
          message: "sensitive failure details",
          stack: expect.any(String)
        })
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("delegates to next when headers are already sent", () => {
    const logSpy = vi.spyOn(logModule, "logError").mockImplementation(() => {});
    const response = createMockResponse(true);
    const next = vi.fn() as NextFunction;
    const error = new Error("late failure");

    errorHandler(error, {} as Request, response as Response, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("logs non-Error values safely", () => {
    const logSpy = vi.spyOn(logModule, "logError").mockImplementation(() => {});
    const response = createMockResponse(false);
    const next = vi.fn() as NextFunction;
    const nonError = { reason: "boom" };

    errorHandler(nonError, {} as Request, response as Response, next);

    expect(logSpy).toHaveBeenCalledWith("api.error", { error: { value: nonError } });
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred."
    });
    expect(next).not.toHaveBeenCalled();
  });
});
