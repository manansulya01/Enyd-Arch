import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { CsrfField } from '~/components/shell/csrf-field';
import { RegistryDeleteButton } from '~/components/registry/registry-editor';
import { currentActor } from '~/server/auth/session';
import { getRegistryItemById } from '~/server/actions/registry';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await getRegistryItemById(slug);
  if (!result.ok || !result.data) return { title: 'Registry Entry' };
  return {
    title: result.data.title,
    description: result.data.description,
    robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  };
}

export default async function RegistryItemPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [result, actor] = await Promise.all([getRegistryItemById(slug), currentActor()]);
  if (!result.ok || !result.data) notFound();
  const item = result.data;
  const isOwner = actor?.userId === item.ownerId;

  return (
    <PageShell
      title="Registry Entry"
      sub={item.title}
      actions={
        <Link className="btn btn-ghost btn-sm" href="/registry">
          Back to Registry
        </Link>
      }
    >
      <article className="stack stack-5">
        <section className="panel">
          <div className="panel-body stack stack-3">
            <div className="row row-wrap row-between">
              <span className="badge">{item.visibility === 'private' ? 'Private entry' : 'Member entry'}</span>
              <span className="t-meta">Added {item.createdAt.toLocaleDateString()}</span>
            </div>
            <h2 className="t-heading">{item.title}</h2>
            <p className="t-body">{item.description}</p>
            {item.details && (
              <div className="stack stack-2">
                <h3 className="t-label">Details</h3>
                <p className="t-body">{item.details}</p>
              </div>
            )}
          </div>
        </section>
        {isOwner && (
          <div className="row row-wrap">
            <Link className="btn btn-primary" href={`/registry/${item.id}/edit`}>
              Edit entry
            </Link>
            <RegistryDeleteButton slug={item.id} csrf={<CsrfField />} />
          </div>
        )}
      </article>
    </PageShell>
  );
}
