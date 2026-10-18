const BASE_CAPABILITIES = [
  'post',
  'comment',
  'react',
  'bookmark',
  'message',
  'upload',
  'search',
  'join_project',
  'rsvp',
  'submit_game',
  'gallery_create',
  'review',
  'archive_contribute',
  'collect',
  'create_project',
  'connections',
  'connect_friendship',
  'connect_collaboration',
  'request_device_transfer',
] as const;

/** Pure policy function: safe to test without a database or Next.js request context. */
export function deriveCapabilities(input: {
  status: string;
  level: string;
  isMinor: boolean;
  onboarded: boolean;
  restricted: string[];
}): string[] {
  const capabilities = new Set<string>();
  if (input.status !== 'active') return [];

  capabilities.add('read');
  if (input.onboarded) for (const capability of BASE_CAPABILITIES) capabilities.add(capability);

  // Dating capability alone is not consent; the Connections service also
  // requires explicit per-mode opt-in and applies age-gap safety checks.
  if (!input.isMinor) capabilities.add('connections_dating');

  if (['contributor', 'creator', 'archivist', 'curator', 'inner_arch'].includes(input.level)) {
    capabilities.add('curate');
    capabilities.add('create_collection');
  }
  if (['archivist', 'curator', 'inner_arch'].includes(input.level)) {
    capabilities.add('archive_feature');
  }
  if (['curator', 'inner_arch'].includes(input.level)) {
    capabilities.add('invite');
    capabilities.add('propose');
  }
  if (input.level === 'inner_arch') {
    capabilities.add('inner_arch');
    capabilities.add('moderate_assist');
  }

  for (const restricted of input.restricted) capabilities.delete(restricted);
  return [...capabilities];
}
