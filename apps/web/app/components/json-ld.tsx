type JsonLdProps = {
  data: unknown;
};

export function JsonLd({ data }: JsonLdProps) {
  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD is generated from trusted server-side metadata.
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}
