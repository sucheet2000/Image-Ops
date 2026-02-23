import Link from "next/link";
import { TOOL_PAGES, USE_CASE_PAGES } from "./lib/seo-data";

export default function HomePage() {
  return (
    <main className="container">
      <h1>Image Ops</h1>
      <p className="subhead">Marketplace-ready image tools with strict deletion policies.</p>

      <section className="card">
        <h2>Tool Pages</h2>
        <ul>
          {TOOL_PAGES.map((tool) => (
            <li key={tool.slug}>
              <Link href={`/tools/${tool.slug}`}>{tool.name}</Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Use Cases</h2>
        <ul>
          {USE_CASE_PAGES.map((item) => (
            <li key={item.slug}>
              <Link href={`/use-cases/${item.slug}`}>{item.title}</Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="card trust">
        <h2>Privacy</h2>
        <p>
          Your images are processed temporarily and automatically deleted. We do not store your uploaded
          images in our database after you leave the page.
        </p>
      </section>
    </main>
  );
}
