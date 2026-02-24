import type { Metadata } from "next";
import { DashboardShell } from "../components/dashboard-shell";

export const metadata: Metadata = {
  title: "Dashboard | Image Ops",
  description: "Operational overview for quota usage and recent processing runs."
};

export default function DashboardPage() {
  return <DashboardShell />;
}
