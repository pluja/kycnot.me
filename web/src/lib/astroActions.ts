/* eslint-disable @typescript-eslint/no-explicit-any */
import type { z } from 'astro/zod'
import type { ActionAccept, ActionClient, SafeResult } from 'astro:actions'

export type AnyAction = ActionClient<unknown, ActionAccept, z.ZodType> & string

export type FormAction = ActionClient<any, 'form', any> & string
export type JsonAction = ActionClient<any, 'json', any> & string

export type ActionInput<Action extends AnyAction> = Parameters<Action>[0]

export type ActionOutput<Action extends AnyAction> =
  ReturnType<Action> extends Promise<SafeResult<infer TOutput, void>> ? TOutput : never

/**  Returns the input type of an action, or the output type if the input type is not a record. */
export type ActionInputNoFormData<Action extends AnyAction> =
  ActionInput<Action> extends Record<string, unknown> ? ActionInput<Action> : ActionOutput<Action>
