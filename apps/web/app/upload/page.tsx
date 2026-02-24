import type { Metadata } from "next";
import { UploadShell } from "../components/upload-shell";

export const metadata: Metadata = {
  title: "Upload Studio | Image Ops",
  description: "Run upload, processing, download, and cleanup workflows in one editor-style workspace."
};

export default function UploadPage() {
  return <UploadShell />;
}
