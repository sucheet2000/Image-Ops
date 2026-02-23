import "./styles.css";
import type { Metadata } from "next";
import { getBaseUrl } from "./lib/seo-data";

const baseUrl = getBaseUrl();

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "Image Ops | Fast image tools for sellers",
  description: "Resize, compress, remove backgrounds, and optimize listing images with privacy-safe processing.",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "Image Ops",
    description: "Marketplace image optimization platform",
    type: "website",
    url: baseUrl
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
