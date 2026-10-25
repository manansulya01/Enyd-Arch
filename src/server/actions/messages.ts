'use server';

/**
 * Messages
 *
 * One-to-one conversations, small private groups (cap 12), and project rooms.
 * Membership is the only authorisation boundary: a conversation's rows are
 * invisible to anyone not in `conversation_members`.
 */
import { and, desc, eq, gt, inArray, isNull, or } from 'drizzle-orm';
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
  storageObjects,
  userSettings,
  users,
} from '~db/schema';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { can, currentActor } from '~/server/auth/session';
import { mayInitiateMessage } from '~/server/auth/messaging-policy';
import { acquire } from '~/server/auth/rate-limit';
import { normalizeGroupMembers } from '~/server/auth/group-policy';
import { normalizeMessageBody } from '~/server/auth/message-content';
import { isUuid } from '~/server/auth/identifiers';
import { verifyCsrf, verifyCsrfValue } from '~/server/csrf';

/** Blocks are symmetric for contact purposes: either member can close the path. */
async function pairIsBlocked(a: string, b: string): Promise<boolean> {
  const rows = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(or(
      and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)),
      and(eq(blocks.blockerId, b), eq(blocks.blockedId, a)),
    ))
    .limit(1);
  return Boolean(rows[0]);
}

/** Enforce the recipient's current policy at the server boundary, not just in UI. */
async function canStartDirectMessage(senderId: string, recipientId: string): Promise<boolean> {
  if (senderId === recipientId) return false;
  const blocked = await pairIsBlocked(senderId, recipientId);

  const [recipient] = await db
    .select({ id: users.id, messagePolicy: userSettings.messagePolicy })
    .from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(and(eq(users.id, recipientId), eq(users.status, 'active'), isNull(users.removedAt)))
    .limit(1);

  const [connection] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(
      eq(matches.status, 'accepted'),
      or(
        and(eq(matches.userAId, senderId), eq(matches.userBId, recipientId)),
        and(eq(matches.userAId, recipientId), eq(matches.userBId, senderId)),
      ),
    ))
    .limit(1);

  return mayInitiateMessage({
    senderId,
    recipientId,
    recipientActive: Boolean(recipient),
    messagePolicy: recipient?.messagePolicy,
    blocked,
    connected: Boolean(connection),
  });
}

export async function startDirectConversation(
  otherUserId: string,
  csrf: string,
): Promise<ActionResult<{ conversationId: string }>> {
  await verifyCsrfValue(csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'message')) return fail('Messaging is not available for this identity.');
  if (!isUuid(otherUserId)) return fail('That member is not available.');
  if (otherUserId === actor.userId) return fail('You cannot message yourself.');

  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('You are starting conversations too quickly. Wait a little while.');

  if (!(await canStartDirectMessage(actor.userId, otherUserId))) {
    return fail('That member is not available for a new conversation.');
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
        .where(and(
          eq(conversations.id, candidate.id),
          eq(conversations.kind, 'direct'),
          isNull(conversations.removedAt),
        ))
        .limit(1);
      if (meta) {
        const participants = await db
          .select({ userId: conversationMembers.userId })
          .from(conversationMembers)
          .where(and(
            eq(conversationMembers.conversationId, candidate.id),
            isNull(conversationMembers.removedAt),
          ));
        if (
          participants.length === 2 &&
          participants.some((member) => member.userId === actor.userId) &&
          participants.some((member) => member.userId === otherUserId)
        ) {
          return ok({ conversationId: candidate.id });
        }
      }
    }
  }

  const created = await db.transaction(async (tx) => {
    const [conversation] = await tx
      .insert(conversations)
      .values({ kind: 'direct', createdById: actor.userId })
      .returning({ id: conversations.id });
    if (!conversation) throw new Error('Direct conversation creation failed.');
    await tx.insert(conversationMembers).values([
      { conversationId: conversation.id, userId: actor.userId, role: 'member' },
      { conversationId: conversation.id, userId: otherUserId, role: 'member' },
    ]);
    return conversation;
  });

  revalidatePath('/messages');
  return ok({ conversationId: created.id });
}

