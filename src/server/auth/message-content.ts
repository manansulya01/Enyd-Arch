/** Normalize untrusted message text consistently for sends and edits. */
export function normalizeMessageBody(value: unknown, maxLength = 4000): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n?/g, '\n').trim().slice(0, maxLength);
}
