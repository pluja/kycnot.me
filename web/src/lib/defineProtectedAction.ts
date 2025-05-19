import {
  ActionError,
  defineAction,
  type ActionAccept,
  type ActionAPIContext,
  type ActionHandler,
} from 'astro:actions'

import type { MaybePromise } from 'astro/actions/runtime/utils.js'
import type { z } from 'astro/zod'

type SpecialUserPermission = 'admin' | 'verified' | 'verifier'
type Permission = SpecialUserPermission | 'guest' | 'not-spammer' | 'user'

type ActionAPIContextWithUser = ActionAPIContext & {
  locals: {
    user: NonNullable<ActionAPIContext['locals']['user']>
  }
}

type ActionHandlerWithUser<TInputSchema, TOutput> = TInputSchema extends z.ZodType
  ? (input: z.infer<TInputSchema>, context: ActionAPIContextWithUser) => MaybePromise<TOutput>
  : (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      input: any,
      context: ActionAPIContextWithUser
    ) => MaybePromise<TOutput>

export function defineProtectedAction<
  P extends Permission | SpecialUserPermission[],
  TOutput,
  TAccept extends ActionAccept | undefined = undefined,
  TInputSchema extends z.ZodType | undefined = TAccept extends 'form' ? z.ZodType<FormData> : undefined,
>({
  accept,
  input: inputSchema,
  handler,
  permissions,
}: {
  input?: TInputSchema
  accept?: TAccept
  handler: P extends 'guest'
    ? ActionHandler<TInputSchema, TOutput>
    : ActionHandlerWithUser<TInputSchema, TOutput>
  permissions: P
}) {
  return defineAction({
    accept,
    input: inputSchema,
    handler: ((input, context) => {
      if (permissions === 'guest' || (Array.isArray(permissions) && permissions.length === 0)) {
        return handler(
          input,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
          context as any
        )
      }

      if (!context.locals.user) {
        throw new ActionError({
          code: 'UNAUTHORIZED',
          message: 'You must be logged in to perform this action.',
        })
      }

      if (permissions === 'not-spammer' && context.locals.user.spammer) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: 'Spammer users are not allowed to perform this action.',
        })
      }

      if (
        (permissions === 'verified' || (Array.isArray(permissions) && permissions.includes('verified'))) &&
        !context.locals.user.verified
      ) {
        if (context.locals.user.spammer) {
          throw new ActionError({
            code: 'FORBIDDEN',
            message: 'Spammer users are not allowed to perform this action.',
          })
        }
        throw new ActionError({
          code: 'FORBIDDEN',
          message: 'Verified user privileges required.',
        })
      }

      if (
        (permissions === 'verifier' || (Array.isArray(permissions) && permissions.includes('verifier'))) &&
        !context.locals.user.verifier
      ) {
        if (context.locals.user.spammer) {
          throw new ActionError({
            code: 'FORBIDDEN',
            message: 'Spammer users are not allowed to perform this action.',
          })
        }
        throw new ActionError({
          code: 'FORBIDDEN',
          message: 'Verifier privileges required.',
        })
      }

      if (
        (permissions === 'admin' || (Array.isArray(permissions) && permissions.includes('admin'))) &&
        !context.locals.user.admin
      ) {
        if (context.locals.user.spammer) {
          throw new ActionError({
            code: 'FORBIDDEN',
            message: 'Spammer users are not allowed to perform this action.',
          })
        }
        throw new ActionError({
          code: 'FORBIDDEN',
          message: 'Admin privileges required.',
        })
      }

      return handler(input, context as ActionAPIContextWithUser)
    }) as ActionHandler<TInputSchema, TOutput>,
  })
}
