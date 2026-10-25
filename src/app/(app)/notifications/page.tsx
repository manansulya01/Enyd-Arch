import type { Metadata } from 'next';
import { PageShell } from '~/components/ui/page-shell';
import { NotificationCard } from '~/components/notifications/notification-card';
import { requireOnboarded } from '~/server/guard';
import { notificationList, notificationCounts } from '~/server/queries';
import { sessionCsrfToken } from '~/server/csrf';

export const metadata: Metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const { actor } = await requireOnboarded();
  const [items, counts, csrfToken] = await Promise.all([
    notificationList(actor.userId, { limit: 100 }),
    notificationCounts(actor.userId),
    sessionCsrfToken(),
  ]);
  return (
    <PageShell title="Notifications" sub={counts.unread ? `You have ${counts.unread} unread notifications.` : 'You are all caught up.'} wide>
      <section className="stack stack-3">
        {items.length === 0 ? <div className="panel panel-body"><h2>No notifications yet</h2><p className="t-small t-muted">Replies, reactions, and invitations will appear here.</p></div> : items.map((item) => (
          <NotificationCard key={item.id} item={{ ...item, createdAt: item.createdAt.toISOString() }} csrfToken={csrfToken} />
        ))}
      </section>
    </PageShell>
  );
}
