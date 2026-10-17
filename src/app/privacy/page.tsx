import Link from 'next/link';

export const metadata = {
  title: 'Privacy',
  description: 'How Enyd Arch handles account identity, content, and privacy.',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

const sections = [
  {
    title: 'A private community, not invisible infrastructure',
    body: 'Enyd Arch is invitation-led and member areas require an account. This limits who can enter; it does not make a member or their network traffic impossible to identify. The hosting provider, network operators, and administrators may still process technical data needed to operate and protect the service.',
  },
  {
    title: 'Identity and account data',
    body: 'Your public Enyd identity is intended to use a username, display name, and membership number rather than exposing your legal name, email address, phone number, or precise location on public profile surfaces. Your account and activity are still linked internally so permissions, moderation, and abuse prevention can work.',
  },
  {
    title: 'Device binding and passkeys',
    body: 'The application uses a random first-party installation cookie and may store a passkey public key to protect account access. The cookie identifies a browser profile, not a physical device, and is not proof of hardware identity. A passkey private key is held by the authenticator; the server stores credential metadata and public-key material.',
  },
  {
    title: 'Messages and uploaded files',
    body: 'Private messages are not end-to-end encrypted in the current implementation. Message content can be processed by the application server and database. Uploaded files may be checked by the configured malware scanner and can remain quarantined until scanning succeeds. Do not send information that requires end-to-end confidentiality until that feature is independently implemented and verified.',
  },
  {
    title: 'Technical data and abuse prevention',
    body: 'The application uses rate limits, security audit events, and pseudonymous identifiers to help protect accounts and investigate abuse. Depending on deployment configuration, infrastructure providers may also process connection metadata and retain operational logs. Do not assume that network addresses are hidden from every operator or provider.',
  },
  {
    title: 'Your choices and retention',
    body: 'Use account settings and available reporting controls to manage preferences or report a safety issue. Some records may be retained for security, moderation, legal compliance, or integrity reasons. Retention and deletion behavior depends on the current implementation and deployment; do not assume every deletion is immediate or irreversible.',
  },
];

export default function PrivacyPage() {
  return (
    <main className="page-shell" id="main">
      <header className="page-header">
        <p className="eyebrow">THE CHARTER</p>
        <h1>Privacy, without pretending.</h1>
        <p className="page-description">
          Enyd Arch is designed to be invitation-led and discreet. This page explains the boundaries
          of that promise, including what the service does not yet guarantee.
        </p>
      </header>
      <div className="content-stack">
        {sections.map((section) => (
          <section className="panel" key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </section>
        ))}
      </div>
      <p className="muted-note">
        Privacy is also a deployment property. Operators should keep this repository private if
        private development details are added, use HTTPS, protect database and storage credentials,
        restrict production access, and review backups and logs.
      </p>
      <p><Link href="/">Return to the Arch</Link></p>
    </main>
  );
}
