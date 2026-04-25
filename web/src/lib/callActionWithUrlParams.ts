import { serialize } from 'object-to-formdata'

import { urlParamsToFormData, urlParamsToObject } from './urls'

import type { AstroGlobal } from 'astro'
import type { z } from 'astro/zod'
import type { ActionAccept, ActionClient, SafeResult } from 'astro:actions'

/**
 * Call an Action directly from an Astro page or API endpoint.
 *
 * The action input is obtained from the URL search params.
 *
 * Returns a Promise with the action result.
 *
 * It uses {@link AstroGlobal.callAction} internally.
 *
 * Example usage:
 *
 * ```typescript
 * import { actions } from 'astro:actions';
 *
 * const result = await callActionWithUrlParamsUnhandledErrors(Astro, actions.getPost, 'form');
 * ```
 */
export function callActionWithUrlParamsUnhandledErrors<
  TAccept extends ActionAccept,
  TInputSchema extends z.ZodType,
  TOutput,
  TAction extends
    | ActionClient<TOutput, TAccept, TInputSchema>
    | ActionClient<TOutput, TAccept, TInputSchema>['orThrow'],
  P extends Parameters<TAction>[0],
>(context: AstroGlobal, action: TAction, accept: P extends FormData ? 'form' : 'json') {
  const input =
    accept === 'form'
      ? urlParamsToFormData(context.url.searchParams)
      : urlParamsToObject(context.url.searchParams)

  return context.callAction(action, input as P)
}

/**
 * Call an Action directly from an Astro page or API endpoint.
 *
 * The action input is obtained from the URL search params.
 *
 * Returns a Promise with the action result's data.
 *
 * It stores the errors in {@link context.locals.banners}
 *
 * It uses {@link AstroGlobal.callAction} internally.
 *
 * Example usage:
 *
 * ```typescript
 * import { actions } from 'astro:actions';
 *
 * const data = await callActionWithUrlParams(Astro, actions.getPost, 'form');
 * ```
 */
export async function callActionWithUrlParams<
  TAccept extends ActionAccept,
  TInputSchema extends z.ZodType,
  TOutput,
  TAction extends
    | ActionClient<TOutput, TAccept, TInputSchema>
    | ActionClient<TOutput, TAccept, TInputSchema>['orThrow'],
  P extends Parameters<TAction>[0],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TInputSchema2 extends ReturnType<TAction> extends Promise<SafeResult<infer I, any>> ? I : never,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TOutput2 extends ReturnType<TAction> extends Promise<SafeResult<any, infer O>> ? O : never,
>(context: AstroGlobal, action: TAction, accept: P extends FormData ? 'form' : 'json') {
  const input =
    accept === 'form'
      ? urlParamsToFormData(context.url.searchParams)
      : urlParamsToObject(context.url.searchParams)

  const result = (await context.callAction(action, input as P)) as SafeResult<
    TInputSchema2,
    Awaited<TOutput2>
  >
  if (result.error) {
    context.locals.banners.add({
      uiMessage: result.error.message,
      type: 'error',
      origin: 'action',
      error: result.error,
    })
  }
  return result.data
}

/**
 * Call an Action directly from an Astro page or API endpoint.
 *
 * Returns a Promise with the action result.
 *
 * It uses {@link AstroGlobal.callAction} internally.
 *
 * Example usage:
 *
 * ```typescript
 * import { actions } from 'astro:actions';
 *
 * const input = { id: 123 }
 * const result = await callActionWithObjectUnhandledErrors(Astro, actions.getPost, input, 'form');
 * ```
 */
export function callActionWithObjectUnhandledErrors<
  TAccept extends ActionAccept,
  TInputSchema extends z.ZodType,
  TOutput,
  TAction extends
    | ActionClient<TOutput, TAccept, TInputSchema>
    | ActionClient<TOutput, TAccept, TInputSchema>['orThrow'],
  P extends Parameters<TAction>[0],
  TInputSchema2 extends ReturnType<TAction> extends Promise<SafeResult<infer I, unknown>> ? I : never,
>(
  context: AstroGlobal,
  action: TAction,
  input: [TInputSchema2] extends [FormData] | [never] ? undefined : TInputSchema2,
  accept: P extends FormData ? 'form' : 'json'
) {
  const parsedInput = accept === 'form' ? serialize(input) : input

  return context.callAction(action, parsedInput as P)
}

/**
 * Call an Action directly from an Astro page or API endpoint.
 *
 * The action input is a plain object.
 *
 * Returns a Promise with the action result's data.
 *
 * It stores the errors in {@link context.locals.banners}
 *
 * It uses {@link AstroGlobal.callAction} internally.
 *
 * Example usage:
 *
 * ```typescript
 * import { actions } from 'astro:actions';
 *
 * const input = { id: 123 }
 * const data = await callActionWithObject(Astro, actions.getPost, input, 'form');
 * ```
 */
export async function callActionWithObject<
  TAccept extends ActionAccept,
  TInputSchema extends z.ZodType,
  TOutput,
  TAction extends
    | ActionClient<TOutput, TAccept, TInputSchema>
    | ActionClient<TOutput, TAccept, TInputSchema>['orThrow'],
  P extends Parameters<TAction>[0],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TInputSchema2 extends ReturnType<TAction> extends Promise<SafeResult<infer I, any>> ? I : never,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TOutput2 extends ReturnType<TAction> extends Promise<SafeResult<any, infer O>> ? O : never,
>(
  context: AstroGlobal,
  action: TAction,
  input: [TInputSchema2] extends [FormData] | [never] ? undefined : TInputSchema2,
  accept: P extends FormData ? 'form' : 'json'
) {
  const parsedInput = accept === 'form' ? serialize(input) : input

  const result = (await context.callAction(action, parsedInput as P)) as SafeResult<
    TInputSchema2,
    Awaited<TOutput2>
  >
  if (result.error) {
    context.locals.banners.add({
      uiMessage: result.error.message,
      type: 'error',
      origin: 'action',
      error: result.error,
    })
  }
  return result.data
}
