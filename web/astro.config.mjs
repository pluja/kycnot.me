// @ts-check

import mdx from '@astrojs/mdx'
import node from '@astrojs/node'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, envField } from 'astro/config'
import icon from 'astro-icon'
import { loadEnv } from 'vite'

// @ts-expect-error process.env actually exists
const { SITE_URL } = loadEnv(process.env.NODE_ENV, process.cwd(), '')
if (!SITE_URL) throw new Error('SITE_URL environment variable is not set')

export default defineConfig({
  site: SITE_URL,
  vite: {
    build: {
      sourcemap: true,
    },

    plugins: [tailwindcss()],
  },
  integrations: [
    icon(),
    mdx(),
    sitemap({
      filter: (page) => {
        const url = new URL(page)
        return !url.pathname.startsWith('/admin') && !url.pathname.startsWith('/account/impersonate')
      },
    }),
  ],
  adapter: node({
    mode: 'standalone',
  }),
  output: 'server',
  devToolbar: {
    enabled: false,
  },
  server: {
    open: false,
    allowedHosts: [new URL(SITE_URL).hostname],
  },
  image: {
    domains: [new URL(SITE_URL).hostname],
    remotePatterns: [{ protocol: 'https' }],
  },
  redirects: {
    // #region Redirects from old website
    '/pending': '/?verification=verified&verification=approved&verification=community',
    '/changelog': '/events',
    '/request': '/service-suggestion/new',
    '/service/[...slug]/summary': '/service/[...slug]/#scores',
    '/service/[...slug]/proof': '/service/[...slug]/#verification',
    '/attribute/[...slug]': '/attributes',
    '/attr/[...slug]': '/attributes',
    // #endregion
  },
  env: {
    schema: {
      // Database (server-only, secret)
      DATABASE_URL: envField.string({
        context: 'server',
        access: 'secret',
        url: true,
        startsWith: 'postgresql://',
        default: 'postgresql://kycnot:kycnot@database:5432/kycnot?schema=public',
      }),
      // Public URLs (can be accessed from both server and client)
      SOURCE_CODE_URL: envField.string({
        context: 'server',
        access: 'public',
        url: true,
        optional: false,
      }),
      I2P_ADDRESS: envField.string({
        context: 'server',
        access: 'public',
        url: true,
        optional: false,
      }),
      ONION_ADDRESS: envField.string({
        context: 'server',
        access: 'public',
        url: true,
        optional: false,
      }),

      REDIS_URL: envField.string({
        context: 'server',
        access: 'secret',
        url: true,
        startsWith: 'redis://',
        default: 'redis://redis:6379',
      }),
      REDIS_USER_SESSION_EXPIRY_SECONDS: envField.number({
        context: 'server',
        access: 'secret',
        int: true,
        gt: 0,
        default: 60 * 60 * 24, // 24 hours in seconds
      }),
      REDIS_IMPERSONATION_SESSION_EXPIRY_SECONDS: envField.number({
        context: 'server',
        access: 'secret',
        int: true,
        gt: 0,
        default: 60 * 60 * 24, // 24 hours in seconds
      }),
      REDIS_PREGENERATED_TOKEN_EXPIRY_SECONDS: envField.number({
        context: 'server',
        access: 'secret',
        int: true,
        gt: 0,
        default: 60 * 5, // 5 minutes in seconds
      }),

      REDIS_ACTIONS_SESSION_EXPIRY_SECONDS: envField.number({
        context: 'server',
        access: 'secret',
        int: true,
        gt: 0,
        default: 60 * 5, // 5 minutes in seconds
      }),

      // Development tokens
      DEV_ADMIN_USER_SECRET_TOKEN: envField.string({
        context: 'server',
        access: 'secret',
        min: 1,
        default: 'admin',
      }),
      DEV_MODERATOR_USER_SECRET_TOKEN: envField.string({
        context: 'server',
        access: 'secret',
        min: 1,
        default: 'moderator',
      }),
      DEV_VERIFIED_USER_SECRET_TOKEN: envField.string({
        context: 'server',
        access: 'secret',
        min: 1,
        default: 'verified',
      }),
      DEV_NORMAL_USER_SECRET_TOKEN: envField.string({
        context: 'server',
        access: 'secret',
        min: 1,
        default: 'normal',
      }),
      DEV_SPAM_USER_SECRET_TOKEN: envField.string({
        context: 'server',
        access: 'secret',
        min: 1,
        default: 'spam',
      }),

      // Upload directory configuration
      UPLOAD_DIR: envField.string({
        context: 'server',
        access: 'secret',
        min: 1,
        default: './local_uploads',
      }),

      SITE_URL: envField.string({
        context: 'client',
        access: 'public',
        url: true,
        optional: false,
      }),
    },
  },
})
