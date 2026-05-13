// @ts-check

import mdx from '@astrojs/mdx'
import node from '@astrojs/node'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { minimal2023Preset } from '@vite-pwa/assets-generator/config'
import AstroPWA from '@vite-pwa/astro'
import { defineConfig, envField } from 'astro/config'
import icon from 'astro-icon'
import rehypeExternalLinks from 'rehype-external-links'
import rehypeRaw from 'rehype-raw'
import rehypeSlug from 'rehype-slug'
import devtoolsJson from 'vite-plugin-devtools-json'

import { postgresListener } from './src/lib/postgresListenerIntegration'
import { getServerEnvVariable } from './src/lib/serverEnvVariables'

const SITE_URL = getServerEnvVariable('SITE_URL')
const ONION_ADDRESS = getServerEnvVariable('ONION_ADDRESS')
const I2P_ADDRESS = getServerEnvVariable('I2P_ADDRESS')

export default defineConfig({
  site: SITE_URL,
  vite: {
    build: {
      sourcemap: true, // Enable sourcemaps on production, so users can inspect the code
    },

    plugins: [devtoolsJson(), tailwindcss()],
  },
  integrations: [
    postgresListener(),
    icon({ include: { cryptocurrency: ['*'] } }),
    mdx(),
    AstroPWA({
      base: '/',
      scope: '/',
      registerType: 'autoUpdate',
      manifest: {
        name: 'KYCnot.me',
        short_name: 'KYCnot.me',
        description: 'Find services that respect your privacy',
        theme_color: '#040505',
        background_color: '#171c1b',
        display: 'minimal-ui',
      },
      pwaAssets: {
        image: './public/favicon.svg',
        preset: {
          ...minimal2023Preset,
          maskable: {
            ...minimal2023Preset.maskable,
            padding: 0.1,
            resizeOptions: {
              ...minimal2023Preset.maskable.resizeOptions,
              background: '#3bdb78',
            },
          },
          apple: {
            ...minimal2023Preset.apple,
            padding: 0.1,
            resizeOptions: {
              ...minimal2023Preset.apple.resizeOptions,
              background: '#3bdb78',
            },
          },
        },
      },
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      workbox: {
        globPatterns: [],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
      experimental: {
        directoryAndTrailingSlashHandler: true,
      },
    }),
    sitemap({
      filter: (page) => {
        const url = new URL(page)
        const noIndexPrefixes = [
          '/admin',
          '/account',
          '/service-suggestion',
          '/notifications',
          '/access-denied',
        ]
        // /swap is owned by /sitemaps/swap.xml so it doesn't appear twice in
        // the sitemap graph.
        const excludedPaths = ['/downloads', '/swap']
        return (
          !noIndexPrefixes.some((prefix) => url.pathname.startsWith(prefix)) &&
          !excludedPaths.includes(url.pathname)
        )
      },
    }),
  ],
  adapter: node({
    mode: 'standalone',
  }),
  output: 'server',
  trailingSlash: 'never',
  markdown: {
    // `allowDangerousHtml` + `rehype-raw` make raw HTML inside markdown
    // (e.g. `<a rel="sponsored">` for Google-compliant sponsored review
    // links) become real hast elements, so subsequent rehype plugins like
    // `rehype-external-links` can process them.
    remarkRehype: { allowDangerousHtml: true },
    rehypePlugins: [
      rehypeRaw,
      rehypeSlug,
      [
        rehypeExternalLinks,
        {
          target: '_blank',
          // Preserve `rel="sponsored"` when authored explicitly in raw HTML
          // (e.g. for sponsored review links). Otherwise default to the
          // standard nofollow + security set on every external link.
          rel: (/** @type {{ properties?: { rel?: string | string[] } }} */ element) => {
            const existing = element.properties?.rel
            const existingArray = Array.isArray(existing)
              ? existing
              : existing
                ? [existing]
                : []
            if (existingArray.includes('sponsored')) {
              return ['sponsored', 'noopener', 'noreferrer']
            }
            return ['nofollow', 'noopener', 'noreferrer']
          },
        },
      ],
    ],
  },
  devToolbar: {
    enabled: false,
  },
  server: {
    open: false,
    allowedHosts: [new URL(SITE_URL).hostname],
    headers: {
      'Onion-Location': ONION_ADDRESS,
      'X-I2P-Location': I2P_ADDRESS,
      'X-Frame-Options': 'DENY',
      // Astro is working on this feature, when it's stable use it instead of this.
      // https://astro.build/blog/astro-590/#experimental-content-security-policy-support
      'Content-Security-Policy':
        SITE_URL === 'http://localhost:4321'
          ? "frame-ancestors 'none'"
          : "default-src 'self'; img-src 'self' *; frame-ancestors 'none'; upgrade-insecure-requests",
      'Strict-Transport-Security':
        SITE_URL === 'http://localhost:4321' ? undefined : 'max-age=31536000; includeSubdomains; preload;',
    },
  },
  security: {
    checkOrigin: true,
    allowedDomains: [{ hostname: new URL(SITE_URL).hostname, protocol: 'https' }],
    // Must stay above MAX_IMAGE_SIZE (5MB, see src/lib/zodUtils.ts) to allow image uploads
    // through Astro Actions, accounting for multipart/form-data overhead.
    actionBodySizeLimit: 6 * 1024 * 1024,
  },
  image: {
    remotePatterns: [
      {
        protocol: new URL(SITE_URL).protocol.slice(0, -1),
        hostname: new URL(SITE_URL).hostname,
        port: new URL(SITE_URL).port || undefined,
        pathname: '/files/**',
      },
    ],
    service: {
      entrypoint: './src/lib/imageService.ts',
    },
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

    '/service/[...slug]/review': '/service/[...slug]#comments',
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
        context: 'client',
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

      DATABASE_UI_URL: envField.string({
        context: 'server',
        access: 'secret',
        url: true,
        optional: false,
      }),
      LOGS_UI_URL: envField.string({
        context: 'server',
        access: 'secret',
        url: true,
        optional: true,
      }),

      RELEASE_NUMBER: envField.number({
        context: 'server',
        access: 'public',
        int: true,
        optional: true,
      }),
      RELEASE_DATE: envField.string({
        context: 'server',
        access: 'public',
        optional: true,
      }),

      // Generated with `npx web-push generate-vapid-keys`
      VAPID_PUBLIC_KEY: envField.string({
        context: 'server',
        access: 'public',
        min: 1,
        optional: false,
      }),
      // Generated with `npx web-push generate-vapid-keys`
      VAPID_PRIVATE_KEY: envField.string({
        context: 'server',
        access: 'secret',
        min: 1,
        optional: false,
      }),
      VAPID_SUBJECT: envField.string({
        context: 'server',
        access: 'secret',
        min: 1,
        optional: false,
      }),

      AGGREGATOR_GRPC_URL: envField.string({
        context: 'server',
        access: 'public',
        default: 'localhost:50051',
      }),
      AGGREGATOR_GRPC_TOKEN: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
    },
  },
})
