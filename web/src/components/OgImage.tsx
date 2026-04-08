import fs from 'node:fs'
import path from 'node:path'

import { ImageResponse } from '@vercel/og'
import { SITE_URL } from 'astro:env/client'
import sharp from 'sharp'

import defaultOGImageBg from '../assets/ogimage-bg.png'
import defaultOGImage from '../assets/ogimage.png'
import { makeOverallScoreInfo } from '../lib/overallScore'
import { urlWithParams } from '../lib/urls'

import type { VerificationStatus } from '@prisma/client'
import type { APIContext } from 'astro'
import type { Prettify } from 'ts-essentials'

/** Canonical origin for self-fetches — avoids .onion/i2p resolution failures. */
const CANONICAL_ORIGIN = new URL(SITE_URL).origin

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

export const ogImageTemplates = {
  default: (_props: Record<never, never> = {}, context) => {
    return new ImageResponse(
      <img
        src={absoluteUrl(defaultOGImage.src, context)}
        style={{
          width: '100%',
          height: '100%',
        }}
      />,
      defaultOptions
    )
  },
  service: async (
    {
      title,
      description,
      categories,
      score,
      imageUrl,
      verificationStatus,
    }: {
      title: string
      description: string
      categories: {
        name: string
        icon: string
      }[]
      score: number
      imageUrl: string | null
      verificationStatus: VerificationStatus | null
    },
    context
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

    // satori only supports PNG/JPEG/SVG — convert webp/avif via sharp
    let resolvedImageSrc: string | null = null
    if (imageUrl) {
      try {
        const imgUrl = absoluteUrl(imageUrl, context)
        const ext = imageUrl.split('.').pop()?.toLowerCase()
        if (ext === 'webp' || ext === 'avif') {
          const res = await fetch(imgUrl)
          if (res.ok) {
            const buf = await res.arrayBuffer()
            const pngBuf = await sharp(buf).png().resize(140, 140, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer()
            resolvedImageSrc = `data:image/png;base64,${pngBuf.toString('base64')}`
          }
        } else {
          resolvedImageSrc = imgUrl
        }
      } catch {
        // OG image will render without the service icon
      }
    }

    return new ImageResponse(
      <div
        style={{
          color: 'white',
          backgroundImage: `url(${absoluteUrl(defaultOGImageBg.src, context)})`,
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
                categories.map(async (category) => (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
                    <img
                      src={await iconUrl(category.icon, 50)}
                      width={50}
                      height={50}
                      style={{ width: 50, height: 50 }}
                    />
                    {category.name}
                  </span>
                ))
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
  generic: async (
    {
      title,
      description,
      icon,
    }: {
      title: string
      description?: string | null
      icon?: string | null
    },
    context
  ) => {
    const PADING = 80

    return new ImageResponse(
      <div
        style={{
          color: 'white',
          backgroundImage: `url(${absoluteUrl(defaultOGImageBg.src, context)})`,
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

        {!!icon && (
          <img
            src={await iconUrl(icon, 200)}
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
} as const satisfies Record<
  string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (props: any, context: APIContext) => ImageResponse | Promise<ImageResponse | null> | null
>

type OgImageTemplate = keyof typeof ogImageTemplates
type OgImageProps<T extends OgImageTemplate> = Parameters<(typeof ogImageTemplates)[T]>[0]

export type OgImageAllTemplatesWithProps = Prettify<
  {
    // eslint-disable-next-line @typescript-eslint/sort-type-constituents
    [K in OgImageTemplate]: { template: K } & Omit<OgImageProps<K>, 'template'>
  }[OgImageTemplate]
>

export function makeOgImageUrl(
  ogImage: OgImageAllTemplatesWithProps | string | undefined,
  baseUrl: URL | string
) {
  return typeof ogImage === 'string'
    ? new URL(ogImage, baseUrl).href
    : urlWithParams(new URL('/ogimage.png', baseUrl), { data: JSON.stringify(ogImage ?? {}) })
}

// Utilities ------------------------------------------------------------

function absoluteUrl(url: string, _context: Pick<APIContext, 'url'>) {
  return new URL(url, CANONICAL_ORIGIN).href
}

async function svgUrlToBase64Png(svgUrl: string, width?: number, height?: number): Promise<string> {
  // 1. Fetch the SVG file
  const response = await fetch(svgUrl)
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

async function iconUrl(icon: string, size = 30) {
  const [, prefix, name] = /^([^:]+):(.*)$/.exec(icon) ?? []
  if (!prefix || !name) return undefined
  const url = `https://api.iconify.design/${prefix}/${name}.svg`
  const result = await svgUrlToBase64Png(url, size, size)
  return result
}
