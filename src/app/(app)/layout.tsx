import Link from 'next/link';
import { BottomNav, MobileBar, Rail } from '~/components/shell/nav';
import { PRIMARY_NAV, memberLabel, memberNumber, visibleGroups } from '~/lib/nav';
import { requireOnboarded } from '~/server/guard';
import { notificationCounts } from '~/server/queries';
import { formatMemberId, levelLabel } from '~/lib/domain';
import { ThemeScript } from '~/components/shell/theme';

/**
 * The application shell.
 *
 * Every signed-in page renders inside this, so navigation, identity, and badge
 * counts are resolved once per navigation rather than once per page.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { actor, admin } = await requireOnboarded();

  const counts = await notificationCounts(actor.userId);
  const groups = visibleGroups(actor, admin);

  const member = {
    displayName: memberLabel(actor),
    username: actor.username,
    memberId: memberNumber(actor),
    level: actor.level,
    levelLabel: levelLabel(actor.level),
    avatarUrl: null,
    unreadMessages: counts.messages,
    unreadNotifications: counts.unread,
  };

  const hasAside = false;

  return (
    <div className={`shell${hasAside ? ' has-aside' : ''}`}>
      <aside className="rail">
        <Rail groups={groups} member={member} />
      </aside>

      <div className="main">
        <MobileBar member={member} />
        <ThemeScript reduceMotion={false} />
        {children}
      </div>

      <BottomNav
        items={PRIMARY_NAV}
        badgeFor={(href) =>
          href === '/connections'
            ? 0
            : href === '/commons'
              ? counts.messages
              : href === '/home'
                ? counts.unread
                : 0
        }
      />
    </div>
  );
}

export { Link, formatMemberId };