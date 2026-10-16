import Link from 'next/link';
import type { ReactNode } from 'react';
import { initials } from '~/lib/format';

/**
 * Small presentational helpers shared by every area. Server components only —
 * anything interactive lives in its own 'use client' file.
 */

export function Avatar({
  displayName,
  avatarUrl,
  size = 'md',
  level,
}: {
  displayName: string;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  level?: string;
}) {
  const className = `avatar avatar-${size}`;
  return (
    <span className={className} title={displayName}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" />
      ) : (
        <span aria-hidden="true">{initials(displayName)}</span>
      )}
      {level && level !== 'member' && <span className="avatar-level" aria-hidden="true" />}
    </span>
  );
}

export function MemberByline({
  member,
  verb,
  timestamp,
  href,
}: {
  member: { username: string; displayName: string; memberId: string; avatarUrl: string | null; level: string };
  verb?: string;
  timestamp?: string;
  href?: string;
}) {
  const inner = (
    <span className="who">
      <Avatar displayName={member.displayName} avatarUrl={member.avatarUrl} size="sm" level={member.level} />
      <span className="who-text">
        <span className="who-name">{member.displayName}</span>
        <span className="who-handle">
          @{member.username} · {member.memberId}
        </span>
      </span>
    </span>
  );

  return (
    <div className="post-header">
      {href ? <Link href={href}>{inner}</Link> : inner}
      {verb && <span className="post-meta">{verb}</span>}
      {timestamp && <span className="post-meta">{timestamp}</span>}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="section-head">
      <div>
        {eyebrow && <span className="t-eyebrow">{eyebrow}</span>}
        <h1 className="t-display">{title}</h1>
        {lede && <p className="t-lede">{lede}</p>}
      </div>
      {actions && <div className="row row-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  glyph = '◈',
  title,
  body,
  action,
}: {
  glyph?: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-glyph" aria-hidden="true">
        {glyph}
      </span>
      <p className="empty-title">{title}</p>
      <p className="empty-body">{body}</p>
      {action}
    </div>
  );
}

export function Notice({
  tone = 'info',
  glyph = '◈',
  children,
}: {
  tone?: 'info' | 'accent' | 'success' | 'danger';
  glyph?: string;
  children: ReactNode;
}) {
  return (
    <p className={`notice notice-${tone}`}>
      <span className="notice-glyph" aria-hidden="true">
        {glyph}
      </span>
      <span className="notice-body">{children}</span>
    </p>
  );
}

export function Gate({
  title,
  body,
  glyph = '⚿',
  action,
}: {
  title: string;
  body: string;
  glyph?: string;
  action?: ReactNode;
}) {
  return (
    <div className="gate-card">
      <span className="gate-glyph" aria-hidden="true">
        {glyph}
      </span>
      <p className="gate-title">{title}</p>
      <p className="gate-body">{body}</p>
      {action}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export function Tabs({
  items,
  active,
}: {
  items: Array<{ href: string; label: string }>;
  active: string;
}) {
  return (
    <nav className="tabs" aria-label="Sections">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="tab"
          aria-current={active === item.href ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
