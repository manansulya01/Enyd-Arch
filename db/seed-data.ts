/**
 * Catalogue data for the seed. Kept out of the seed script so the script reads
 * as orchestration rather than a wall of constants.
 */

export const ACHIEVEMENT_DEFS = [
  { key: 'first_post', label: 'First Words', description: 'Posted in The Commons for the first time.', glyph: '◈' },
  { key: 'first_upload', label: 'First Exchange', description: 'Uploaded a file to the Exchange.', glyph: '⇄' },
  { key: 'first_archive', label: 'First Catalogued', description: 'Contributed an object to The Archive.', glyph: '▤' },
  { key: 'first_game', label: 'First Release', description: 'Published an approved game in The Arcade.', glyph: '◱' },
  { key: 'curator', label: 'Curator', description: 'Had a collection featured by staff.', glyph: '❖' },
  { key: 'host', label: 'Host', description: 'Hosted an event.', glyph: '✧' },
  { key: 'collector', label: 'Collector', description: 'Bookmarked ten things.', glyph: '❒' },
  { key: 'night_owl', label: 'Night Owl', description: 'Posted between midnight and five.', glyph: '◔' },
  { key: 'early_bird', label: 'Early Bird', description: 'Posted before eight in the morning.', glyph: '◉' },
  { key: 'archivist', label: 'Archivist', description: 'Reached Archivist standing.', glyph: '❖' },
  { key: 'inner_arch', label: 'Inner Arch', description: 'Invited into The Inner Arch.', glyph: '✦', hidden: true },
];
