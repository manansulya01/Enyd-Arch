import Link from 'next/link';
import { MARK, PRODUCT_NAME } from '~/lib/domain';

export const metadata = {
  title: 'Safety',
  description: 'Practical safety guidance for members of Enyd Arch.',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

const guidance = [
  {
    title: 'Protect your account',
    body: 'Use a unique password and a passkey where available. Never share a login code, recovery secret, invitation code, or device-transfer approval with someone who contacts you unexpectedly.',
  },
  {
    title: 'Share deliberately',
    body: 'Before posting, check whether a space is private, member-only, or public to the community. Private spaces limit intended access; they cannot stop a recipient from copying or photographing content.',
  },
  {
    title: 'Meet and message carefully',
    body: 'Do not feel pressured to disclose your location, school schedule, contact details, or other identifying information. Block or disengage from anyone who pressures, threatens, impersonates, or harasses you.',
  },
  {
    title: 'Report abuse',
    body: 'Use the in-product report controls where available and include the relevant post, message, or member identifier. Share only the information needed to investigate. If there is an immediate threat to someone’s safety, contact appropriate local emergency or safeguarding services.',
  },
  {
    title: 'Uploads and games',
    body: 'Only open files you trust. Security scanning reduces risk but cannot guarantee that every file is safe. Do not upload other people’s private information or content you do not have permission to share.',
  },
  {
    title: 'Privacy limits',
    body: 'Enyd Arch is not a promise of anonymity from the service operator, and content is not guaranteed to be end-to-end encrypted. Do not use it to exchange information that requires protections the service has not explicitly implemented and independently verified.',
  },
];

export default function SafetyPage() {
  return (
    <main className="page-shell" id="main">
      <header className="page-header">
        <p className="t-eyebrow">{MARK} {PRODUCT_NAME}</p>
        <h1 className="t-display">Keep the Arch safe.</h1>
        <p className="t-lede">
          A private community only works when its members can protect themselves and ask for help.
        </p>
      </header>
      <div className="content-stack">
        {guidance.map((item) => (
          <section className="content-panel" key={item.title}>
            <h2>{item.title}</h2>
            <p>{item.body}</p>
          </section>
        ))}
        <p><Link href="/">Return to Enyd Arch</Link></p>
      </div>
    </main>
  );
}
