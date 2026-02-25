import { headers } from "next/headers";

type JsonLdProps = {
  data: unknown;
};

export async function JsonLd({ data }: JsonLdProps) {
  const nonce = (await headers()).get("x-nonce") || undefined;

  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD is generated from trusted server-side metadata.
    <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}
