import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { requireOnboarded } from '~/server/guard';
import { notificationList } from '~/server/queries';
import { sessionCsrfToken } from '~/server/csrf';
import { relativeTime } from '~/lib/format';
import { markAllNotificationsRead, markNotificationRead } from '~/server/actions/notifications';

export const metadata: Metadata = { title: 'Notifications' };

function safeHref(href: string | null): string {
  return href && href.startsWith('/') && !href.startsWith('//') ? href : '/notifications';
}

export default async function NotificationsPage() {
  const { actor } = await requireOnboarded();
  const [items, csrf] = await Promise.all([
    notificationList(actor.userId, { limit: 80 }),
    sessionCsrfToken(),
  ]);
  const unread = items.filter((item) => !item.read).length;

  return (
    <PageShell
      title="Notifications"
      sub="A quiet record of what has happened around your Arch."
      actions={unread > 0 ? (
        <form action={markAllNotificationsRead}>
          <input type="hidden" name="__csrf" value={csrf} />
          <button className="btn btn-ghost btn-sm" type="submit">Mark all read</button>
        </form>
      ) : null}
    >
      {items.length === 0 ? (
        <EmptyState glyph="◔" title="Nothing to report." body="New messages, replies, invitations and community activity will appear here." />
      ) : (
        <div className="stack stack-3">
          {items.map((item) => (
            <article className={`card card-pad-md stack stack-2${item.read ? '' : ' notification-unread'}`} key={item.id}>
              <div className="row row-between">
                <span className="t-label">{item.kind.replaceAll('_', ' ')}</span>
                <time className="t-meta" dateTime={item.createdAt.toISOString()}>{relativeTime(item.createdAt)}</time>
              </div>
              <div className="stack stack-1">
                <h2 className="t-section"><Link href={safeHref(item.href)}>{item.title}</Link></h2>
                {item.body && <p className="t-small t-subtle">{item.body}</p>}
              </div>
              {!item.read && (
                <form action={markNotificationRead}>
                  <input type="hidden" name="__csrf" value={csrf} />
                  <input type="hidden" name="notificationId" value={item.id} />
                  <button className="btn btn-ghost btn-sm" type="submit">Mark read</button>
                </form>
              )}
            </article>
          ))}
        </div>
      )}
    </PageShell>
  );
}
