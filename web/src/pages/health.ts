import type { APIRoute } from 'astro'

export const GET: APIRoute = () => {
  return new Response(
    JSON.stringify({
      message: 'OK',
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )
}
