import type { APIRoute } from 'astro'

export const ALL: APIRoute = (context) => {
  console.error('Endpoint not found', { url: context.url.href, method: context.request.method })
  return new Response(
    JSON.stringify({
      error: 'Endpoint not found',
    }),
    {
      status: 404,
    }
  )
}
