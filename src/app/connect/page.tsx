import Link from "next/link";

export default function ConnectPage() {
  return (
    <main className="setup-shell">
      <Link href="/" className="brand" aria-label="Lucy home">
        <span className="brand-mark" aria-hidden="true">L</span>
        <span>Lucy</span>
      </Link>
      <section className="setup-card">
        <p className="eyebrow">Pilot setup</p>
        <h1>Connect the accounts Lucy will use.</h1>
        <p className="setup-description">
          The first pilot is connected manually so ownership, permissions, approval, and spend limits can be verified before self-serve OAuth.
        </p>
        <ol className="setup-list">
          <li>Supabase project and private media bucket</li>
          <li>Meta Business Portfolio, Page, funded ad account, and system user</li>
          <li>Linked WhatsApp Business Account and production number</li>
          <li>AI Gateway key and supported model</li>
          <li>Webhook subscriptions, operator allowlist, and hard spend limits</li>
        </ol>
        <p className="setup-note">Activate one tiny, approved campaign only after the complete integration checklist passes.</p>
      </section>
    </main>
  );
}
