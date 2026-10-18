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
  if (input.messagePolicy === 'nobody') return false;
  if (input.messagePolicy === 'connections') return input.connected;
  return true;
}