export async function createGroupConversation(input: {
  title: string;
  memberUserIds: string[];
  csrf: string;
}): Promise<ActionResult<{ conversationId: string }>> {
  await verifyCsrfValue(input?.csrf);
  if (!input || typeof input !== 'object' || typeof input.title !== 'string' || !Array.isArray(input.memberUserIds)) {
    return fail('That group request is not valid.');
  }
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'message')) return fail('Messaging is not available for this identity.');

  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Slow down a moment.');

  const title = input.title.trim().slice(0, 120);
  if (title.length < 2) return fail('Give the group a name.');

  const selection = normalizeGroupMembers(actor.userId, input.memberUserIds);
  if (!selection.ok) return fail(selection.reason);
  const memberIds = selection.memberIds;
  if (!memberIds.every(isUuid)) return fail('One of those members is not available.');

  const found = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, memberIds), eq(users.status, 'active'), isNull(users.removedAt)));
  if (found.length !== memberIds.length) return fail('One of those members is not available.');

  // A group invite is still a new contact path. Respect each invitee's policy
  // so "nobody" and "connections only" cannot be bypassed through group creation.
  for (const memberId of memberIds) {
    if (!(await canStartDirectMessage(actor.userId, memberId))) {
      return fail('One of those members is not available for this conversation.');
    }
  }

  const created = await db.transaction(async (tx) => {
    const [conversation] = await tx
      .insert(conversations)
      .values({ kind: 'group', title, createdById: actor.userId })
      .returning({ id: conversations.id });
    if (!conversation) throw new Error('Group conversation creation failed.');
    await tx.insert(conversationMembers).values([
      { conversationId: conversation.id, userId: actor.userId, role: 'owner' },
      ...memberIds.map((id) => ({ conversationId: conversation.id, userId: id, role: 'member' })),
    ]);
    return conversation;
  });

  revalidatePath('/messages');
  return ok({ conversationId: created.id });
}

/** Rename a small group; only its current owner may change its title. */
export async function renameGroupConversation(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'message')) redirect('/messages?error=unavailable');

  const conversationId = String(formData.get('conversationId') ?? '');
  const title = String(formData.get('title') ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!isUuid(conversationId) || title.length < 2) redirect('/messages?error=invalid-group');

  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) redirect('/messages?error=slow-down');

  const allowed = await db.transaction(async (tx) => {
    const [conversation] = await tx.select({ id: conversations.id, kind: conversations.kind })
      .from(conversations).where(and(
        eq(conversations.id, conversationId),
        isNull(conversations.removedAt),
      )).for('update').limit(1);
    if (!conversation || conversation.kind !== 'group') return false;
    const [membership] = await tx.select({ role: conversationMembers.role })
      .from(conversationMembers).where(and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, actor.userId),
        isNull(conversationMembers.removedAt),
      )).limit(1);
    if (membership?.role !== 'owner') return false;
    await tx.update(conversations).set({ title }).where(eq(conversations.id, conversationId));
    return true;
  });
  if (!allowed) redirect('/messages?error=not-allowed');
  revalidatePath('/messages');
  redirect(`/messages?c=${conversationId}&updated=1`);
}

/** Transfer group ownership to a current, active member without changing membership. */
export async function transferGroupOwnership(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'message')) redirect('/messages?error=unavailable');

  const conversationId = String(formData.get('conversationId') ?? '');
  const targetUserId = String(formData.get('targetUserId') ?? '');
  if (!isUuid(conversationId) || !isUuid(targetUserId) || targetUserId === actor.userId ||
      formData.get('confirmTransfer') !== 'on') redirect('/messages?error=invalid-transfer');

  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) redirect('/messages?error=slow-down');

  const allowed = await db.transaction(async (tx) => {
    const [conversation] = await tx.select({ id: conversations.id, kind: conversations.kind })
      .from(conversations).where(and(
        eq(conversations.id, conversationId),
        isNull(conversations.removedAt),
      )).for('update').limit(1);
    if (!conversation || conversation.kind !== 'group') return false;
    const [owner] = await tx.select({ role: conversationMembers.role })
      .from(conversationMembers).where(and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, actor.userId),
        isNull(conversationMembers.removedAt),
      )).limit(1);
    if (owner?.role !== 'owner') return false;
    const [target] = await tx.select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .innerJoin(users, eq(users.id, conversationMembers.userId))
      .where(and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, targetUserId),
        isNull(conversationMembers.removedAt),
        eq(users.status, 'active'),
        isNull(users.removedAt),
      )).for('update').limit(1);
    if (!target) return false;
    await tx.update(conversationMembers).set({ role: 'member' }).where(and(
      eq(conversationMembers.conversationId, conversationId),
      eq(conversationMembers.userId, actor.userId),
    ));
    await tx.update(conversationMembers).set({ role: 'owner' }).where(and(
      eq(conversationMembers.conversationId, conversationId),
      eq(conversationMembers.userId, targetUserId),
    ));
    return true;
  });
  if (!allowed) redirect('/messages?error=not-allowed');
  revalidatePath('/messages');
  redirect(`/messages?c=${conversationId}&ownership=transferred`);
}

