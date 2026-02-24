export type ToolPage = {
  slug: string;
  name: string;
  summary: string;
  keywords: string[];
  faq: { question: string; answer: string }[];
};

export type UseCasePage = {
  slug: string;
  title: string;
  summary: string;
  recommendedTools: string[];
};

export type AudienceIntentPage = {
  audience: string;
  intent: string;
  title: string;
  summary: string;
  recommendedTools: string[];
  faq: { question: string; answer: string }[];
};

export type GuidePage = {
  topic: string;
  title: string;
  summary: string;
  steps: string[];
  relatedTools: string[];
  faq: { question: string; answer: string }[];
};

export type ComparePage = {
  slug: string;
  title: string;
  summary: string;
  winnerWhen: string;
  winnerBut: string;
  decisionChecklist: string[];
};

export const TOOL_PAGES: ToolPage[] = [
  {
    slug: "resize",
    name: "Image Resize",
    summary: "Resize marketplace images without breaking aspect ratio.",
    keywords: ["resize image", "marketplace photo resize", "listing image dimensions"],
    faq: [
      {
        question: "Does resizing change image quality?",
        answer: "Resizing can reduce quality if dimensions are heavily reduced, so we preserve aspect ratio and apply tuned resampling."
      },
      {
        question: "Can I target exact marketplace dimensions?",
        answer: "Yes, set width and height per channel requirement while keeping fit rules for safe cropping behavior."
      }
    ]
  },
  {
    slug: "compress",
    name: "Image Compression",
    summary: "Reduce file size while preserving listing quality.",
    keywords: ["compress image", "reduce image size", "optimize listing photos"],
    faq: [
      {
        question: "Will compression make my product photos blurry?",
        answer: "Compression settings are tuned for listing photos to reduce bytes while preserving visual detail for storefront use."
      },
      {
        question: "How much can file size drop?",
        answer: "Results vary by source image, but JPEG and WEBP assets often shrink significantly without visible degradation."
      }
    ]
  },
  {
    slug: "convert",
    name: "Format Conversion",
    summary: "Convert JPG, PNG, and WEBP for channel compatibility.",
    keywords: ["convert image format", "jpg png webp converter", "marketplace format"],
    faq: [
      {
        question: "When should I use PNG instead of JPG?",
        answer: "Use PNG when transparency or crisp graphic edges matter; use JPG for smaller photo file sizes."
      },
      {
        question: "Does conversion preserve dimensions?",
        answer: "Yes, format conversion keeps pixel dimensions unless resize options are explicitly provided."
      }
    ]
  },
  {
    slug: "background-remove",
    name: "Background Remove",
    summary: "Generate clean product cutouts for catalogs and ads.",
    keywords: ["remove background", "product photo cutout", "transparent background"],
    faq: [
      {
        question: "Why is background removal marked advanced?",
        answer: "Background removal is compute-heavy and receives watermarking on free plans by policy."
      },
      {
        question: "What output format is best for transparent backgrounds?",
        answer: "PNG or WEBP are best for preserving transparency after background removal."
      }
    ]
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

export const AUDIENCE_INTENT_PAGES: AudienceIntentPage[] = [
  {
    audience: "amazon",
    intent: "main-image-compliance",
    title: "Amazon Main Image Compliance Workflow",
    summary: "Prepare white-background, compliant hero images for Amazon listings with minimal rework.",
    recommendedTools: ["background-remove", "resize", "compress"],
    faq: [
      {
        question: "Can this workflow help with white background requirements?",
        answer: "Yes, background removal plus format and size controls are designed for marketplace compliance workflows."
      },
      {
        question: "Do I need all tools for every image?",
        answer: "No, start with background remove only when needed, then resize/compress based on target channel requirements."
      }
    ]
  },
  {
    audience: "etsy",
    intent: "thumbnail-optimization",
    title: "Etsy Thumbnail Optimization Workflow",
    summary: "Create clean Etsy thumbnails that load quickly and keep product focus in search and category grids.",
    recommendedTools: ["resize", "compress", "convert"],
    faq: [
      {
        question: "Why optimize thumbnails separately?",
        answer: "Thumbnail-specific optimization improves listing load speed and visual consistency across catalog pages."
      },
      {
        question: "Which format should I choose?",
        answer: "Use JPG for photographic assets and PNG when transparency is required for graphic overlays."
      }
    ]
  },
  {
    audience: "shopify",
    intent: "ad-creative-prep",
    title: "Shopify Ad Creative Prep Workflow",
    summary: "Produce campaign-ready assets for Shopify ads with clean cutouts and controlled file sizes.",
    recommendedTools: ["background-remove", "compress", "convert"],
    faq: [
      {
        question: "Can I reuse the same output for multiple ad networks?",
        answer: "Yes, convert and compress outputs per network constraints while reusing the same edited source."
      },
      {
        question: "How do I reduce rejection risk?",
        answer: "Run channel-specific dimensions and file-size checks before final upload to each ad platform."
      }
    ]
  }
];

export const GUIDE_PAGES: GuidePage[] = [
  {
    topic: "prepare-amazon-main-images",
    title: "How to Prepare Amazon Main Images",
    summary: "A practical sequence to produce compliant Amazon hero images with minimal manual edits.",
    steps: [
      "Upload the original product image and run background remove for clean cutouts.",
      "Resize to channel-approved dimensions while preserving aspect ratio.",
      "Compress final output to reduce delivery size without obvious quality loss."
    ],
    relatedTools: ["background-remove", "resize", "compress"],
    faq: [
      {
        question: "What order should I run transforms?",
        answer: "Remove background first, then resize, then compress to avoid repeated quality loss."
      }
    ]
  },
  {
    topic: "optimize-etsy-thumbnails",
    title: "How to Optimize Etsy Thumbnails",
    summary: "Generate faster, cleaner Etsy thumbnails that preserve product clarity in search views.",
    steps: [
      "Resize source assets to a consistent thumbnail ratio.",
      "Compress images to meet performance goals.",
      "Convert format only when your target channel benefits from a specific MIME."
    ],
    relatedTools: ["resize", "compress", "convert"],
    faq: [
      {
        question: "Should I use WEBP for Etsy thumbnails?",
        answer: "WEBP often gives strong compression, but confirm marketplace compatibility for your storefront setup."
      }
    ]
  },
  {
    topic: "batch-convert-marketplace-images",
    title: "How to Batch Convert Marketplace Images",
    summary: "Convert and optimize large image sets across channels while keeping output quality predictable.",
    steps: [
      "Define a target format per destination channel.",
      "Convert source images in one consistent run.",
      "Apply compression and final validation before publishing."
    ],
    relatedTools: ["convert", "compress", "resize"],
    faq: [
      {
        question: "Can I convert and resize together?",
        answer: "Yes, but keep the order consistent and verify output dimensions for each channel requirement."
      }
    ]
  }
];

export const COMPARE_PAGES: ComparePage[] = [
  {
    slug: "jpg-vs-png",
    title: "JPG vs PNG for Product Listings",
    summary: "Choose the right format for photos, transparency, and marketplace delivery constraints.",
    winnerWhen: "Use JPG when you need smaller file sizes for photographic images.",
    winnerBut: "Use PNG when transparency or lossless edges are required.",
    decisionChecklist: [
      "Need transparency? Choose PNG.",
      "Need smaller photo bytes? Choose JPG.",
      "Need crisp logos/text overlays? Prefer PNG."
    ]
  },
  {
    slug: "png-vs-webp",
    title: "PNG vs WEBP for Marketplace Assets",
    summary: "Balance transparency support, size efficiency, and compatibility across channels.",
    winnerWhen: "Use WEBP when compatibility allows and you need better compression.",
    winnerBut: "Use PNG when strict compatibility or lossless requirements dominate.",
    decisionChecklist: [
      "Target supports WEBP? Prefer WEBP for lighter payloads.",
      "Target has strict compatibility limits? Use PNG.",
      "Need transparency with smaller bytes? Test WEBP first."
    ]
  },
  {
    slug: "jpeg-vs-webp",
    title: "JPEG vs WEBP for Ecommerce Photos",
    summary: "Compare photo quality and file-size tradeoffs for product gallery images.",
    winnerWhen: "Use WEBP for best size efficiency at similar visual quality.",
    winnerBut: "Use JPEG when compatibility simplicity is more important than byte savings.",
    decisionChecklist: [
      "Need broadest compatibility? JPEG is safest.",
      "Need better compression for large catalogs? WEBP is usually stronger.",
      "Keep exports consistent per destination to reduce QA effort."
    ]
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

export function audienceIntentPath(audience: string, intent: string): string {
  return `/for/${audience}/${intent}`;
}

export function findAudienceIntent(audience: string, intent: string): AudienceIntentPage | null {
  return AUDIENCE_INTENT_PAGES.find((item) => item.audience === audience && item.intent === intent) || null;
}

export function findGuide(topic: string): GuidePage | null {
  return GUIDE_PAGES.find((item) => item.topic === topic) || null;
}

export function findCompare(slug: string): ComparePage | null {
  return COMPARE_PAGES.find((item) => item.slug === slug) || null;
}
