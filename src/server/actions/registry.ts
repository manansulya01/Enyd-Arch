'use server';

import { fail, ok, type ActionResult } from '~/lib/action-result';

/**
 * The Registry is the member directory, not a free-form item catalogue.
 * Keep legacy client wrappers explicit rather than returning fake success for
 * operations that have no backing table or user interface.
 */
export async function getRegistryItems(): Promise<ActionResult<Array<{ id: string; title: string; description: string }>>> {
  return ok([]);
}

export async function getRegistryItemById(
  _id: string,
): Promise<ActionResult<{ id: string; title: string; description: string; details: string } | null>> {
  return ok(null);
}

export async function createRegistryItem(
  _data: { title: string; description: string; details?: string },
): Promise<ActionResult<{ id: string }>> {
  return fail('The Registry contains member profiles; custom catalogue entries are not supported.');
}

export async function updateRegistryItem(
  _id: string,
  _data: { title?: string; description?: string; details?: string },
): Promise<ActionResult<void>> {
  return fail('The Registry contains member profiles; custom catalogue entries are not supported.');
}

export async function deleteRegistryItem(_id: string): Promise<ActionResult<void>> {
  return fail('The Registry contains member profiles; custom catalogue entries are not supported.');
}
