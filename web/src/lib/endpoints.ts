import { type ActionClient } from 'astro:actions'

import type { APIRoute } from 'astro'
import type { z } from 'astro/zod'

export function makeEndpointFromAction<Action extends ActionClient<unknown, 'json', z.ZodType> & string>(
  action: Action
): APIRoute {
  return async (context) => {
    try {
      const input = await context.request.json()
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const result = await context.callAction(action, input)

      if (result.error) {
        console.error('Error on endpoint', result.error)
        return new Response(JSON.stringify({ error: result.error.message }), {
          status: result.error.status,
        })
      }

      return new Response(JSON.stringify(result.data), {
        status: 200,
      })
    } catch (error) {
      console.error('Error on endpoint', error)
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
      })
    }
  }
}
