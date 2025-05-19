import { z } from 'astro/zod'

const schema = z.enum(['development', 'staging', 'production'])

export const DEPLOYMENT_MODE = schema.parse(import.meta.env.PROD ? import.meta.env.MODE : 'development')
