import { ImageResponse } from '@vercel/og'

import { readLocalImageAsDataUri } from '../lib/localImageDataUri'

import type { APIContext } from 'astro'

type OgImageTemplate<TProps> = (
  props: TProps,
  context: APIContext
) => ImageResponse | Promise<ImageResponse | null> | null

type BlogOgImageTemplateOptions = {
  defaultBackgroundSrc: string
  defaultOptions: ConstructorParameters<typeof ImageResponse>[1]
}

export function makeBlogOgImageTemplate({
  defaultBackgroundSrc,
  defaultOptions,
}: BlogOgImageTemplateOptions) {
  const blog: OgImageTemplate<{
    title: string
    coverImage?: string | null
    author?: string | null
    publishedAt?: string | null
  }> = async (
    {
      title,
      coverImage,
      author,
      publishedAt,
    }: {
      title: string
      coverImage?: string | null
      author?: string | null
      publishedAt?: string | null
    },
    _context
  ) => {
    const padding = 80

    // Null when the cover is missing or unreadable; the OG image then falls
    // back to the default background rather than failing the whole render.
    const resolvedCoverSrc = coverImage
      ? await readLocalImageAsDataUri(coverImage, {
          convert: { width: 1200, height: 630, fit: 'cover' },
        })
      : null

    const backgroundImage = resolvedCoverSrc ? `url(${resolvedCoverSrc})` : `url(${defaultBackgroundSrc})`
    const formattedDate = publishedAt
      ? new Date(publishedAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : null

    return new ImageResponse(
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundImage,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 35%, rgba(0,0,0,0.55) 65%, rgba(0,0,0,0.92) 100%)',
          }}
        />

        <div
          style={{
            position: 'absolute',
            top: padding,
            left: padding,
            right: padding,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="white" width={260} viewBox="0 0 204 28">
            <path d="M1 0a1 1 0 0 0-1 1v26a1 1 0 0 0 1 1h74a1 1 0 0 0 1-1V1a1 1 0 0 0-1-1Zm4 4h2a1 1 0 0 1 1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 1 1 1v3h3a1 1 0 0 1 1 1v3h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3h-3a1 1 0 0 1-1-1v-3H9a1 1 0 0 0-1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm12 0h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm12.82 0h2.37a1 1 0 0 1 .85.46L38 12.27l4.97-7.8A1 1 0 0 1 43.8 4h2.37a1 1 0 0 1 .85 1.54l-6.87 10.8a1 1 0 0 0-.16.53V23a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-6.13a1 1 0 0 0-.15-.53l-6.87-10.8A1 1 0 0 1 29.82 4ZM57 4h14a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H56v12h15a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H57a1 1 0 0 1-1-1v-3h-3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h3V5a1 1 0 0 1 1-1zm24 0a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V7.6l9.18 15.9c.18.3.5.5.86.5H99a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v15.4L86.83 4.5a1 1 0 0 0-.87-.5Zm29 0a1 1 0 0 0-1 1v3h12V5a1 1 0 0 0-1-1zm11 4v12h3a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1zm0 12h-12v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1zm-12 0V8h-3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1zm21-16a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V8h4v15a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V8h4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zm27 0a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V11.4l5.53 12.02a1 1 0 0 0 .91.58h3.12a1 1 0 0 0 .91-.58L176 11.4V23a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-3.36a1 1 0 0 0-.9.58L168 19.21l-6.73-14.63a1 1 0 0 0-.9-.58Zm32 0a1 1 0 0 0-1 1v3h15a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zm-1 4h-3a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-14a1 1 0 0 1-1-1v-3h7a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-7zm-38 12a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1z" />
          </svg>
          <span
            style={{
              fontSize: 32,
              color: 'white',
              fontFamily: 'Inter',
              fontWeight: 700,
              textShadow: '0 2px 8px rgba(0,0,0,0.7)',
            }}
          >
            BLOG
          </span>
        </div>

        <div
          style={{
            position: 'absolute',
            left: padding,
            right: padding,
            bottom: padding,
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          <span
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: 'white',
              fontFamily: 'Space Grotesk',
              lineHeight: 1.1,
              textShadow: '0 4px 16px rgba(0,0,0,0.85)',
              maxHeight: 320,
              overflow: 'hidden',
            }}
          >
            {title}
          </span>
          {(author ?? formattedDate) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                fontSize: 30,
                color: 'rgba(255,255,255,0.92)',
                fontFamily: 'Inter',
                textShadow: '0 2px 8px rgba(0,0,0,0.85)',
              }}
            >
              {author && <span>by {author}</span>}
              {author && formattedDate && <span style={{ color: 'rgba(255,255,255,0.55)' }}>·</span>}
              {formattedDate && <span>{formattedDate}</span>}
            </div>
          )}
        </div>
      </div>,
      defaultOptions
    )
  }

  return { blog } as const
}