/** Remove a current non-owner member from a group; history is retained for remaining members. */
export async function removeGroupMember(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'message')) redirect('/messages?error=unavailable');

  const conversationId = String(formData.get('conversationId') ?? '');
  const targetUserId = String(formData.get('targetUserId') ?? '');
  if (!isUuid(conversationId) || !isUuid(targetUserId) || targetUserId === actor.userId ||
      formData.get('confirmRemove') !== 'on') redirect('/messages?error=invalid-removal');

  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) redirect('/messages?error=slow-down');

  const removed = await db.transaction(async (tx) => {
    const [conversation] = await tx.select({ id: conversations.id, kind: conversations.kind })
      .from(conversations).where(and(
        eq(conversations.id, conversationId),
        isNull(conversations.removedAt),
      )).for('update').limit(1);
    if (!conversation || conversation.kind !== 'group') return false;
    const [owner] = await tx.select({ role: conversationMembers.role })
      .from(conversationMembers).where(and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, actor.userId),
        isNull(conversationMembers.removedAt),
      )).limit(1);
    if (owner?.role !== 'owner') return false;
    const [target] = await tx.select({ role: conversationMembers.role })
      .from(conversationMembers).where(and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, targetUserId),
        isNull(conversationMembers.removedAt),
      )).for('update').limit(1);
    if (!target || target.role === 'owner') return false;
    await tx.update(conversationMembers).set({ removedAt: new Date() }).where(and(
      eq(conversationMembers.conversationId, conversationId),
      eq(conversationMembers.userId, targetUserId),
      isNull(conversationMembers.removedAt),
    ));
    return true;
  });
  if (!removed) redirect('/messages?error=not-allowed');
  revalidatePath('/messages');
  redirect(`/messages?c=${conversationId}&memberRemoved=1`);
}

/** Leave a group; the owner must transfer ownership first unless closing an empty group. */
export async function leaveGroupConversation(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'message')) redirect('/messages?error=unavailable');

  const conversationId = String(formData.get('conversationId') ?? '');
  if (!isUuid(conversationId) || formData.get('confirmLeave') !== 'on') {
    redirect('/messages?error=invalid-leave');
  }
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) redirect('/messages?error=slow-down');

  const outcome = await db.transaction(async (tx) => {
    const [conversation] = await tx.select({ id: conversations.id, kind: conversations.kind })
      .from(conversations).where(and(
        eq(conversations.id, conversationId),
        isNull(conversations.removedAt),
      )).for('update').limit(1);
    if (!conversation || conversation.kind !== 'group') return 'unavailable' as const;
    const [membership] = await tx.select({ role: conversationMembers.role })
      .from(conversationMembers).where(and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, actor.userId),
        isNull(conversationMembers.removedAt),
      )).limit(1);
    if (!membership) return 'unavailable' as const;
    const others = await tx.select({ userId: conversationMembers.userId })
      .from(conversationMembers).where(and(
        eq(conversationMembers.conversationId, conversationId),
        isNull(conversationMembers.removedAt),
      ));
    if (membership.role === 'owner' && others.some((member) => member.userId !== actor.userId)) {
      return 'transfer-first' as const;
    }
    const now = new Date();
    await tx.update(conversationMembers).set({ removedAt: now }).where(and(
      eq(conversationMembers.conversationId, conversationId),
      eq(conversationMembers.userId, actor.userId),
    ));
    if (membership.role === 'owner') {
      await tx.update(conversations).set({ removedAt: now }).where(eq(conversations.id, conversationId));
      return 'closed' as const;
    }
    return 'left' as const;
  });
  if (outcome === 'transfer-first') redirect(`/messages?c=${conversationId}&error=transfer-first`);
  if (outcome === 'unavailable') redirect('/messages?error=not-allowed');
  revalidatePath('/messages');
  redirect('/messages?left=1');
}

