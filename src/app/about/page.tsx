import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';

export const metadata: Metadata = {
  title: 'About Enyd Arch',
  description: 'A private digital society for students.',
};

export default function AboutPage() {
  return (
    <PageShell title="Enyd Arch" sub="A private digital society for students." wide>
      <section className="panel panel-body stack-3">
        <p className="t-display">Enter quietly. Discover freely.</p>
        <p>Enyd Arch is a member-led digital society for conversation, creative work, collaborative projects, events, and shared discovery. It is designed to feel like an evolving archive rather than an endless public feed.</p>
      </section>
      <section className="stack stack-3">
        <h2 className="section-heading">Explore the Arch</h2>
        <div className="panel panel-body"><h3>The Commons and Network</h3><p className="t-small t-muted">Conversations, ideas, questions, and member posts.</p><Link className="btn btn-ghost" href="/home">Open the Commons</Link></div>
        <div className="panel panel-body"><h3>The Archive and Gallery</h3><p className="t-small t-muted">Collections, resources, and work made by members.</p><div className="row row-3"><Link className="btn btn-ghost" href="/archive">Open the Archive</Link><Link className="btn btn-ghost" href="/gallery">Visit the Gallery</Link></div></div>
        <div className="panel panel-body"><h3>Projects and Events</h3><p className="t-small t-muted">Build something together or bring members into the same room.</p><div className="row row-3"><Link className="btn btn-ghost" href="/projects">Browse projects</Link><Link className="btn btn-ghost" href="/events">Find events</Link></div></div>
        <div className="panel panel-body"><h3>The Registry</h3><p className="t-small t-muted">Find members who choose to be discoverable.</p><Link className="btn btn-ghost" href="/registry">Open the Registry</Link></div>
      </section>
      <section className="panel panel-body stack-2">
        <h2>Membership</h2>
        <p className="t-small t-muted">Membership is invitation-based. Profile discoverability and connection modes are controlled by member settings.</p>
        <Link className="btn btn-secondary" href="/sign-in">Sign in</Link>
      </section>
    </PageShell>
  );
}
