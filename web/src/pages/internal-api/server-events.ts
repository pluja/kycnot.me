import { SITE_URL } from 'astro:env/client'

import { getRedisServerEvents } from '../../lib/redis/redisServerEvents'

import type { ServerEventsEvent } from '../../lib/serverEventsTypes'
import type { APIRoute } from 'astro'

const redisServerEvents = await getRedisServerEvents()

export const GET: APIRoute = ({ request, locals }) => {
  const user = locals.user

  let cleanup: (() => Promise<void>) | null = null
  let closed = false

  async function runCleanup() {
    const pending = cleanup
    cleanup = null
    if (!pending) return
    try {
      await pending()
    } catch (error) {
      console.error('Failed to cleanup SSE connection:', error)
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(event: ServerEventsEvent) {
        if (closed) return
        try {
          controller.enqueue(encodeSSE(event))
        } catch (error) {
          console.error('Failed to send SSE event:', event.type, error)
        }
      }

      async function teardown() {
        if (closed) return
        closed = true
        await runCleanup()
        try {
          controller.close()
        } catch {
          // already closed by runtime
        }
      }

      // wire abort handling before any await so it also covers the addListener window
      if (request.signal.aborted) {
        await teardown()
        return
      }
      request.signal.addEventListener('abort', () => void teardown(), { once: true })

      try {
        sendEvent({ type: 'new-connection', data: { timestamp: new Date().toISOString() } })

        if (user) {
          const listenerCleanup = await redisServerEvents.addListener('all', user.id, sendEvent)
          if (closed) {
            // aborted during the addListener await; clean up the listener we just registered
            await listenerCleanup().catch((error: unknown) => {
              console.error('Failed to cleanup race SSE listener:', error)
            })
            return
          }
          cleanup = listenerCleanup
        }
      } catch (error) {
        console.error('Failed to start SSE stream:', error)
        await teardown()
      }
    },

    async cancel() {
      if (closed) return
      closed = true
      await runCleanup()
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

const encoder = new TextEncoder()
function encodeSSE(event: ServerEventsEvent) {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
}
