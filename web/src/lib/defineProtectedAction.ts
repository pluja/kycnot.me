import {
  ActionError,
  defineAction,
  type ActionAccept,
  type ActionAPIContext,
  type ActionHandler,
} from 'astro:actions'

import type { MaybePromise } from 'astro/actions/runtime/utils.js'
import type { z } from 'astro/zod'

type SpecialUserPermission = 'admin' | 'moderator' | 'verified'
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

      const user = context.locals.user
      if (user.spammer) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: 'Spammer users are not allowed to perform this action.',
        })
      }

      if (permissions === 'not-spammer') {
        return handler(input, context as ActionAPIContextWithUser)
      }

      // arrays grant access when ANY listed permission is satisfied (OR).
      // single-string permissions require that one permission specifically.
      if (Array.isArray(permissions)) {
        const granted = permissions.some((p) =>
          p === 'verified'
            ? user.verified
            : p === 'moderator'
              ? user.moderator
              : p === 'admin'
                ? user.admin
                : false
        )
        if (!granted) {
          throw new ActionError({
            code: 'FORBIDDEN',
            message: 'You do not have the required privileges for this action.',
          })
        }
        return handler(input, context as ActionAPIContextWithUser)
      }

      if (permissions === 'verified' && !user.verified) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: 'Verified user privileges required.',
        })
      }

      if (permissions === 'moderator' && !user.moderator) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: 'Moderator privileges required.',
        })
      }

      if (permissions === 'admin' && !user.admin) {
        throw new ActionError({
          code: 'FORBIDDEN',
          message: 'Admin privileges required.',
        })
      }

      return handler(input, context as ActionAPIContextWithUser)
    }) as ActionHandler<TInputSchema, TOutput>,
  })
}
