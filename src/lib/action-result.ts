/**
 * The result type every server action returns.
 *
 * Actions never throw for expected failures — a wrong passphrase, a taken
 * handle, a blocked device. They return this instead, so a form can render the
 * problem in place without an error boundary swallowing the page around it.
 *
 * Messages are written for members, not for developers.
 */

export type FieldErrors = Record<string, string[]>;

export interface ActionResult<T = undefined> {
  ok: boolean;
  /** Present when the failure is not attributable to one field. */
  message?: string;
  /** Per-field messages, keyed by input name. */
  errors?: FieldErrors;
  /** Success payload, typed per action. */
  data?: T;
}

/** An action that returns data on success and nothing on failure. */
export type DataResult<T> = ActionResult<T>;

export function ok(): ActionResult<undefined>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T> {
  return data === undefined ? { ok: true } : { ok: true, data };
}

export function fail(message: string, errors?: FieldErrors): ActionResult<never> {
  return errors ? { ok: false, message, errors } : { ok: false, message };
}

/**
 * The state a form carries across submissions.
 *
 * `useActionState` requires the action's previous-state parameter and its return
 * type to agree, so a form that consumes a typed payload needs this widened
 * shape rather than the bare `ActionResult<T>`.
 */
export interface FormState<T = undefined> extends ActionResult<T> {
  data?: T;
}

/**
 * `useActionState` hands the action a state that may be `null` (before the first
 * submission) and expects a two-argument signature. The generic form below keeps
 * the payload type flowing from the action to the form without the caller having
 * to restate it.
 */
export interface FormAction<T> {
  (previous: FormState<T> | null, payload: FormData): Promise<FormState<T>>;
}

export function fieldError<T>(
  result: ActionResult<T> | FormState<T> | null | undefined,
  field: string,
): string | undefined {
  return result?.errors?.[field]?.[0];
}

/**
 * Normalises a Zod issue list into the flat shape the forms consume. The first
 * issue for each field wins, so a field never stacks three red messages.
 */
export function issuesToErrors(issues: Array<{ path: PropertyKey[]; message: string }>): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '_');
    if (errors[key]) continue;
    errors[key] = [issue.message];
  }
  return errors;
}

/** True when the result is a success that carried a payload. */
export function succeeded<T>(result: ActionResult<T> | null): result is ActionResult<T> & { data: T } {
  return result !== null && result.ok === true && result.data !== undefined;
}