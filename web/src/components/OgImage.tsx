import fs from 'node:fs'
import path from 'node:path'

import { ImageResponse } from '@vercel/og'

import defaultOGImageBg from '../assets/ogimage-bg.png'
import defaultOGImage from '../assets/ogimage.png'
import { urlWithParams } from '../lib/urls'

import type { APIContext } from 'astro'
import type { Prettify } from 'ts-essentials'

export type GenericOgImageProps = Partial<Record<string, string>>

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
  ],
} as const satisfies ConstructorParameters<typeof ImageResponse>[1]

function absoluteUrl(url: string, context: Pick<APIContext, 'url'>) {
  return new URL(url, context.url.origin).href
}

export const ogImageTemplates = {
  default: (_props: Record<never, never> = {}, context: APIContext) => {
    return new ImageResponse(
      (
        <img
          src={absoluteUrl(defaultOGImage.src, context)}
          style={{
            width: '100%',
            height: '100%',
          }}
        />
      ),
      defaultOptions
    )
  },
  generic: ({ title }: { title?: string }, context) => {
    return new ImageResponse(
      (
        <div
          style={{
            fontSize: 100,
            fontWeight: 'bold',
            color: 'white',
            backgroundImage: `url(${absoluteUrl(defaultOGImageBg.src, context)})`,
            width: '100%',
            height: '100%',
            padding: '50px 200px',
            textAlign: 'center',
            justifyContent: 'space-around',
            alignItems: 'center',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <span>{title}</span>
        </div>
      ),
      defaultOptions
    )
  },
} as const satisfies Record<string, (props: GenericOgImageProps, context: APIContext) => ImageResponse | null>

type OgImageTemplate = keyof typeof ogImageTemplates
type OgImageProps<T extends OgImageTemplate> = Parameters<(typeof ogImageTemplates)[T]>[0]
// eslint-disable-next-line @typescript-eslint/sort-type-constituents
export type OgImageAllTemplatesWithGenericProps = { template: OgImageTemplate } & GenericOgImageProps

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
    : urlWithParams(new URL('/ogimage.png', baseUrl), ogImage ?? {})
}
