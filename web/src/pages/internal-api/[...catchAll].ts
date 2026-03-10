import type { APIRoute } from 'astro'

export const ALL: APIRoute = () => {
  return new Response(
    JSON.stringify({
      error: 'Endpoint not found',
    }),
    {
      status: 404,
    }
  )
}
