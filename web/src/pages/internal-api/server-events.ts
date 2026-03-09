import { SITE_URL } from 'astro:env/client'

import { getRedisServerEvents } from '../../lib/redis/redisServerEvents'

import type { ServerEventsEvent } from '../../lib/serverEventsTypes'
import type { APIRoute } from 'astro'

const redisServerEvents = await getRedisServerEvents()

export const GET: APIRoute = ({ request, locals }) => {
  const user = locals.user

  let cleanup: (() => Promise<void>) | null = null
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(event: ServerEventsEvent) {
        try {
          controller.enqueue(encodeSSE(event))
        } catch (error) {
          console.error('Failed to send SSE event:', event.type, error)
        }
      }

      try {
        sendEvent({ type: 'new-connection', data: { timestamp: new Date().toISOString() } })

        cleanup = user
          ? await redisServerEvents.addListener('all', user.id, (event) => {
              sendEvent(event)
            })
          : null

        async function abort() {
          if (closed) return
          closed = true
          try {
            await cleanup?.()
            cleanup = null
            controller.close()
          } catch (error) {
            console.error('Failed to cleanup SSE connection:', error)
          }
        }

        request.signal.addEventListener('abort', () => {
          void abort()
        })
      } catch (error) {
        console.error('Failed to start SSE stream:', error)
        controller.error(error)
      }
    },

    async cancel() {
      closed = true
      try {
        await cleanup?.()
        cleanup = null
      } catch (error) {
        console.error('Failed to cleanup on cancel:', error)
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': new URL(SITE_URL).origin,
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  })
}

function encodeSSE(event: ServerEventsEvent) {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}
