'use server';

import { currentActor } from '~/server/auth/session';
import { verifyCsrf } from '~/server/csrf';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { createRegistryItem, deleteRegistryItem, getRegistryItemById, getRegistryItems, updateRegistryItem } from './registry';

/**
 * Client-side wrapper for creating a registry item.
 * Expects a FormData with fields: title, description, details (optional), and __csrf.
 */
export async function onCreateRegistryItem(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const actor = await currentActor();
  if (!actor) {
    return fail('Sign in to create a registry item.');
  }

  // Verify CSRF token
  await verifyCsrf(formData);

  const data = {
    title: String(formData.get('title') ?? ''),
    description: String(formData.get('description') ?? ''),
    details: String(formData.get('details') ?? ''),
  };

  return createRegistryItem(data);
}

/**
 * Client-side wrapper for updating a registry item.
 * Expects a FormData with fields: id, title, description, details (optional), and __csrf.
 */
export async function onUpdateRegistryItem(formData: FormData): Promise<ActionResult<void>> {
  const actor = await currentActor();
  if (!actor) {
    return fail('Sign in to update a registry item.');
  }

  // Verify CSRF token
  await verifyCsrf(formData);

  const id = String(formData.get('id') ?? '');
  const data = {
    title: String(formData.get('title') ?? ''),
    description: String(formData.get('description') ?? ''),
    details: String(formData.get('details') ?? ''),
  };

  return updateRegistryItem(id, data);
}

/**
 * Client-side wrapper for deleting a registry item.
 * Expects a FormData with fields: id and __csrf.
 */
export async function onDeleteRegistryItem(formData: FormData): Promise<ActionResult<void>> {
  const actor = await currentActor();
  if (!actor) {
    return fail('Sign in to delete a registry item.');
  }

  // Verify CSRF token
  await verifyCsrf(formData);

  const id = String(formData.get('id') ?? '');
  return deleteRegistryItem(id);
}

/**
 * Client-side wrapper for fetching registry items (no authentication required for reading).
 */
export async function getRegistryItemsClient(): Promise<ActionResult<Array<{ id: string; title: string; description: string }>>> {
  // Reading does not require authentication in this example, but you can add it if needed.
  return getRegistryItems();
}

/**
 * Client-side wrapper for fetching a single registry item by id.
 */
export async function getRegistryItemByIdClient(id: string): Promise<ActionResult<{ id: string; title: string; description: string; details: string } | null>> {
  return getRegistryItemById(id);
}