import { loadEnv } from 'vite'

/** Only use when you can't import the variables from `astro:env/server` */
// @ts-expect-error process.env actually exists
const untypedServerEnvVariables = loadEnv(process.env.NODE_ENV, process.cwd(), '')

/** Only use when you can't import the variables from `astro:env/server` */
export function getServerEnvVariable<T extends keyof typeof untypedServerEnvVariables>(
  name: T
): NonNullable<(typeof untypedServerEnvVariables)[T]> {
  const value = untypedServerEnvVariables[name]
  if (!value) throw new Error(`${name} environment variable is not set`)
  return value
}
