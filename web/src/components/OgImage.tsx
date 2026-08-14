import fs from 'node:fs'
import path from 'node:path'

import { ImageResponse } from '@vercel/og'
import sharp from 'sharp'

import defaultOGImageBg from '../assets/ogimage-bg.png?inline'
import defaultOGImage from '../assets/ogimage.png?inline'
import { readLocalImageAsDataUri } from '../lib/localImageDataUri'
import { reportMissingAsset } from '../lib/missingAssets'
import {
  type OgImageAllTemplatesWithProps,
  type OgImageProps,
  type OgImageTemplateName,
} from '../lib/ogImageProps'
import { makeOverallScoreInfo } from '../lib/overallScore'
import { urlWithParams } from '../lib/urls'

import { makeExtraOgImageTemplates } from './OgImageExtraTemplates'

import type { APIContext } from 'astro'

export type { OgImageAllTemplatesWithProps }

//////////////////////////////////////////////////////
//                    NOTE                          //
// Use this website to create and preview templates //
//         https://og-playground.vercel.app/        //
//////////////////////////////////////////////////////

const defaultOptions = {
  width: 1200,
  height: 630,
  fonts: [
    {
      name: 'Inter',
      weight: 400,
      style: 'normal',
      data: fs.readFileSync(
        path.resolve(
          process.cwd(),
          'node_modules',
          '@fontsource',
          'inter',
          'files',
          'inter-latin-400-normal.woff'
        )
      ),
    },
    {
      name: 'Inter',
      weight: 700,
      style: 'normal',
      data: fs.readFileSync(
        path.resolve(
          process.cwd(),
          'node_modules',
          '@fontsource',
          'inter',
          'files',
          'inter-latin-700-normal.woff'
        )
      ),
    },
    {
      name: 'Space Grotesk',
      weight: 400,
      style: 'normal',
      data: fs.readFileSync(
        path.resolve(
          process.cwd(),
          'node_modules',
          '@fontsource',
          'space-grotesk',
          'files',
          'space-grotesk-latin-400-normal.woff'
        )
      ),
    },
    {
      name: 'Space Grotesk',
      weight: 700,
      style: 'normal',
      data: fs.readFileSync(
        path.resolve(
          process.cwd(),
          'node_modules',
          '@fontsource',
          'space-grotesk',
          'files',
          'space-grotesk-latin-700-normal.woff'
        )
      ),
    },
  ],
} as const satisfies ConstructorParameters<typeof ImageResponse>[1]

const extraOgImageTemplates = makeExtraOgImageTemplates({
  defaultOptions,
  defaultBackgroundSrc: defaultOGImageBg,
})

type OgImageRender = ImageResponse | Promise<ImageResponse | null> | null

// OgImageTemplateRegistry pins every template to the output of the schema
// registered under the same name, so a template cannot drift from the shape its
// props are parsed into, and neither can gain an entry without the other.
type OgImageTemplateRegistry = {
  [K in OgImageTemplateName]: (props: OgImageProps<K>, context: APIContext) => OgImageRender
}

