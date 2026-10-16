import Link from 'next/link';
import { MARK, PRODUCT_NAME } from '~/lib/domain';

export const metadata = {
  title: 'Privacy',
  description: 'How Enyd Arch handles identity, content, and technical data.',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

const sections = [
  { title: 'Your public identity', body: 'Other members should see your Enyd identity, such as your handle and display name, rather than private account fields. Never post a legal name, address, phone number, password, recovery code, or other identifying detail unless you intentionally want to share it.' },
  { title: 'Private does not mean invisible to the service', body: 'Enyd Arch is designed to restrict access to members, but the service must process account data and content to operate. Database operators and authorised service administrators may be able to access stored information. Do not treat this service as anonymous from its operators.' },
  { title: 'Messages and encryption', body: 'Do not assume messages or uploads are end-to-end encrypted. Unless the product explicitly identifies a feature as end-to-end encrypted and has been independently reviewed, the service may be technically able to access stored content.' },
  { title: 'Security logs and abuse prevention', body: 'The service may process limited technical information to protect accounts, investigate abuse, rate-limit requests, and maintain security records. IP-derived identifiers may be pseudonymised; pseudonymisation is not the same as anonymity and can still permit correlation.' },
  { title: 'Uploads and shared content', body: 'Content shared with a group or published area may be copied, downloaded, or remembered by other members. Removing an item from Enyd Arch cannot guarantee that every copy elsewhere is erased. Uploads may be held from access while security checks are pending.' },
  { title: 'Your choices', body: 'Use a unique password, keep your passkey and device secure, sign out on shared devices, and share the minimum information needed. Report suspected account compromise or privacy exposure to the community administrators.' },
];

export default function PrivacyPage() {
  return (
    <div className="landing">
      <main className="landing-main" id="main">
        <section className="hero">
          <div className="hero-inner">
            <p className="hero-eyebrow">{MARK} {PRODUCT_NAME}</p>
            <h1 className="hero-title">Privacy, without pretending.</h1>
            <p className="hero-whisper">
              Enyd Arch aims to be a private community. This page explains the limits as well as the protections.
            </p>
          </div>
        </section>
        <section className="promise-band" aria-label="Privacy practices">
          {sections.map((section) => (
            <article className="panel" key={section.title}>
              <div className="panel-body">
                <h2 className="promise-title">{section.title}</h2>
                <p className="promise-body">{section.body}</p>
              </div>
            </article>
          ))}
        </section>
        <p className="hero-note">
          This is a product privacy summary, not legal advice or a substitute for a jurisdiction-specific privacy notice.
        </p>
      </main>
      <footer className="site-footer">
        <Link href="/">Return to Enyd Arch</Link>
        <Link href="/safety">Safety</Link>
      </footer>
    </div>
  );
}
