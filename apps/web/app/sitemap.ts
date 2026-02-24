import type { MetadataRoute } from "next";
import { AUDIENCE_INTENT_PAGES, COMPARE_PAGES, getBaseUrl, GUIDE_PAGES, TOOL_PAGES, USE_CASE_PAGES } from "./lib/seo-data";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getBaseUrl();
  const now = new Date();

  const fixed = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 1
    }
  ];

  const tools = TOOL_PAGES.map((tool) => ({
    url: `${baseUrl}/tools/${tool.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8
  }));

  const useCases = USE_CASE_PAGES.map((item) => ({
    url: `${baseUrl}/use-cases/${item.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7
  }));

  const audienceIntents = AUDIENCE_INTENT_PAGES.map((item) => ({
    url: `${baseUrl}/for/${item.audience}/${item.intent}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7
  }));

  const guides = GUIDE_PAGES.map((item) => ({
    url: `${baseUrl}/guides/${item.topic}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.65
  }));

  const comparisons = COMPARE_PAGES.map((item) => ({
    url: `${baseUrl}/compare/${item.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.65
  }));

  return [...fixed, ...tools, ...useCases, ...audienceIntents, ...guides, ...comparisons];
}
