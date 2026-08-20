import type { ReactNode } from 'react'

import satori, { type Font, type SatoriOptions } from 'satori'
import sharp from 'sharp'

import { loadOgImageAsset } from './ogImageAssetLoader'
import { ogImageFonts } from './ogImageFonts'

import type { APIContext } from 'astro'

export type OgImageRenderOptions = {
  width: number
  height: number
  fonts: Font[]
  debug?: boolean
  loadAdditionalAsset?: SatoriOptions['loadAdditionalAsset']
}

export type OgImageRender = Promise<Response | null> | Response | null
export type OgImageTemplate<TProps> = (props: TProps, context: APIContext) => OgImageRender

export const defaultOgImageRenderOptions = {
  width: 1200,
  height: 630,
  fonts: ogImageFonts,
} as const satisfies OgImageRenderOptions

export async function renderOgImage(element: ReactNode, options: OgImageRenderOptions): Promise<Response> {
  const svg = await satori(element, {
    width: options.width,
    height: options.height,
    fonts: options.fonts,
    debug: options.debug,
    loadAdditionalAsset: options.loadAdditionalAsset ?? loadOgImageAsset,
  })
  const png = await sharp(Buffer.from(svg)).resize(options.width).png().toBuffer()
  const pngBytes = new Uint8Array(png)

  return new Response(pngBytes, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(png.byteLength),
      'Cache-Control':
        process.env.NODE_ENV === 'development'
          ? 'no-cache, no-store'
          : 'public, immutable, no-transform, max-age=31536000',
    },
  })
}
