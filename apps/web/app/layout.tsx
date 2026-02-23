import "./styles.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Image Ops | Fast image tools for sellers",
  description: "Resize, compress, and optimize listing images with privacy-safe processing."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
