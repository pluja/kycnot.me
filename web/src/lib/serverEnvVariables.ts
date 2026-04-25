import { loadEnv } from 'vite'

// Astro's `--mode` does not change NODE_ENV during `astro build`, so loading by
// NODE_ENV silently picks the wrong .env file for non-production modes (e.g.
// staging would still read .env.production). ASTRO_BUILD_MODE is set in the
// Dockerfile to match `--mode` and takes precedence.
const mode = process.env.ASTRO_BUILD_MODE ?? process.env.NODE_ENV ?? 'production'

/** Only use when you can't import the variables from `astro:env/server` */
const untypedServerEnvVariables = loadEnv(mode, process.cwd(), '')

/** Only use when you can't import the variables from `astro:env/server` */
export function getServerEnvVariable<T extends keyof typeof untypedServerEnvVariables>(
  name: T
): NonNullable<(typeof untypedServerEnvVariables)[T]> {
  const value = untypedServerEnvVariables[name]
  if (!value) throw new Error(`${name} environment variable is not set`)
  return value
}
