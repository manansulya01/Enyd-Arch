import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '~db';
import { notifications, userSettings } from '~db/schema';

/**
 * Notifications
 *
 * Every notification is written through here so the per-member preference is
 * always consulted, and so self-notification is impossible by construction
 * rather than by remembering to check.
 *
 * Preferences are read with a single cached-per-request memo because a single
 * action can generate several notifications for the same recipient.
 */

export type NotificationKind =
  | 'message'
  | 'reply'
  | 'mention'
  | 'reaction'
  | 'repost'
  | 'connection_request'
  | 'connection_match'
  | 'project_invite'
  | 'event_invite'
  | 'event_reminder'
  | 'file_interaction'
  | 'game_published'
  | 'moderation'
  | 'level_change'
  | 'inner_arch_invite'
  | 'achievement'
  | 'system';

/** Which preference switch governs each kind. */
const PREFERENCE_COLUMN: Partial<Record<NotificationKind, keyof typeof userSettings.$inferInsert>> = {
  message: 'notifyOnMessage',
  reply: 'notifyOnReply',
  mention: 'notifyOnMention',
  reaction: 'notifyOnReaction',
  connection_request: 'notifyOnConnection',
  connection_match: 'notifyOnConnection',
  project_invite: 'notifyOnProject',
  event_invite: 'notifyOnEvent',
  event_reminder: 'notifyOnEvent',
  file_interaction: 'notifyOnFile',
  moderation: 'notifyOnModeration',
};

/**
 * Moderation notices bypass the preference switch. A member who has turned off
 * reactive notifications still has to be told that their account was suspended.
 */
const ALWAYS_DELIVER: NotificationKind[] = [
  'moderation',
  'level_change',
  'inner_arch_invite',
  'system',
];

export interface NotifyInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
  actorId?: string | null;
  targetType?: string;
  targetId?: string;
}

const preferenceCache = new Map<string, Set<NotificationKind>>();

async function suppressedKinds(userId: string): Promise<Set<NotificationKind>> {
  const cached = preferenceCache.get(userId);
  if (cached) return cached;

  const rows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const settings = rows[0];
  const suppressed = new Set<NotificationKind>();

  if (settings) {
    for (const [kind, column] of Object.entries(PREFERENCE_COLUMN) as Array<
      [NotificationKind, keyof typeof settings]
    >) {
      if (settings[column] === false) suppressed.add(kind);
    }
  }

  preferenceCache.set(userId, suppressed);
  return suppressed;
}

/** Clears the memo after a settings change so the next write re-reads them. */
export function invalidatePreferences(userId?: string): void {
  if (userId) preferenceCache.delete(userId);
  else preferenceCache.clear();
}

export async function notify(input: NotifyInput): Promise<boolean> {
  // Never notify someone about their own action.
  if (input.actorId && input.actorId === input.userId) return false;

  if (!ALWAYS_DELIVER.includes(input.kind)) {
    const suppressed = await suppressedKinds(input.userId);
    if (suppressed.has(input.kind)) return false;
  }

  await db.insert(notifications).values({
    userId: input.userId,
    kind: input.kind,
    title: input.title.slice(0, 180),
    body: (input.body ?? '').slice(0, 500),
    href: input.href ?? null,
    actorId: input.actorId ?? null,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
  });

  return true;
}

/** Bulk fan-out, used by event reminders and project invitations. */
export async function notifyMany(inputs: NotifyInput[]): Promise<number> {
  const distinct = [...new Map(inputs.map((input) => [`${input.userId}:${input.kind}`, input])).values()];
  let sent = 0;
  for (const input of distinct) {
    if (await notify(input)) sent += 1;
  }
  return sent;
}

export async function markRead(userId: string, notificationId: string): Promise<boolean> {
  const [row] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId),
        sql`${notifications.readAt} is null`,
      ),
    )
    .returning({ id: notifications.id });
  return Boolean(row);
}

export async function markAllRead(userId: string): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), sql`${notifications.readAt} is null`))
    .returning({ id: notifications.id });
  return rows.length;
}

export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), sql`${notifications.readAt} is null`));
  return Number(row?.count ?? 0);
}

export const NOTIFICATION_GLYPHS: Record<NotificationKind, string> = {
  message: '✉',
  reply: '❝',
  mention: '@',
  reaction: '✦',
  repost: '⇄',
  connection_request: '◇',
  connection_match: '◈',
  project_invite: '⌘',
  event_invite: '✧',
  event_reminder: '✧',
  file_interaction: '⇄',
  game_published: '◱',
  moderation: '⚿',
  level_change: '✦',
  inner_arch_invite: '✦',
  achievement: '❖',
  system: '◈',
};

export const NOTIFICATION_LABELS: Record<NotificationKind, string> = {
  message: 'Messages',
  reply: 'Replies',
  mention: 'Mentions',
  reaction: 'Reactions',
  repost: 'Reposts',
  connection_request: 'Connection requests',
  connection_match: 'Matches',
  project_invite: 'Project invitations',
  event_invite: 'Event invitations',
  event_reminder: 'Event reminders',
  file_interaction: 'File activity',
  game_published: 'Arcade',
  moderation: 'Moderation',
  level_change: 'Standing',
  inner_arch_invite: 'The Inner Arch',
  achievement: 'Achievements',
  system: 'System',
};