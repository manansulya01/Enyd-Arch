import 'server-only';
import { redirect } from 'next/navigation';
import { can, currentActor, type SessionActor } from './auth/session';
import { adminContextFor, type AdminContext } from './security/audit';

/**
 * Route guards.
 *
 * Layouts call these rather than checking `if (!actor)` inline, so the
 * redirect rules for signed-out, suspended, and not-yet-onboarded members live
 * in exactly one place.
 */

export interface GuardContext {
  actor: SessionActor;
  admin: AdminContext | null;
}

export async function requireMember(): Promise<GuardContext> {
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  if (actor.status !== 'active') {
    // `currentActor` already refuses non-active accounts, so reaching here means
    // the account changed state between the two reads.
    redirect('/sign-in');
  }

  const admin = await adminContextFor(actor.userId);
  return { actor, admin };
}

export async function requireOnboarded(): Promise<GuardContext> {
  const context = await requireMember();
  if (!context.actor.onboarded) redirect('/onboarding');
  return context;
}

export async function requireCapability(capability: string): Promise<GuardContext> {
  const context = await requireOnboarded();
  if (!can(context.actor, capability)) {
    redirect(`/?notice=${encodeURIComponent(`You do not have permission to ${capability.replace(/_/g, ' ')}.`)}`);
  }
  return context;
}

export async function requireAdmin(permission: string): Promise<GuardContext & { admin: AdminContext }> {
  const context = await requireOnboarded();
  if (!context.admin) redirect('/?notice=Administration+access+is+restricted.');
  if (!context.admin.permissions.includes(permission) && !context.admin.permissions.includes('*')) {
    redirect('/admin?notice=Your+administrative+role+does+not+include+that+permission.');
  }
  return context as GuardContext & { admin: AdminContext };
}

/** Silent variant for layouts that should render a gate page instead. */
export async function optionalMember(): Promise<SessionActor | null> {
  return currentActor();
}