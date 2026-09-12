import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home-shell">
      <header className="site-header">
        <Link href="/" className="brand" aria-label="Lucy home">
          <span className="brand-mark" aria-hidden="true">
            L
          </span>
          <span>Lucy</span>
        </Link>

        <div className="header-actions"><Link href="/demo" className="header-link">Open demo</Link><Link href="/connect" className="header-link">Connect Meta</Link></div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Meta ads from WhatsApp</p>
          <h1>Property ads, ready to approve.</h1>
          <p className="hero-description">
            Send photos on WhatsApp. Lucy builds the campaign and waits for your approval before anything goes live.
          </p>
          <div className="hero-actions">
            <Link href="/demo" className="primary-button">Try the safe demo</Link>
            <p>No ads run without your approval.</p>
          </div>
        </div>

        <div className="hero-visual">
          <Image
            src="/images/lucy-property-hero.png"
            alt="Modern apartment building at dusk"
            fill
            priority
            sizes="(max-width: 767px) 100vw, 50vw"
            className="hero-image"
          />
          <div className="workflow" aria-label="Lucy workflow">
            <span>Send</span>
            <span>Review</span>
            <span>Approve</span>
          </div>
        </div>
      </section>
    </main>
  );
}
