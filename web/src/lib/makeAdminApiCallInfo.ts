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

  const fetchProsmise = fetch(fullPath, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }).then((res) => {
    try {
      return res.json() as Promise<Misc.JSON.Value>
    } catch (errJson: unknown) {
      console.error(errJson)

      try {
        return res.text()
      } catch (errText: unknown) {
        console.error(errText)
        return ''
      }
    }
  })

  let output: Misc.JSON.Value = ''
  try {
    output = await fetchProsmise
  } catch (err: unknown) {
    console.error(err)
    output = err instanceof Error ? err.message : String(err)
  }

  return {
    method,
    path,
    fullPath,
    input,
    output,
  }
}
