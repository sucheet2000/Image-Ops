import type { ImagePlan } from "@image-ops/core";
import type { ApiConfig } from "../config";

export type QuotaPolicy = {
  limit: number;
  windowHours: number;
};

export function quotaPolicyForPlan(config: ApiConfig, plan: ImagePlan): QuotaPolicy {
  if (plan === "pro") {
    return {
      limit: config.proPlanLimit,
      windowHours: config.proPlanWindowHours
    };
  }

  if (plan === "team") {
    return {
      limit: config.teamPlanLimit,
      windowHours: config.teamPlanWindowHours
    };
  }

  return {
    limit: config.freePlanLimit,
    windowHours: config.freePlanWindowHours
  };
}
