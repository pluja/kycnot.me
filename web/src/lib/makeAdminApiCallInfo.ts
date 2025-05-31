import type { Misc } from 'ts-toolbelt'

export async function makeAdminApiCallInfo<T extends Misc.JSON.Object>({
  method,
  path,
  input,
  baseUrl,
}: {
  method: 'POST' | 'QUERY'
  path: `/${string}`
  input: T
  baseUrl: URL | string
}) {
  const fullPath = new URL(`/api/v1${path}`, baseUrl).href

  return {
    method,
    path,
    fullPath,
    input,
    output: await fetch(fullPath, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then((res) => res.json() as Promise<Misc.JSON.Value>),
  }
}
