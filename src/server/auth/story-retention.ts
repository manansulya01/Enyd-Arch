/** Stories are hidden at expiry and physically purged after this grace period. */
export const STORY_RETENTION_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export function storyPurgeCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - STORY_RETENTION_GRACE_MS);
}
