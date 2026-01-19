/* eslint-disable @typescript-eslint/no-explicit-any */
import type { z } from 'astro/zod'
import type { ActionAccept, ActionClient, ActionInputSchema, SafeResult } from 'astro:actions'

export type AnyAction = ActionClient<unknown, ActionAccept, z.ZodType> & string

export type FormAction = ActionClient<any, 'form', any> & string
export type JsonAction = ActionClient<any, 'json', any> & string

export type ActionInput<Action extends AnyAction> = z.input<ActionInputSchema<Action>>

export type ActionOutput<Action extends AnyAction> =
  ReturnType<Action> extends Promise<SafeResult<infer TOutput, void>> ? TOutput : never
