import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { MarkAllNotificationsRead, MarkNotificationRead } from '~/components/notifications/notification-actions';
import { notificationList } from '~/server/queries';
import { requireOnboarded } from '~/server/guard';

export const metadata: Metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const { actor } = await requireOnboarded();
  const items = await notificationList(actor.userId, { limit: 100 });
  const unread = items.filter((item) => !item.read).length;

  return (
    <PageShell title="Notifications" sub={`${unread} unread · only your account can access this list`} actions={unread > 0 ? <MarkAllNotificationsRead /> : undefined}>
      {items.length === 0 ? (
        <EmptyState glyph="◔" title="Nothing new." body="When something needs your attention, it will appear here." />
      ) : (
        <div className="stack stack-2">
          {items.map((item) => {
            const safeHref = item.href && item.href.startsWith('/') && !item.href.startsWith('//') ? item.href : '/home';
            return (
              <article key={item.id} className={item.read ? 'card card-pad row row-between' : 'card card-pad row row-between card-unread'}>
                <Link href={safeHref} className="grow stack stack-1">
                  <div className="row row-wrap row-2">
                    <span className="badge">{item.kind}</span>
                    <span className="t-meta">{item.createdAt.toLocaleString()}</span>
                  </div>
                  <strong>{item.title}</strong>
                  {item.body && <p className="t-small t-subtle">{item.body}</p>}
                </Link>
                {!item.read && <MarkNotificationRead id={item.id} />}
              </article>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
