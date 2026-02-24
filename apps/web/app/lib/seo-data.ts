export const TOOL_SLUGS = ["resize", "compress", "convert", "background-remove"] as const;
export type ToolSlug = (typeof TOOL_SLUGS)[number];

export type ToolPage = {
  slug: ToolSlug;
  name: string;
  summary: string;
  whenToUse?: string;
  keywords: string[];
  faq: { question: string; answer: string }[];
};

export type UseCasePage = {
  slug: string;
  title: string;
  summary: string;
  recommendedTools: ToolSlug[];
  relatedGuides: { title: string; href: string }[];
  relatedComparisons: { title: string; href: string }[];
};

export type AudienceIntentPage = {
  audience: string;
  intent: string;
  title: string;
  summary: string;
  recommendedTools: ToolSlug[];
  faq: { question: string; answer: string }[];
};

export type GuidePage = {
  topic: string;
  title: string;
  summary: string;
  steps: string[];
  relatedTools: ToolSlug[];
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

const DEFAULT_RELATED_GUIDES = [
  { title: "Prepare Amazon Main Images", href: "/guides/prepare-amazon-main-images" },
  { title: "Optimize Etsy Thumbnails", href: "/guides/optimize-etsy-thumbnails" },
  { title: "Batch Convert Marketplace Images", href: "/guides/batch-convert-marketplace-images" }
];

const DEFAULT_RELATED_COMPARISONS = [
  { title: "JPG vs PNG", href: "/compare/jpg-vs-png" },
  { title: "PNG vs WEBP", href: "/compare/png-vs-webp" },
  { title: "JPEG vs WEBP", href: "/compare/jpeg-vs-webp" }
];

export const TOOL_PAGES: ToolPage[] = [
  {
    slug: "resize",
    name: "Image Resize",
    summary: "Resize marketplace images without breaking aspect ratio.",
    whenToUse: "Use this when a channel requires exact dimensions or consistent gallery framing.",
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
    whenToUse: "Use this before publishing when storefront speed or upload limits are your primary constraint.",
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
    whenToUse: "Use this when your destination platform requires a specific format or transparency behavior.",
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
    whenToUse: "Use this for hero images and ads where subject isolation improves clarity and compliance.",
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
    recommendedTools: ["resize", "compress", "background-remove"],
    relatedGuides: DEFAULT_RELATED_GUIDES,
    relatedComparisons: DEFAULT_RELATED_COMPARISONS
  },
  {
    slug: "etsy-shop-assets",
    title: "Etsy Shop Assets",
    summary: "Create lightweight storefront visuals and product thumbnails for Etsy.",
    recommendedTools: ["resize", "compress", "convert"],
    relatedGuides: DEFAULT_RELATED_GUIDES,
    relatedComparisons: DEFAULT_RELATED_COMPARISONS
  },
  {
    slug: "social-ad-creatives",
    title: "Social Ad Creatives",
    summary: "Ship ad-ready images with optimized size and transparent backgrounds.",
    recommendedTools: ["background-remove", "compress", "convert"],
    relatedGuides: DEFAULT_RELATED_GUIDES,
    relatedComparisons: DEFAULT_RELATED_COMPARISONS
  },
  {
    slug: "shopify-pdp-images",
    title: "Shopify PDP Image Sets",
    summary: "Generate high-converting product page image sets for Shopify catalogs.",
    recommendedTools: ["resize", "compress", "convert"],
    relatedGuides: DEFAULT_RELATED_GUIDES,
    relatedComparisons: DEFAULT_RELATED_COMPARISONS
  },
  {
    slug: "ebay-fast-relist",
    title: "eBay Relist Refresh",
    summary: "Refresh stale eBay listings with updated image crops and optimized payload sizes.",
    recommendedTools: ["resize", "compress", "background-remove"],
    relatedGuides: DEFAULT_RELATED_GUIDES,
    relatedComparisons: DEFAULT_RELATED_COMPARISONS
  },
  {
    slug: "walmart-catalog-images",
    title: "Walmart Catalog Images",
    summary: "Standardize Walmart-ready assets with channel-safe dimensions and formats.",
    recommendedTools: ["resize", "convert", "compress"],
    relatedGuides: DEFAULT_RELATED_GUIDES,
    relatedComparisons: DEFAULT_RELATED_COMPARISONS
  },
  {
    slug: "poshmark-closet-updates",
    title: "Poshmark Closet Updates",
    summary: "Reformat and optimize closet photos for faster mobile listing updates.",
    recommendedTools: ["compress", "convert", "resize"],
    relatedGuides: DEFAULT_RELATED_GUIDES,
    relatedComparisons: DEFAULT_RELATED_COMPARISONS
  },
  {
    slug: "facebook-marketplace-images",
    title: "Facebook Marketplace Photos",
    summary: "Create clean, quick-loading images for marketplace browsing and chats.",
    recommendedTools: ["compress", "resize", "background-remove"],
    relatedGuides: DEFAULT_RELATED_GUIDES,
    relatedComparisons: DEFAULT_RELATED_COMPARISONS
  },
  {
    slug: "pinterest-product-pins",
    title: "Pinterest Product Pins",
    summary: "Prepare pin-ready visual assets with strong composition and compact sizes.",
    recommendedTools: ["resize", "convert", "compress"],
    relatedGuides: DEFAULT_RELATED_GUIDES,
    relatedComparisons: DEFAULT_RELATED_COMPARISONS
  },
  {
    slug: "tiktok-shop-creatives",
    title: "TikTok Shop Creatives",
    summary: "Ship mobile-first creative image variants for TikTok Shop listings and ads.",
    recommendedTools: ["background-remove", "resize", "compress"],
    relatedGuides: DEFAULT_RELATED_GUIDES,
    relatedComparisons: DEFAULT_RELATED_COMPARISONS
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
  },
  {
    audience: "amazon",
    intent: "variation-gallery-refresh",
    title: "Amazon Variation Gallery Refresh",
    summary: "Refresh variation thumbnails and gallery assets without redoing your full catalog.",
    recommendedTools: ["resize", "compress", "convert"],
    faq: [
      {
        question: "Should variation images match exact dimensions?",
        answer: "Yes, consistent dimensions help reduce listing layout shifts and moderation flags."
      },
      {
        question: "Can I keep my original files?",
        answer: "Yes, process temporary copies and publish only validated outputs."
      }
    ]
  },
  {
    audience: "walmart",
    intent: "bulk-catalog-compliance",
    title: "Walmart Bulk Catalog Compliance",
    summary: "Run repeatable transformations for large Walmart catalog updates.",
    recommendedTools: ["resize", "convert", "compress"],
    faq: [
      {
        question: "What is the fastest way to standardize many files?",
        answer: "Keep one default pipeline and apply it consistently across each upload batch."
      },
      {
        question: "Do I need transparency?",
        answer: "Only when required by your content style; otherwise JPG or WEBP can reduce size."
      }
    ]
  },
  {
    audience: "ebay",
    intent: "mobile-relist-speed",
    title: "eBay Mobile Relist Speed Workflow",
    summary: "Ship relist image updates quickly for mobile-heavy eBay buyers.",
    recommendedTools: ["compress", "resize", "convert"],
    faq: [
      {
        question: "Why focus on compression first?",
        answer: "Mobile-focused listings benefit from smaller payloads and faster gallery loads."
      },
      {
        question: "How often should I refresh image sets?",
        answer: "Refresh when CTR drops or when seasonal templates change."
      }
    ]
  },
  {
    audience: "facebook",
    intent: "marketplace-speed-listing",
    title: "Facebook Marketplace Speed Listing",
    summary: "Reduce listing turnaround with a compact upload and resize pipeline.",
    recommendedTools: ["compress", "resize", "background-remove"],
    faq: [
      {
        question: "Will compressed images still look sharp in listing previews?",
        answer: "Yes, tuned compression keeps visible quality while cutting payload size."
      },
      {
        question: "Do I need transparent backgrounds?",
        answer: "Only for stylized assets. Product photos often perform well on plain backgrounds."
      }
    ]
  },
  {
    audience: "pinterest",
    intent: "catalog-pin-exports",
    title: "Pinterest Catalog Pin Exports",
    summary: "Export image variants for organic and promoted Pinterest placements.",
    recommendedTools: ["resize", "convert", "compress"],
    faq: [
      {
        question: "Which format balances quality and speed?",
        answer: "WEBP typically gives the best compression if your destination supports it."
      },
      {
        question: "Should pins share one aspect ratio?",
        answer: "Use a small set of approved ratios to keep creative production predictable."
      }
    ]
  },
  {
    audience: "tiktok",
    intent: "shop-launch-assets",
    title: "TikTok Shop Launch Assets",
    summary: "Prepare launch-ready product images for TikTok Shop and paid creative variants.",
    recommendedTools: ["background-remove", "resize", "compress"],
    faq: [
      {
        question: "Do cutout images help conversions?",
        answer: "Clean product cutouts can improve visual focus in crowded feed placements."
      },
      {
        question: "What if the free plan adds watermarking?",
        answer: "Upgrade to a paid plan for advanced outputs without watermark overlays."
      }
    ]
  },
  {
    audience: "mercari",
    intent: "mobile-listing-refresh",
    title: "Mercari Mobile Listing Refresh",
    summary: "Refresh Mercari catalog visuals for quick mobile scrolling and clear detail shots.",
    recommendedTools: ["compress", "resize", "convert"],
    faq: [
      {
        question: "How can I keep listing quality while reducing size?",
        answer: "Start at moderate quality settings and verify visual quality before bulk publish."
      },
      {
        question: "Can I automate my refresh flow?",
        answer: "Use repeatable tool presets and consistent order of operations."
      }
    ]
  },
  {
    audience: "woocommerce",
    intent: "store-migration-assets",
    title: "WooCommerce Store Migration Assets",
    summary: "Standardize and optimize images while migrating product data to WooCommerce.",
    recommendedTools: ["convert", "resize", "compress"],
    faq: [
      {
        question: "What causes the most migration image issues?",
        answer: "Inconsistent dimensions and oversized payloads are the most common blockers."
      },
      {
        question: "Should I convert everything to one format?",
        answer: "Use one default format where possible, then carve out exceptions for transparency needs."
      }
    ]
  },
  {
    audience: "whatnot",
    intent: "live-auction-prep",
    title: "Whatnot Live Auction Prep",
    summary: "Get live-auction product images ready before stream start with minimal rework.",
    recommendedTools: ["background-remove", "resize", "compress"],
    faq: [
      {
        question: "How do I speed up pre-stream prep?",
        answer: "Batch your resize and compression steps after one round of background cleanup."
      },
      {
        question: "What should I prioritize for live conversion?",
        answer: "Clear subject focus and fast-loading galleries matter most during live sessions."
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
  },
  {
    topic: "build-shopify-hero-galleries",
    title: "How to Build Shopify Hero Galleries",
    summary: "Create a fast-loading, high-clarity product gallery set for Shopify PDPs.",
    steps: [
      "Choose one base ratio for hero and supporting images.",
      "Resize each source image into that ratio without stretching.",
      "Compress outputs and validate all file sizes before publish."
    ],
    relatedTools: ["resize", "compress", "convert"],
    faq: [{ question: "Should hero images stay lossless?", answer: "Use lossless only when detail demands it. Most photo galleries are fine with tuned lossy compression." }]
  },
  {
    topic: "speed-up-ebay-relist-photos",
    title: "How to Speed Up eBay Relist Photos",
    summary: "Refresh relist images with a repeatable workflow that keeps payloads small.",
    steps: [
      "Use resize presets for each eBay slot type.",
      "Compress with one quality target across a relist batch.",
      "Export consistently named files for quick listing updates."
    ],
    relatedTools: ["resize", "compress", "convert"],
    faq: [{ question: "How do I avoid visual drift across relists?", answer: "Lock one dimension profile and one compression profile per listing class." }]
  },
  {
    topic: "walmart-catalog-image-qa",
    title: "How to Run Walmart Catalog Image QA",
    summary: "Set up an image QA pass for Walmart catalog updates.",
    steps: [
      "Normalize format and dimensions first.",
      "Check output bytes against channel limits.",
      "Run final visual spot checks before upload."
    ],
    relatedTools: ["resize", "convert", "compress"],
    faq: [{ question: "What fails QA most often?", answer: "Dimension mismatches and oversized files are the most frequent failures." }]
  },
  {
    topic: "facebook-marketplace-photo-pack",
    title: "How to Prepare a Facebook Marketplace Photo Pack",
    summary: "Generate a clean image pack for faster Facebook Marketplace listing.",
    steps: [
      "Compress primary images first for quick mobile loading.",
      "Resize support images to consistent gallery framing.",
      "Use background removal only when it improves subject clarity."
    ],
    relatedTools: ["compress", "resize", "background-remove"],
    faq: [{ question: "Can I skip background removal?", answer: "Yes. Use it selectively where background noise hurts product focus." }]
  },
  {
    topic: "pinterest-pin-image-layouts",
    title: "How to Build Pinterest Pin Image Layouts",
    summary: "Prepare pin images with predictable sizing and lightweight payloads.",
    steps: [
      "Pick 2-3 approved aspect ratios for your pin program.",
      "Resize exports to those ratios.",
      "Convert/compress for a balance of quality and speed."
    ],
    relatedTools: ["resize", "convert", "compress"],
    faq: [{ question: "Should I keep one format for all pins?", answer: "A single default format simplifies workflows; add exceptions only when needed." }]
  },
  {
    topic: "tiktok-shop-asset-batch",
    title: "How to Batch TikTok Shop Assets",
    summary: "Create mobile-ready TikTok Shop images in one repeatable batch flow.",
    steps: [
      "Run background remove on product hero images.",
      "Resize to your approved mobile frame sizes.",
      "Compress outputs before campaign upload."
    ],
    relatedTools: ["background-remove", "resize", "compress"],
    faq: [{ question: "Why process hero images first?", answer: "Hero assets get the most impressions, so they should be optimized first." }]
  },
  {
    topic: "woocommerce-migration-image-pack",
    title: "How to Build a WooCommerce Migration Image Pack",
    summary: "Standardize image transformations during WooCommerce migrations.",
    steps: [
      "Convert all images to your default format profile.",
      "Resize and compress to migration-safe thresholds.",
      "Run quick QA sampling before import."
    ],
    relatedTools: ["convert", "resize", "compress"],
    faq: [{ question: "Can I preserve transparency during migration?", answer: "Yes, keep PNG/WEBP for assets requiring transparent backgrounds." }]
  },
  {
    topic: "mercari-mobile-thumbnail-pass",
    title: "How to Run a Mercari Mobile Thumbnail Pass",
    summary: "Optimize Mercari thumbnails for mobile browse quality and speed.",
    steps: [
      "Resize to a consistent thumbnail frame.",
      "Apply moderate compression to reduce payload size.",
      "Validate readability on small screens before publishing."
    ],
    relatedTools: ["resize", "compress", "convert"],
    faq: [{ question: "What quality level works for mobile thumbnails?", answer: "Start around 75-85 and tune by product category and visual texture." }]
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
  },
  {
    slug: "resize-vs-compress",
    title: "Resize vs Compress: Which First?",
    summary: "Determine whether dimensions or quality settings should be your first optimization lever.",
    winnerWhen: "Resize first when the source dimensions are much larger than target placement.",
    winnerBut: "Compress first when dimensions are already correct and payload size is the only issue.",
    decisionChecklist: [
      "Huge dimensions mismatch? Resize first.",
      "Dimensions already correct? Compress first.",
      "Need maximum efficiency? Resize then compress."
    ]
  },
  {
    slug: "png-vs-jpeg-thumbnails",
    title: "PNG vs JPEG for Thumbnails",
    summary: "Pick the right format for storefront thumbnail performance and clarity.",
    winnerWhen: "JPEG wins for photographic thumbnails needing lower byte size.",
    winnerBut: "PNG wins when transparent overlays or sharp edges matter more.",
    decisionChecklist: [
      "Pure photo thumbnail? Use JPEG.",
      "Transparency required? Use PNG.",
      "Mixed assets? Benchmark both formats."
    ]
  },
  {
    slug: "webp-vs-jpg-speed",
    title: "WEBP vs JPG for Speed",
    summary: "Compare loading performance for high-volume image grids.",
    winnerWhen: "WEBP typically wins for byte size at equivalent quality.",
    winnerBut: "JPG still wins when tooling compatibility is your top constraint.",
    decisionChecklist: [
      "Need smallest payload? Prefer WEBP.",
      "Need universal compatibility? JPG.",
      "Have mixed clients? Serve fallback variants."
    ]
  },
  {
    slug: "lossless-vs-lossy-marketplace",
    title: "Lossless vs Lossy for Marketplace Photos",
    summary: "Balance editing flexibility and performance across listing pages.",
    winnerWhen: "Lossy wins for speed-sensitive storefront delivery.",
    winnerBut: "Lossless wins for source masters and high-detail edits.",
    decisionChecklist: [
      "Publishing to storefront? Prefer lossy outputs.",
      "Archiving source masters? Keep lossless copies.",
      "Need both? Maintain dual export profiles."
    ]
  },
  {
    slug: "background-remove-vs-manual-cutout",
    title: "Background Remove Tool vs Manual Cutout",
    summary: "Decide when automated background removal is sufficient versus manual editing.",
    winnerWhen: "Automated removal wins for high-volume catalog throughput.",
    winnerBut: "Manual editing wins for edge-case products with complex hair/fabric boundaries.",
    decisionChecklist: [
      "High volume? Use automated cutouts.",
      "Complex edge fidelity needed? Manual pass.",
      "Hybrid workflow? Auto first, manual exceptions."
    ]
  },
  {
    slug: "transparent-vs-white-background",
    title: "Transparent vs White Background",
    summary: "Choose background style based on channel requirements and ad creative goals.",
    winnerWhen: "White backgrounds win where compliance standards demand neutral hero images.",
    winnerBut: "Transparent backgrounds win for flexible design reuse in ads and composites.",
    decisionChecklist: [
      "Compliance requires white? Use white.",
      "Need design reuse? Transparent.",
      "Multiple channels? Export both variants."
    ]
  },
  {
    slug: "quality-80-vs-quality-90",
    title: "JPEG Quality 80 vs 90",
    summary: "Understand practical quality tradeoffs for ecommerce photos.",
    winnerWhen: "Quality 80 wins when reducing file size is the priority.",
    winnerBut: "Quality 90 wins for premium catalogs where compression artifacts are unacceptable.",
    decisionChecklist: [
      "Need smaller files? Start at 80.",
      "Need highest detail? Use 90.",
      "Not sure? A/B visual QA with both."
    ]
  },
  {
    slug: "single-pass-vs-multi-pass-optimization",
    title: "Single-Pass vs Multi-Pass Optimization",
    summary: "Compare one-shot transforms to staged pipelines for catalog reliability.",
    winnerWhen: "Single-pass wins for speed and low operational complexity.",
    winnerBut: "Multi-pass wins when you need fine-grained control over output quality and compliance.",
    decisionChecklist: [
      "Need throughput? Single-pass.",
      "Need precision control? Multi-pass.",
      "Need both? Use presets per product category."
    ]
  },
  {
    slug: "convert-before-resize-vs-resize-before-convert",
    title: "Convert Before Resize vs Resize Before Convert",
    summary: "Choose transformation order for predictable output quality.",
    winnerWhen: "Resize before convert in most cases to avoid repeated format losses.",
    winnerBut: "Convert first when the target codec-specific behavior must guide further edits.",
    decisionChecklist: [
      "General catalog flow? Resize then convert.",
      "Codec-specific pipeline needed? Convert first.",
      "Always validate output after reordering."
    ]
  }
];

export function getBaseUrl(): string {
  const fallback = "http://localhost:3000";
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  const isProduction = process.env.NODE_ENV === "production";

  if (!raw) {
    if (isProduction) {
      throw new Error("NEXT_PUBLIC_SITE_URL is required in production.");
    }
    return fallback;
  }

  try {
    const normalized = new URL(raw).toString();
    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  } catch {
    if (isProduction) {
      throw new Error(`NEXT_PUBLIC_SITE_URL is invalid: ${raw}`);
    }
    return fallback;
  }
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
