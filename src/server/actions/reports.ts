'use server';

/** Reports — every member can flag anything; nothing auto-acts invisibly. */
import { redirect } from 'next/navigation';
import { db } from '~db';
import { reports } from '~db/schema';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { currentActor } from '~/server/auth/session';
import { acquire } from '~/server/auth/rate-limit';
import { verifyCsrf } from '~/server/csrf';
import { REPORT_REASONS, URGENT_REPORT_REASONS } from '~/lib/domain';

const REASONS = new Set<string>(REPORT_REASONS.map((reason) => reason.value));
const TARGETS = new Set(['user', 'post', 'comment', 'message', 'archive_object', 'game', 'gallery_post', 'event', 'project']);

export async function createReport(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const limiter = await acquire('report', actor.userId);
  if (!limiter.allowed) return fail('You have filed several reports recently. If something is urgent, contact Administration directly.');

  const targetType = String(formData.get('targetType') ?? '');
  const targetId = String(formData.get('targetId') ?? '');
  const reason = String(formData.get('reason') ?? '');
  const detail = String(formData.get('detail') ?? '').trim().slice(0, 4000);

  if (!TARGETS.has(targetType)) return fail('Unknown report target.');
  if (!/^[0-9a-f-]{36}$/i.test(targetId)) return fail('Missing target.');
  if (!REASONS.has(reason)) return fail('Choose a reason.', { reason: ['Required.'] });

  const priority = URGENT_REPORT_REASONS.has(reason) ? 'urgent' : 'normal';

  await db.insert(reports).values({
    reporterId: actor.userId,
    targetType: targetType as never,
    targetId,
    reason: reason as never,
    detail,
    priority,
  });

  return ok();
}
