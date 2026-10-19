'use server';

/**
 * Browser surface for messaging. The core logic in ./messages enforces
 * membership; these wrappers simply resolve the session so a client cannot
 * send as someone else.
 */
import { redirect } from 'next/navigation';
import { currentActor } from '~/server/auth/session';
import { verifyCsrf } from '~/server/csrf';
import type { ActionResult } from '~/lib/action-result';
import { createGroupConversation, sendMessage, startDirectConversation } from './messages';

export async function onStartDirect(otherUserId: string, csrf: string) {
  return startDirectConversation(otherUserId, csrf);
}

export async function onCreateGroup(input: { title: string; memberUserIds: string[]; csrf: string }) {
  return createGroupConversation(input);
}

export async function onSendMessage(
  input: {
    conversationId: string;
    body: string;
    attachmentFileId: string | null;
  },
  csrfToken: string,
): Promise<ActionResult<{ messageId: string }>> {
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const formData = new FormData();
  formData.set('__csrf', csrfToken);
  formData.set('conversationId', input.conversationId);
  formData.set('body', input.body);
  if (input.attachmentFileId) formData.set('attachmentFileId', input.attachmentFileId);

  // `sendMessage` verifies the CSRF token from the FormData it is handed, so
  // the structured call goes through the identical check.
  return sendMessage(null, formData);
}

export { verifyCsrf };