export const ogImageTemplates = {
  default: (_props?: OgImageProps<'default'>, _context?: APIContext) => {
    return new ImageResponse(
      <img
        src={defaultOGImage}
        style={{
          width: '100%',
          height: '100%',
        }}
      />,
      defaultOptions
    )
  },
  service: async (
    { title, description, categories, score, imageUrl, verificationStatus }: OgImageProps<'service'>,
    _context
  ) => {
    const scoreInfo = makeOverallScoreInfo(score, 10)
    const scoreColors = {
      'bg-score-1': '#e26136',
      'bg-score-2': '#eba370',
      'bg-score-3': '#eddb82',
      'bg-score-4': '#8de2d7',
      'bg-score-5': '#3cdd71',
    } as const satisfies Record<string, string>
    const scoreColor =
      Object.entries(scoreColors).find(([className]) => scoreInfo.classNameBg?.includes(className))?.[1] ??
      'white'

    const PADING = 80

    const resolvedImageSrc = imageUrl
      ? await readLocalImageAsDataUri(imageUrl, { resize: { width: 140, height: 140, fit: 'contain' } })
      : null

    return new ImageResponse(
      <div
        style={{
          color: 'white',
          backgroundImage: `url(${defaultOGImageBg})`,
          width: '100%',
          height: '100%',
          padding: PADING,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          gap: 20,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            gap: 10,
            flex: 1,
          }}
        >
          {!!resolvedImageSrc && (
            <img
              src={resolvedImageSrc}
              style={{
                width: 140,
                height: 140,
                borderRadius: 20,
                objectFit: 'contain',
              }}
            />
          )}
          <div style={{ display: 'flex', paddingTop: 20 }}>
            <span
              style={{
                fontSize: 100,
                fontWeight: 'bold',
                color: '#3bdb78',
                fontFamily: 'Space Grotesk',
                lineHeight: 1.2,
                height: 120,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginTop: -20,
              }}
            >
              {title}
            </span>
          </div>
        </div>

        <div
          style={{
            alignItems: 'flex-end',
            display: 'flex',
            gap: 50,
            position: 'relative',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              flex: 1,
              justifyContent: 'space-between',
              alignSelf: 'stretch',
            }}
          >
            <span
              style={{
                fontSize: 30,
                color: 'white',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxHeight: 115,
              }}
            >
              {description}
            </span>
            <div
              style={{
                display: 'flex',
                gap: 40,
                flexWrap: 'wrap',
                fontWeight: 'bold',
                fontSize: 50,
                marginTop: 10,
                color: 'white',
              }}
            >
              {await Promise.all(
                categories.map(async (category) => {
                  const resolvedIconSrc = await iconUrl(category.icon, 50)
                  return (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
                      {!!resolvedIconSrc && (
                        <img src={resolvedIconSrc} width={50} height={50} style={{ width: 50, height: 50 }} />
                      )}
                      {category.name}
                    </span>
                  )
                })
              )}
            </div>
          </div>
          <div style={{ display: 'flex' }}>
            <div
              style={{
                fontSize: 150,
                color: 'black',
                height: 200,
                width: 200,
                borderRadius: 30,
                backgroundColor: scoreColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
              }}
            >
              {score}
            </div>
          </div>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="white"
          width={400}
          viewBox="0 0 204 28"
          style={{ position: 'absolute', top: PADING, right: PADING }}
        >
          <path d="M1 0a1 1 0 0 0-1 1v26a1 1 0 0 0 1 1h74a1 1 0 0 0 1-1V1a1 1 0 0 0-1-1Zm4 4h2a1 1 0 0 1 1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 1 1 1v3h3a1 1 0 0 1 1 1v3h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3h-3a1 1 0 0 1-1-1v-3H9a1 1 0 0 0-1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm12 0h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm12.82 0h2.37a1 1 0 0 1 .85.46L38 12.27l4.97-7.8A1 1 0 0 1 43.8 4h2.37a1 1 0 0 1 .85 1.54l-6.87 10.8a1 1 0 0 0-.16.53V23a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-6.13a1 1 0 0 0-.15-.53l-6.87-10.8A1 1 0 0 1 29.82 4ZM57 4h14a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H56v12h15a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H57a1 1 0 0 1-1-1v-3h-3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h3V5a1 1 0 0 1 1-1zm24 0a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V7.6l9.18 15.9c.18.3.5.5.86.5H99a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v15.4L86.83 4.5a1 1 0 0 0-.87-.5Zm29 0a1 1 0 0 0-1 1v3h12V5a1 1 0 0 0-1-1zm11 4v12h3a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1zm0 12h-12v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1zm-12 0V8h-3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1zm21-16a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V8h4v15a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V8h4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zm27 0a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V11.4l5.53 12.02a1 1 0 0 0 .91.58h3.12a1 1 0 0 0 .91-.58L176 11.4V23a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-3.36a1 1 0 0 0-.9.58L168 19.21l-6.73-14.63a1 1 0 0 0-.9-.58Zm32 0a1 1 0 0 0-1 1v3h15a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zm-1 4h-3a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-14a1 1 0 0 1-1-1v-3h7a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-7zm-38 12a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1z" />
        </svg>
        {verificationStatus === 'VERIFICATION_FAILED' && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                transform: 'rotate(-20deg)',
                fontSize: 200,
                fontWeight: 'bold',
                color: 'red',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                boxShadow: '0 0 15px 30px rgba(0, 0, 0, 0.5)',
                border: '15px solid red',
                borderRadius: 15,
                padding: '10px 50px',
                textAlign: 'center',
              }}
            >
              SCAM
            </div>
          </div>
        )}
      </div>,
      defaultOptions
    )
  },
  generic: async ({ title, description, icon }: OgImageProps<'generic'>, _context) => {
    const PADING = 80

    const resolvedIconSrc = icon ? await iconUrl(icon, 200) : null

    return new ImageResponse(
      <div
        style={{
          color: 'white',
          backgroundImage: `url(${defaultOGImageBg})`,
          width: '100%',
          height: '100%',
          padding: PADING,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          gap: 20,
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="white"
          width={400}
          viewBox="0 0 204 28"
          style={{ marginBottom: 'auto' }}
        >
          <path d="M1 0a1 1 0 0 0-1 1v26a1 1 0 0 0 1 1h74a1 1 0 0 0 1-1V1a1 1 0 0 0-1-1Zm4 4h2a1 1 0 0 1 1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 1 1 1v3h3a1 1 0 0 1 1 1v3h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3h-3a1 1 0 0 1-1-1v-3H9a1 1 0 0 0-1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm12 0h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm12.82 0h2.37a1 1 0 0 1 .85.46L38 12.27l4.97-7.8A1 1 0 0 1 43.8 4h2.37a1 1 0 0 1 .85 1.54l-6.87 10.8a1 1 0 0 0-.16.53V23a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-6.13a1 1 0 0 0-.15-.53l-6.87-10.8A1 1 0 0 1 29.82 4ZM57 4h14a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H56v12h15a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H57a1 1 0 0 1-1-1v-3h-3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h3V5a1 1 0 0 1 1-1zm24 0a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V7.6l9.18 15.9c.18.3.5.5.86.5H99a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v15.4L86.83 4.5a1 1 0 0 0-.87-.5Zm29 0a1 1 0 0 0-1 1v3h12V5a1 1 0 0 0-1-1zm11 4v12h3a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1zm0 12h-12v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1zm-12 0V8h-3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1zm21-16a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V8h4v15a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V8h4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zm27 0a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V11.4l5.53 12.02a1 1 0 0 0 .91.58h3.12a1 1 0 0 0 .91-.58L176 11.4V23a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-3.36a1 1 0 0 0-.9.58L168 19.21l-6.73-14.63a1 1 0 0 0-.9-.58Zm32 0a1 1 0 0 0-1 1v3h15a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zm-1 4h-3a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-14a1 1 0 0 1-1-1v-3h7a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-7zm-38 12a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1z" />
        </svg>

        <div style={{ display: 'flex', paddingTop: 20 }}>
          <span
            style={{
              fontSize: 100,
              fontWeight: 'bold',
              color: '#3bdb78',
              fontFamily: 'Space Grotesk',
              lineHeight: 1.2,
              height: 120,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginTop: -20,
            }}
          >
            {title}
          </span>
        </div>

        <span
          style={{
            fontSize: 40,
            color: 'white',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxHeight: 200,
          }}
        >
          {description}
        </span>

        {!!resolvedIconSrc && (
          <img
            src={resolvedIconSrc}
            width={200}
            height={200}
            style={{
              position: 'absolute',
              top: PADING,
              right: PADING,
            }}
          />
        )}
      </div>,
      defaultOptions
    )
  },
  ...extraOgImageTemplates,
} as const satisfies OgImageTemplateRegistry

// renderOgImageTemplate dispatches on a name whose props the caller has already
// parsed. Indexing the registry with a runtime union yields a union of functions
// taking different props, which TypeScript cannot narrow from the name alone;
// the registry's `satisfies` above is what makes the cast sound.
export function renderOgImageTemplate(
  templateName: OgImageTemplateName,
  props: OgImageProps<OgImageTemplateName>,
  context: APIContext
): OgImageRender {
  const render = ogImageTemplates[templateName] as (
    props: OgImageProps<OgImageTemplateName>,
    context: APIContext
  ) => OgImageRender
  return render(props, context)
}

export function makeOgImageUrl(
  ogImage: OgImageAllTemplatesWithProps | string | undefined,
  baseUrl: URL | string
) {
  if (typeof ogImage === 'string') {
    return new URL(ogImage, baseUrl).href
  }
  const ogPath = urlWithParams(new URL('/ogimage.png', baseUrl), { data: JSON.stringify(ogImage ?? {}) })
  return new URL(ogPath, baseUrl).href
}

// Utilities ------------------------------------------------------------

const ICON_FETCH_TIMEOUT_MS = 3000

async function svgUrlToBase64Png(svgUrl: string, width?: number, height?: number): Promise<string> {
  // Renders hold a concurrency slot for their whole duration, so an unbounded
  // fetch here would let a slow third party stall every queued render. undici
  // would otherwise wait out its 300s default.
  const response = await fetch(svgUrl, { signal: AbortSignal.timeout(ICON_FETCH_TIMEOUT_MS) })
  if (!response.ok) {
    throw new Error(`Failed to fetch SVG: ${response.statusText}`)
  }

  const svgBuffer = await response.arrayBuffer()

  // 2. Convert SVG to PNG using sharp
  let image = sharp(svgBuffer).png().negate({ alpha: false })
  if (width || height) {
    image = image.resize(width, height, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
  }

  const pngBuffer = await image.toBuffer()

  // 3. Convert to base64 string
  const base64 = pngBuffer.toString('base64')
  return `data:image/png;base64,${base64}`
}

// iconUrl resolves a `prefix:name` icon to a PNG data URI, or null when it
// cannot be fetched. Null rather than undefined so that a caller who forgets to
// check fails to compile: satori rejects a falsy `src` with "Image source is not
// provided." and takes the whole card down with it.
async function iconUrl(icon: string, size = 30): Promise<string | null> {
  const [, prefix, name] = /^([^:]+):(.*)$/.exec(icon) ?? []
  if (!prefix || !name) return null
  const url = `https://api.iconify.design/${prefix}/${name}.svg`
  try {
    return await svgUrlToBase64Png(url, size, size)
  } catch (error) {
    // A third party being slow, rate-limiting or down must cost the icon, not
    // the whole card. Reported so the iconless card is not cached as if it were
    // the finished picture, unlike the malformed name rejected above.
    reportMissingAsset()
    console.warn(`[ogimage] Could not load icon "${icon}":`, error instanceof Error ? error.message : error)
    return null
  }
}
