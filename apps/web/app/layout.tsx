import "./styles.css";
import Link from "next/link";
import type { Metadata } from "next";
import { Cormorant_Garamond, Josefin_Sans, Playfair_Display } from "next/font/google";
import MagneticCursor from "../components/cursor/MagneticCursor";
import SmoothScrollProvider from "../components/layout/SmoothScrollProvider";
import { EditorialChrome } from "./components/editorial-chrome";
import { AuthProvider } from "./components/providers/auth-provider";
import { getBaseUrl } from "./lib/seo-data";

const baseUrl = getBaseUrl();

const displayFont = Playfair_Display({
  subsets: ["latin"],
  weight: ["700", "900"],
  style: ["normal", "italic"],
  variable: "--font-display"
});

const bodyFont = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
  variable: "--font-body"
});

const uiFont = Josefin_Sans({
  subsets: ["latin"],
  weight: ["300", "400"],
  variable: "--font-ui"
});

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "Image Ops | High-craft image processing for marketplace teams",
  description:
    "Editorial-grade image tools for resize, compression, conversion, and background cleanup workflows.",
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
      <body className={`${displayFont.variable} ${bodyFont.variable} ${uiFont.variable}`}>
        <SmoothScrollProvider>
          <EditorialChrome />
          <AuthProvider>
            <main className="site-main">{children}</main>
          </AuthProvider>
          <footer className="editorial-footer">
            <div className="section-inner">
              <span className="site-logo">ImageOps</span>
              <div className="footer-links">
                <Link href="/tools">Tools</Link>
                <Link href="/upload">Upload</Link>
                <Link href="/dashboard">Dashboard</Link>
                <Link href="/billing">Billing</Link>
                <Link href="/guides/prepare-amazon-main-images">Guides</Link>
              </div>
            </div>
          </footer>
          <MagneticCursor />
        </SmoothScrollProvider>
      </body>
    </html>
  );
}
