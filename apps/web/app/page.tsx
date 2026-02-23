export default function HomePage() {
  return (
    <main className="container">
      <h1>Image Ops</h1>
      <p className="subhead">Marketplace-ready image tools with strict deletion policies.</p>

      <section className="card">
        <h2>Free Plan</h2>
        <p>6 images per rolling 10 hours.</p>
        <p>Watermark applies to advanced tools on free usage.</p>
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
