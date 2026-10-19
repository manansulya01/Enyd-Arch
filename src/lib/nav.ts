import { MARK, formatMemberId } from './domain';
import type { SessionActor } from '../server/auth/session';
import type { AdminContext } from '../server/security/audit';

/**
 * Navigation
 *
 * The rail is grouped by what a member is trying to do, not by database table:
 * your own corner, what exists to be read, what exists to be built, and the
 * society layer that sits above all of it.
 */

export interface NavItem {
  href: string;
  label: string;
  glyph: string;
  /** Capabilities required to see this entry */
  requires?: string[];
  /** Administrative permission required to see this entry */
  adminPermission?: string;
  badge?: number;
  /** Whether the item belongs to the primary (mobile) set */
  primary?: boolean;
  description?: string;
}

export const GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Your Arch',
    items: [
      { href: '/home', label: 'Home', glyph: '◈', primary: true },
      { href: '/commons', label: 'The Commons', glyph: '❝', primary: true, requires: ['post'] },
      { href: '/messages', label: 'Messages', glyph: '✉', requires: ['message'], description: 'Conversations' },
      { href: '/notifications', label: 'Notifications', glyph: '◔' },
    ],
  },
  {
    label: 'Discover',
    items: [
      { href: '/archive', label: 'The Archive', glyph: '▤', primary: true, description: 'Everything interesting' },
      { href: '/arcade', label: 'The Arcade', glyph: '◱', description: 'Play what members build' },
      { href: '/gallery', label: 'The Gallery', glyph: '❖', description: 'Creative work' },
      { href: '/network', label: 'The Network', glyph: '◌', description: 'Find members' },
      { href: '/communities', label: 'Communities', glyph: '▦', requires: ['post'], description: 'Join topic-based spaces' },
      { href: '/events', label: 'Events', glyph: '✧', description: 'Gatherings' },
      { href: '/cinema', label: 'The Cinema', glyph: '◐', description: 'Films and watch nights' },
      { href: '/music', label: 'Music', glyph: '♫', requires: ['upload'], description: 'Your private audio library' },
      { href: '/connections', label: 'Connections', glyph: '◇', primary: true },
    ],
  },
  {
    label: 'Build',
    items: [
      { href: '/exchange', label: 'The Exchange', glyph: '⇄', requires: ['upload'], description: 'Upload and share' },
      { href: '/projects', label: 'Projects', glyph: '⌘', description: 'Rooms and tasks' },
    ],
  },
  {
    label: 'Society',
    items: [
      { href: '/chronicle', label: 'The Chronicle', glyph: '✦', description: 'Our history' },
      { href: '/registry', label: 'The Registry', glyph: '❒', description: 'Levels and standing' },
      { href: '/inner-arch', label: 'The Inner Arch', glyph: '✦', requires: ['inner_arch'] },
      { href: '/admin', label: 'Administration', glyph: '⚿', adminPermission: 'reports.read' },
    ],
  },
];

/** Mobile set: Home · Commons · Archive · Connections · Me */
export const PRIMARY_NAV: NavItem[] = [
  { href: '/home', label: 'Home', glyph: '◈', primary: true },
  { href: '/commons', label: 'Commons', glyph: '❝', primary: true },
  { href: '/archive', label: 'Archive', glyph: '▤', primary: true },
  { href: '/connections', label: 'Connections', glyph: '◇', primary: true },
  { href: '/me', label: 'Me', glyph: '◑', primary: true },
];

export function visibleGroups(
  actor: SessionActor,
  admin: AdminContext | null,
): Array<{ label: string; items: NavItem[] }> {
  return GROUPS.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => {
      if (item.adminPermission) {
        return Boolean(admin?.permissions.some((permission) =>
          permission === '*' || permission === item.adminPermission,
        ));
      }
      if (!item.requires) return true;
      return item.requires.every((capability) => actor.capabilities.includes(capability));
    }),
  }))
    .filter((group) => group.items.length > 0);
}

/**
 * Whether a nav entry is the current page.
 *
 * Exact match for top-level routes; prefix match for their children, so the
 * Commons stays lit while you are reading a conversation inside it.
 */
export function isCurrent(pathname: string, href: string): boolean {
  if (href === '/home') return pathname === '/home';
  if (href === '/me') return pathname === '/me' || pathname.startsWith('/me/');
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function memberLabel(actor: SessionActor): string {
  return actor.displayName || actor.username;
}

export function memberNumber(actor: SessionActor): string {
  return formatMemberId(actor.memberId);
}

export { MARK };