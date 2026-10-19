/**
 * Pure validation for small private groups. Keep this shared with tests so
 * the server never silently drops selected participants or admits duplicates.
 */
export const MAX_GROUP_MEMBERS_EXCLUDING_OWNER = 11;

export type GroupMemberSelection =
  | { ok: true; memberIds: string[] }
  | { ok: false; reason: string };

export function normalizeGroupMembers(
  ownerId: string,
  requestedIds: readonly string[],
): GroupMemberSelection {
  if (!Array.isArray(requestedIds)) {
    return { ok: false, reason: 'Choose at least one other member.' };
  }

  const memberIds = [...new Set(requestedIds.filter((id) => id !== ownerId))];
  if (memberIds.length === 0) {
    return { ok: false, reason: 'Add at least one other member.' };
  }
  if (memberIds.length > MAX_GROUP_MEMBERS_EXCLUDING_OWNER) {
    return { ok: false, reason: 'A private group can have at most 12 members, including you.' };
  }
  if (memberIds.some((id) => typeof id !== 'string' || id.length === 0 || id.length > 100)) {
    return { ok: false, reason: 'One of those members is not available.' };
  }

  return { ok: true, memberIds };
}