export async function sendMessage(
  _previous: ActionResult<{ messageId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ messageId: string }>> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) return fail('Sign in to send messages.');
  if (!can(actor, 'message')) return fail('Messaging is not available for this identity.');

  const conversationId = String(formData.get('conversationId') ?? '');
  const body = normalizeMessageBody(formData.get('body'));
  const attachmentFileId = String(formData.get('attachmentFileId') ?? '') || null;
  const replyToId = String(formData.get('replyToId') ?? '') || null;

  if (!isUuid(conversationId)) return fail('That conversation is not available.');
  if (attachmentFileId && !isUuid(attachmentFileId)) return fail('That file is not available.');
  if (replyToId && !isUuid(replyToId)) return fail('That message is not available to reply to.');
  if (!body && !attachmentFileId) return fail('Write a message or attach a file.');

  // Membership first — no membership, no message, and no hint that the
  // conversation exists.
  const membership = await db
    .select({ userId: conversationMembers.userId, kind: conversations.kind })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, actor.userId),
        isNull(conversationMembers.removedAt),
        isNull(conversations.removedAt),
      ),
    )
    .limit(1);
  if (!membership[0]) return fail('You are not a member of that conversation, or it is no longer available.');

  const participants = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(and(
      eq(conversationMembers.conversationId, conversationId),
      isNull(conversationMembers.removedAt),
    ));
  const otherMembers = participants.map((member) => member.userId).filter((id) => id !== actor.userId);

  if (membership[0].kind === 'direct') {
    // A direct thread must have exactly one other active membership. Treat
    // corrupted or partially migrated membership sets as unavailable rather
    // than accidentally applying the recipient policy to only one person.
    const recipientId = otherMembers.length === 1 ? otherMembers[0] : null;
    if (!recipientId || !(await canStartDirectMessage(actor.userId, recipientId))) {
      return fail('Messaging is no longer available for this conversation.');
    }
  } else {
    for (const memberId of otherMembers) {
      if (await pairIsBlocked(actor.userId, memberId)) {
        return fail('This conversation includes a member you cannot contact.');
      }
    }
  }

  if (replyToId) {
    const [replyTarget] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(
        eq(messages.id, replyToId),
        eq(messages.conversationId, conversationId),
        isNull(messages.removedAt),
      ))
      .limit(1);
    if (!replyTarget) return fail('That message is no longer available to reply to.');
  }

  if (attachmentFileId) {
    const [owned] = await db
      .select({ id: files.id })
      .from(files)
      .innerJoin(storageObjects, eq(storageObjects.id, files.storageObjectId))
      .where(and(
        eq(files.id, attachmentFileId),
        eq(files.uploaderId, actor.userId),
        eq(files.state, 'clean'),
        isNull(files.removedAt),
        isNull(storageObjects.removedAt),
      ))
      .limit(1);
    if (!owned) return fail('That file is not available.');
  }

  const limiter = await acquire('message', actor.userId);
  if (!limiter.allowed) return fail('You are sending messages very quickly. Take a breath.');

  const [row] = await db
    .insert(messages)
    .values({ conversationId, senderId: actor.userId, body, attachmentFileId, replyToId })
    .returning({ id: messages.id });

  await db
    .update(conversations)
    .set({ lastMessageAt: new Date(), lastMessagePreview: body.slice(0, 160) || 'Attachment' })
    .where(eq(conversations.id, conversationId));

  revalidatePath(`/messages/${conversationId}`);
  revalidatePath('/messages');
  return ok({ messageId: row!.id });
}


const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

export async function editMessage(input: {
  messageId: string;
  body: string;
  csrf: string;
}): Promise<ActionResult> {
  await verifyCsrfValue(input?.csrf);
  if (!input || !isUuid(input.messageId)) return fail('That message is not available.');
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'message')) return fail('Messaging is not available for this identity.');
  const body = normalizeMessageBody(input.body);
  if (!body) return fail('A message cannot be empty.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Please wait before editing another message.');

  const cutoff = new Date(Date.now() - MESSAGE_EDIT_WINDOW_MS);
  const target = await db.transaction(async (tx) => {
    const [row] = await tx.select({
      id: messages.id,
      conversationId: messages.conversationId,
      createdAt: messages.createdAt,
    })
      .from(messages)
      .innerJoin(conversations, and(
        eq(conversations.id, messages.conversationId),
        isNull(conversations.removedAt),
      ))
      .innerJoin(conversationMembers, and(
        eq(conversationMembers.conversationId, messages.conversationId),
        eq(conversationMembers.userId, actor.userId),
        isNull(conversationMembers.removedAt),
      ))
      .where(and(
        eq(messages.id, input.messageId),
        eq(messages.senderId, actor.userId),
        isNull(messages.removedAt),
        gt(messages.createdAt, cutoff),
      ))
      .for('update')
      .limit(1);
    if (!row) return null;
    await tx.update(messages).set({ body, editedAt: new Date() })
      .where(and(
        eq(messages.id, row.id),
        eq(messages.senderId, actor.userId),
        isNull(messages.removedAt),
      ));
    const [latest] = await tx.select({
      id: messages.id,
      body: messages.body,
      attachmentFileId: messages.attachmentFileId,
    })
      .from(messages)
      .where(and(
        eq(messages.conversationId, row.conversationId),
        isNull(messages.removedAt),
      ))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    if (latest?.id === row.id) {
      await tx.update(conversations)
        .set({ lastMessagePreview: body.slice(0, 160) || (latest.attachmentFileId ? 'Attachment' : 'Message') })
        .where(eq(conversations.id, row.conversationId));
    }
    return row;
  });
  if (!target) return fail('That message cannot be edited. Only your recent messages can be edited.');
  revalidatePath('/messages');
  revalidatePath(`/messages?c=${target.conversationId}`);
  return ok();
}

