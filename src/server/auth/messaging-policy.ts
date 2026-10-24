export type MessagePolicy = 'nobody' | 'connections' | 'members' | 'anyone' | string;

/** Pure policy decision shared by direct and group conversation creation. */
export function mayInitiateMessage(input: {
  senderId: string;
  recipientId: string;
  recipientActive: boolean;
  messagePolicy: MessagePolicy | null | undefined;
  blocked: boolean;
  connected: boolean;
}): boolean {
  if (!input.senderId || !input.recipientId || input.senderId === input.recipientId) return false;
  if (!input.recipientActive || input.blocked) return false;

  switch (input.messagePolicy) {
    case 'nobody':
      return false;
    case 'connections':
      return input.connected;
    case 'members':
    case 'anyone':
      return true;
    default:
      // Corrupt or future-unrecognised policy values must not silently open
      // a contact path. Add new policy values here deliberately.
      return false;
  }
}
