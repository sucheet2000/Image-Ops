export type ToolPage = {
  slug: string;
  name: string;
  summary: string;
  keywords: string[];
};

export type UseCasePage = {
  slug: string;
  title: string;
  summary: string;
  recommendedTools: string[];
};

export const TOOL_PAGES: ToolPage[] = [
  {
    slug: "resize",
    name: "Image Resize",
    summary: "Resize marketplace images without breaking aspect ratio.",
    keywords: ["resize image", "marketplace photo resize", "listing image dimensions"]
  },
  {
    slug: "compress",
    name: "Image Compression",
    summary: "Reduce file size while preserving listing quality.",
    keywords: ["compress image", "reduce image size", "optimize listing photos"]
  },
  {
    slug: "convert",
    name: "Format Conversion",
    summary: "Convert JPG, PNG, and WEBP for channel compatibility.",
    keywords: ["convert image format", "jpg png webp converter", "marketplace format"]
  },
  {
    slug: "background-remove",
    name: "Background Remove",
    summary: "Generate clean product cutouts for catalogs and ads.",
    keywords: ["remove background", "product photo cutout", "transparent background"]
  }
];

export const USE_CASE_PAGES: UseCasePage[] = [
  {
    slug: "amazon-listings",
    title: "Amazon Listing Images",
    summary: "Prepare compliant primary and gallery images for Amazon product pages.",
    recommendedTools: ["resize", "compress", "background-remove"]
  },
  {
    slug: "etsy-shop-assets",
    title: "Etsy Shop Assets",
    summary: "Create lightweight storefront visuals and product thumbnails for Etsy.",
    recommendedTools: ["resize", "compress", "convert"]
  },
  {
    slug: "social-ad-creatives",
    title: "Social Ad Creatives",
    summary: "Ship ad-ready images with optimized size and transparent backgrounds.",
    recommendedTools: ["background-remove", "compress", "convert"]
  }
];

export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

export function findTool(slug: string): ToolPage | null {
  return TOOL_PAGES.find((item) => item.slug === slug) || null;
}

export function findUseCase(slug: string): UseCasePage | null {
  return USE_CASE_PAGES.find((item) => item.slug === slug) || null;
}