export async function removeMessage(input: {
  messageId: string;
  csrf: string;
}): Promise<ActionResult> {
  await verifyCsrfValue(input?.csrf);
  if (!input || !isUuid(input.messageId)) return fail('That message is not available.');
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'message')) return fail('Messaging is not available for this identity.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Please wait before removing another message.');

  const target = await db.transaction(async (tx) => {
    const [row] = await tx.select({
      id: messages.id,
      conversationId: messages.conversationId,
      createdAt: messages.createdAt,
    })
      .from(messages)
      .innerJoin(conversations, and(
        eq(conversations.id, messages.conversationId),
        isNull(conversations.removedAt),
      ))
      .innerJoin(conversationMembers, and(
        eq(conversationMembers.conversationId, messages.conversationId),
        eq(conversationMembers.userId, actor.userId),
        isNull(conversationMembers.removedAt),
      ))
      .where(and(
        eq(messages.id, input.messageId),
        eq(messages.senderId, actor.userId),
        isNull(messages.removedAt),
      ))
      .for('update')
      .limit(1);
    if (!row) return null;
    await tx.update(messages).set({ removedAt: new Date(), body: '' })
      .where(and(
        eq(messages.id, row.id),
        eq(messages.senderId, actor.userId),
        isNull(messages.removedAt),
      ));
    const [latest] = await tx.select({
      body: messages.body,
      attachmentFileId: messages.attachmentFileId,
      createdAt: messages.createdAt,
    })
      .from(messages)
      .where(and(
        eq(messages.conversationId, row.conversationId),
        isNull(messages.removedAt),
      ))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    await tx.update(conversations)
      .set({
        lastMessageAt: latest?.createdAt ?? null,
        lastMessagePreview: latest?.body.slice(0, 160) || (latest?.attachmentFileId ? 'Attachment' : 'No messages yet'),
      })
      .where(eq(conversations.id, row.conversationId));
    return row;
  });
  if (!target) return fail('That message cannot be removed.');
  revalidatePath('/messages');
  revalidatePath(`/messages?c=${target.conversationId}`);
  return ok();
}


/** Mark a conversation as read only for its authenticated active member. */
export async function markConversationRead(input: {
  conversationId: string;
  csrf: string;
}): Promise<ActionResult> {
  await verifyCsrfValue(input?.csrf);
  if (!input || !isUuid(input.conversationId)) return fail('That conversation is not available.');
  const actor = await currentActor();
  if (!actor) return fail('Sign in to update message read state.');
  if (!can(actor, 'message')) return fail('Messaging is not available for this identity.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Please wait before updating read state again.');

  const [member] = await db.select({
    conversationId: conversationMembers.conversationId,
  })
    .from(conversationMembers)
    .innerJoin(conversations, and(
      eq(conversations.id, conversationMembers.conversationId),
      isNull(conversations.removedAt),
    ))
    .where(and(
      eq(conversationMembers.conversationId, input.conversationId),
      eq(conversationMembers.userId, actor.userId),
      isNull(conversationMembers.removedAt),
    ))
    .limit(1);

  if (!member) return fail('That conversation is not available.');
  await db.update(conversationMembers)
    .set({ lastReadAt: new Date() })
    .where(and(
      eq(conversationMembers.conversationId, member.conversationId),
      eq(conversationMembers.userId, actor.userId),
      isNull(conversationMembers.removedAt),
    ));
  revalidatePath('/messages');
  revalidatePath(`/messages?c=${member.conversationId}`);
  return ok();
}
