'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { initials } from '~/lib/format';
import { isCurrent } from '~/lib/nav';

/**
 * The rail, the mobile bar, and the bottom navigation.
 *
 * One component family so the active-state logic cannot drift between the
 * desktop rail and the phone tab bar. Active state is computed from the
 * pathname rather than from a prop, so a client-side navigation updates it
 * without a round trip.
 */

export interface RailMember {
  displayName: string;
  username: string;
  memberId: string;
  level: string;
  levelLabel: string;
  avatarUrl: string | null;
  unreadMessages: number;
  unreadNotifications: number;
}

export interface RailGroup {
  label: string;
  items: Array<{
    href: string;
    label: string;
    glyph: string;
    description?: string;
    adminPermission?: string;
    badge?: number;
  }>;
}

export function Rail({
  groups,
  member,
}: {
  groups: RailGroup[];
  member: RailMember;
}) {
  const pathname = usePathname();

  return (
    <>
      <div className="rail-head">
        <Link className="brand" href="/home" aria-label="Enyd Arch — home">
          <span className="brand-mark" aria-hidden="true">
            ◈
          </span>
          <span className="brand-text">
            <span className="brand-name">Enyd Arch</span>
            <span className="brand-sub">Enter quietly</span>
          </span>
        </Link>
      </div>

      <nav className="rail-scroll" aria-label="Areas of the Arch">
        {groups.map((group) => (
          <div className="nav-group" key={group.label}>
            <p className="nav-group-label">{group.label}</p>
            <ul className="nav-list">
              {group.items.map((item) => {
                const current = isCurrent(pathname, item.href);
                const badge =
                  item.href === '/messages'
                    ? member.unreadMessages
                    : item.href === '/notifications'
                      ? member.unreadNotifications
                      : item.badge;

                return (
                  <li key={item.href}>
                    <Link
                      className="nav-item"
                      href={item.href}
                      aria-current={current ? 'page' : undefined}
                      title={item.description ?? item.label}
                    >
                      <span className="nav-glyph" aria-hidden="true">
                        {item.glyph}
                      </span>
                      <span className="nav-label">{item.label}</span>
                      {badge && badge > 0 ? (
                        <span
                          className={
                            item.href === '/notifications' ? 'nav-count nav-count-accent' : 'nav-count'
                          }
                        >
                          {badge > 99 ? '99+' : badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="rail-foot">
        <Link className="rail-me" href="/me" title={`@${member.username} · ${member.memberId}`}>
          <Avatar member={member} size="sm" />
          <span className="rail-me-text who-text">
            <span className="who-name">{member.displayName}</span>
            <span className="who-handle">{member.memberId}</span>
          </span>
        </Link>
      </div>
    </>
  );
}

export function Avatar({
  member,
  size = 'md',
}: {
  member: { displayName: string; avatarUrl: string | null };
  size?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  const className = `avatar${size === 'sm' ? ' avatar-sm' : size === 'lg' ? ' avatar-lg' : ''}`;
  if (member.avatarUrl) {
    return (
      <span className={className}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={member.avatarUrl} alt="" />
      </span>
    );
  }
  return (
    <span className={className} aria-hidden="true">
      {initials(member.displayName)}
    </span>
  );
}

export function MobileBar({ member }: { member: RailMember }) {
  return (
    <div className="mobile-bar">
      <Link className="brand" href="/home" aria-label="Enyd Arch — home">
        <span className="brand-mark" aria-hidden="true">
          ◈
        </span>
        <span className="brand-text">
          <span className="brand-name">Enyd Arch</span>
        </span>
      </Link>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--sp-2)' }}>
        <Link className="btn btn-icon btn-sm" href="/search" aria-label="Search">
          <SearchGlyph />
        </Link>
        <Link className="btn btn-icon btn-sm" href="/notifications" aria-label="Notifications">
          <BellGlyph />
          {member.unreadNotifications > 0 && (
            <span className="visually-hidden">
              {member.unreadNotifications} unread
            </span>
          )}
        </Link>
        <Link href="/me" aria-label={`Your profile, ${member.displayName}`}>
          <Avatar member={member} size="sm" />
        </Link>
      </div>
    </div>
  );
}

export function BottomNav({
  items,
  badgeFor,
}: {
  items: Array<{ href: string; label: string; glyph: string }>;
  badgeFor: (href: string) => number;
}) {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {items.map((item) => {
        const current = isCurrent(pathname, item.href);
        const badge = badgeFor(item.href);

        return (
          <Link
            key={item.href}
            className="bottom-nav-item"
            href={item.href}
            aria-current={current ? 'page' : undefined}
          >
            <span className="bottom-nav-glyph" aria-hidden="true">
              {item.glyph}
            </span>
            <span>{item.label}</span>
            {badge > 0 ? (
              <span className="bottom-nav-badge" aria-hidden="true">
                {badge > 9 ? '9+' : badge}
              </span>
            ) : null}
            {badge > 0 && <span className="sr-only">{badge} unread</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function SearchGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
      <path d="m11 11 3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function BellGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 6.5a4 4 0 1 1 8 0c0 3 1 4 1 4H3s1-1 1-4Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M6.5 13a1.7 1.7 0 0 0 3 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}