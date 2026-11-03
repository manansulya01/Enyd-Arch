'use server';

/**
 * Messages
 *
 * One-to-one conversations, small private groups (cap 12), and project rooms.
 * Membership is the only authorisation boundary: a conversation's rows are
 * invisible to anyone not in `conversation_members`.
 */
import { and, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '~db';
import {
  blocks,
  conversationMembers,
  conversations,
  files,
  matches,
  messages,
  userSettings,
  users,
} from '~db/schema';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { currentActor } from '~/server/auth/session';
import { acquire } from '~/server/auth/rate-limit';
import { verifyCsrf } from '~/server/csrf';

export async function startDirectConversation(
  otherUserId: string,
  csrfToken: string,
): Promise<ActionResult<{ conversationId: string }>> {
  const csrf = new FormData();
  csrf.set('__csrf', csrfToken);
  await verifyCsrf(csrf);

  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (otherUserId === actor.userId) return fail('You cannot message yourself.');

  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Slow down a moment before starting another conversation.');

  // A block in either direction is an absolute boundary for new conversations.
  const blocked = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerId, actor.userId), eq(blocks.blockedId, otherUserId)),
        and(eq(blocks.blockerId, otherUserId), eq(blocks.blockedId, actor.userId)),
      ),
    )
    .limit(1);
  if (blocked[0]) return fail('That member is not available.');

  // Respect the recipient's messaging policy.
  const [recipient] = await db
    .select({ id: users.id, messagePolicy: userSettings.messagePolicy })
    .from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(and(eq(users.id, otherUserId), eq(users.status, 'active'), isNull(users.removedAt)))
    .limit(1);
  if (!recipient) return fail('That member is not available.');
  if (recipient.messagePolicy === 'nobody') {
    return fail('That member is not accepting messages right now.');
  }
  if (recipient.messagePolicy === 'connections') {
    const [connection] = await db
      .select({ id: matches.id })
      .from(matches)
      .where(
        and(
          eq(matches.mode, 'friendship'),
          eq(matches.status, 'accepted'),
          or(
            and(eq(matches.userAId, actor.userId), eq(matches.userBId, otherUserId)),
            and(eq(matches.userAId, otherUserId), eq(matches.userBId, actor.userId)),
          ),
        ),
      )
      .limit(1);
    if (!connection) return fail('That member accepts messages from connections only.');
  }

  // Reuse an existing direct thread between the same pair.
  const mine = await db
    .select({ id: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.userId, actor.userId), isNull(conversationMembers.removedAt)));
  if (mine.length > 0) {
    const ids = mine.map((row) => row.id);
    const theirs = await db
      .select({ id: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.userId, otherUserId),
          isNull(conversationMembers.removedAt),
          inArray(conversationMembers.conversationId, ids),
        ),
      );
    for (const candidate of theirs) {
      const [meta] = await db
        .select({ kind: conversations.kind })
        .from(conversations)
        .where(and(eq(conversations.id, candidate.id), eq(conversations.kind, 'direct')))
        .limit(1);
      if (meta) return ok({ conversationId: candidate.id });
    }
  }

  const [created] = await db
    .insert(conversations)
    .values({ kind: 'direct', createdById: actor.userId })
    .returning({ id: conversations.id });

  await db.insert(conversationMembers).values([
    { conversationId: created!.id, userId: actor.userId, role: 'member' },
    { conversationId: created!.id, userId: otherUserId, role: 'member' },
  ]);

  revalidatePath('/messages');
  return ok({ conversationId: created!.id });
}

export async function createGroupConversation(
  input: { title: string; memberUserIds: string[] },
  csrfToken: string,
): Promise<ActionResult<{ conversationId: string }>> {
  const csrf = new FormData();
  csrf.set('__csrf', csrfToken);
  await verifyCsrf(csrf);

  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Slow down a moment.');

  const title = input.title.trim().slice(0, 120);
  if (title.length < 2) return fail('Give the group a name.');

  const memberIds = [...new Set(input.memberUserIds)].filter((id) => id !== actor.userId).slice(0, 11);
  if (memberIds.length === 0) return fail('Add at least one other member.');

  const found = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, memberIds), eq(users.status, 'active'), isNull(users.removedAt)));
  if (found.length !== memberIds.length) return fail('One of those members is not available.');

  const blockedPair = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerId, actor.userId), inArray(blocks.blockedId, memberIds)),
        and(inArray(blocks.blockerId, memberIds), eq(blocks.blockedId, actor.userId)),
      ),
    )
    .limit(1);
  if (blockedPair[0]) return fail('A group cannot be created with a member who has blocked you or whom you have blocked.');

  const [created] = await db
    .insert(conversations)
    .values({ kind: 'group', title, createdById: actor.userId })
    .returning({ id: conversations.id });

  await db.insert(conversationMembers).values([
    { conversationId: created!.id, userId: actor.userId, role: 'owner' },
    ...memberIds.map((id) => ({ conversationId: created!.id, userId: id, role: 'member' })),
  ]);

  revalidatePath('/messages');
  return ok({ conversationId: created!.id });
}

export async function sendMessage(
  _previous: ActionResult<{ messageId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ messageId: string }>> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) return fail('Sign in to send messages.');

  const conversationId = String(formData.get('conversationId') ?? '');
  const body = String(formData.get('body') ?? '').replace(/\r\n/g, '\n').trim().slice(0, 4000);
  const attachmentFileId = String(formData.get('attachmentFileId') ?? '') || null;

  if (!actor.capabilities.includes('message')) return fail('Messaging is not available for this account.');
  if (!conversationId) return fail('Missing conversation.');
  if (!body && !attachmentFileId) return fail('Write a message or attach a file.');

  // Membership first — no membership, no message, and no hint that the
  // conversation exists.
  const membership = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, actor.userId),
        isNull(conversationMembers.removedAt),
      ),
    )
    .limit(1);
  if (!membership[0]) return fail('You are not a member of that conversation.');

  const [conversation] = await db
    .select({ kind: conversations.kind })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), isNull(conversations.removedAt)))
    .limit(1);
  if (!conversation) return fail('That conversation is not available.');

  if (conversation.kind === 'direct') {
    const [otherMember] = await db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(and(
        eq(conversationMembers.conversationId, conversationId),
        ne(conversationMembers.userId, actor.userId),
        isNull(conversationMembers.removedAt),
      ))
      .limit(1);
    if (!otherMember) return fail('That conversation is not available.');
    const [blockedPair] = await db
      .select({ id: blocks.id })
      .from(blocks)
      .where(or(
        and(eq(blocks.blockerId, actor.userId), eq(blocks.blockedId, otherMember.userId)),
        and(eq(blocks.blockerId, otherMember.userId), eq(blocks.blockedId, actor.userId)),
      ))
      .limit(1);
    if (blockedPair) return fail('Messaging is unavailable for this conversation.');
  }

  if (attachmentFileId) {
    const [owned] = await db
      .select({ id: files.id })
      .from(files)
      .where(
        and(
          eq(files.id, attachmentFileId),
          eq(files.uploaderId, actor.userId),
          eq(files.state, 'clean'),
          isNull(files.removedAt),
        ),
      )
      .limit(1);
    if (!owned) return fail('That file is not available.');
  }

  const limiter = await acquire('message', actor.userId);
  if (!limiter.allowed) return fail('You are sending messages very quickly. Take a breath.');

  const [row] = await db
    .insert(messages)
    .values({ conversationId, senderId: actor.userId, body, attachmentFileId })
    .returning({ id: messages.id });

  await db
    .update(conversations)
    .set({ lastMessageAt: new Date(), lastMessagePreview: body.slice(0, 160) || 'Attachment' })
    .where(eq(conversations.id, conversationId));

  revalidatePath(`/messages/${conversationId}`);
  revalidatePath('/messages');
  return ok({ messageId: row!.id });
}
