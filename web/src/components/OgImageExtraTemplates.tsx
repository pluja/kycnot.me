import sharp from 'sharp'

import logoNormalSvg from '../assets/logo/logo-normal.svg?raw'
import { renderOgImage } from '../lib/ogImageRenderer'
import { makeOverallScoreInfo } from '../lib/overallScore'
import { getBadgeSize, type BadgeTheme } from '../lib/serviceBadges'

import { makeBlogOgImageTemplate } from './OgImageBlogTemplate'

import type { OgImageProps } from '../lib/ogImageProps'
import type { OgImageRenderOptions, OgImageTemplate } from '../lib/ogImageRenderer'
import type { VerificationStatus } from '@prisma/client'

type ExtraOgImageTemplateOptions = {
  defaultOptions: OgImageRenderOptions
  defaultBackgroundSrc: string
}

type BadgeProps = OgImageProps<'badge-sm'>
type BadgeVerdict = NonNullable<BadgeProps['verdict']>

const badgeStatusLabels: Record<VerificationStatus, string> = {
  VERIFICATION_SUCCESS: 'Verified',
  APPROVED: 'Approved',
  COMMUNITY_CONTRIBUTED: 'Community',
  VERIFICATION_FAILED: 'Scam',
}

// Light colours are darker shades of the dark ones, so each still reads on white.
const badgePalettes = {
  dark: {
    background: 'linear-gradient(135deg, #111816 0%, #0a0b0b 55%, #0a0b0b 100%)',
    border: 'rgba(255, 255, 255, 0.09)',
    text: '#ffffff',
    muted: '#8b958f',
    tile: 'rgba(255, 255, 255, 0.045)',
    tileBorder: 'rgba(255, 255, 255, 0.08)',
    status: {
      VERIFICATION_SUCCESS: '#40e6c2',
      APPROVED: '#ffffff',
      COMMUNITY_CONTRIBUTED: '#facc15',
      VERIFICATION_FAILED: '#ef4444',
    },
    glow: {
      VERIFICATION_SUCCESS: 'rgba(64, 230, 194, 0.16)',
      APPROVED: 'rgba(59, 219, 120, 0.12)',
      COMMUNITY_CONTRIBUTED: 'rgba(250, 204, 21, 0.12)',
      VERIFICATION_FAILED: 'rgba(239, 68, 68, 0.14)',
    },
    good: '#3cdd71',
    caution: '#eddb82',
    bad: '#e26136',
    scores: ['#e26136', '#eba370', '#eddb82', '#8de2d7', '#3cdd71'],
  },
  light: {
    background: 'linear-gradient(135deg, #eef7f2 0%, #fafbfa 55%, #fafbfa 100%)',
    border: 'rgba(0, 0, 0, 0.09)',
    text: '#111827',
    muted: '#6b7280',
    tile: 'rgba(0, 0, 0, 0.035)',
    tileBorder: 'rgba(0, 0, 0, 0.07)',
    status: {
      VERIFICATION_SUCCESS: '#0d9488',
      APPROVED: '#111827',
      COMMUNITY_CONTRIBUTED: '#a16207',
      VERIFICATION_FAILED: '#dc2626',
    },
    glow: {
      VERIFICATION_SUCCESS: 'rgba(13, 148, 136, 0.12)',
      APPROVED: 'rgba(22, 163, 74, 0.1)',
      COMMUNITY_CONTRIBUTED: 'rgba(161, 98, 7, 0.1)',
      VERIFICATION_FAILED: 'rgba(220, 38, 38, 0.1)',
    },
    good: '#16a34a',
    caution: '#a16207',
    bad: '#c2410c',
    scores: ['#c2410c', '#d97706', '#a16207', '#0d9488', '#16a34a'],
  },
} as const satisfies Record<BadgeTheme, unknown>

const badgeScoreClasses = ['bg-score-1', 'bg-score-2', 'bg-score-3', 'bg-score-4', 'bg-score-5'] as const

const logoPngCache = new Map<string, string>()

function badgeStyle(status: VerificationStatus, theme: BadgeTheme) {
  const palette = badgePalettes[theme]
  return {
    palette,
    label: badgeStatusLabels[status],
    color: palette.status[status],
    glow: palette.glow[status],
  }
}

function badgeScoreColor(theme: BadgeTheme, overallScore: number) {
  const { classNameBg } = makeOverallScoreInfo(overallScore, 10)
  const index = badgeScoreClasses.findIndex((className) => (classNameBg ?? '').includes(className))
  return badgePalettes[theme].scores[index] ?? badgePalettes[theme].muted
}

function badgeKycLevelColor(theme: BadgeTheme, kycLevel: number) {
  const palette = badgePalettes[theme]
  return kycLevel <= 1 ? palette.good : kycLevel <= 2 ? palette.caution : palette.bad
}

function BadgeStatusIcon({
  status,
  color,
  size,
}: {
  status: VerificationStatus
  color: string
  size: number
}) {
  return status === 'VERIFICATION_SUCCESS' ? (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24">
      <path
        fill={color}
        d="M10.007 2.104a3 3 0 0 0-3.595 1.49L5.606 5.17a1 1 0 0 1-.436.436l-1.577.806a3 3 0 0 0-1.49 3.595l.546 1.685a1 1 0 0 1 0 .616l-.545 1.685a3 3 0 0 0 1.49 3.595l1.576.806a1 1 0 0 1 .436.436l.806 1.577a3 3 0 0 0 3.595 1.49l1.685-.546a1 1 0 0 1 .616 0l1.685.545a3 3 0 0 0 3.595-1.489l.806-1.577a1 1 0 0 1 .436-.436l1.577-.805a3 3 0 0 0 1.49-3.596l-.546-1.685a1 1 0 0 1 0-.616l.545-1.685a3 3 0 0 0-1.489-3.595l-1.577-.806a1 1 0 0 1-.436-.436l-.805-1.577a3 3 0 0 0-3.596-1.49l-1.685.546a1 1 0 0 1-.616 0zM6.76 11.757l1.414-1.414l2.828 2.829l5.657-5.657l1.415 1.414l-7.072 7.07z"
      />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24">
      <path
        fill={color}
        d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10s-4.477 10-10 10m-.997-6l7.07-7.071l-1.414-1.414l-5.656 5.657l-2.829-2.829l-1.414 1.414z"
      />
    </svg>
  )
}

type BadgeFigureOptions = {
  theme: BadgeTheme
  overallScore: number | null
  kycLevel: number | null
  showScore: boolean
  showKycLevel: boolean
  verdict: BadgeVerdict | null
}

// badgeVerdictWords shortens the summary's verdict to one word; the "User reviews" label under it says what it is.
const badgeVerdictWords = {
  good: 'Positive',
  caution: 'Mixed',
  bad: 'Negative',
} as const satisfies Record<BadgeVerdict, string>

type BadgeFigure = {
  value: string
  suffix?: string
  label: string
  color: string
  // word is a verdict: set smaller than a number, beside a comment icon.
  word?: boolean
}

function badgeFigures({
  theme,
  overallScore,
  kycLevel,
  showScore,
  showKycLevel,
  verdict,
}: BadgeFigureOptions) {
  const figures: BadgeFigure[] = []
  if (showKycLevel && kycLevel != null) {
    figures.push({ value: String(kycLevel), label: 'KYC level', color: badgeKycLevelColor(theme, kycLevel) })
  }
  if (showScore && overallScore != null) {
    figures.push({
      value: makeOverallScoreInfo(overallScore, 10).formattedScore,
      suffix: '/10',
      label: 'Score',
      color: badgeScoreColor(theme, overallScore),
    })
  }
  if (verdict) {
    figures.push({
      value: badgeVerdictWords[verdict],
      label: 'User reviews',
      color: badgePalettes[theme][verdict],
      word: true,
    })
  }
  return figures
}

function BadgeCommentIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24">
      <path
        fill={color}
        d="M7.291 20.824L2 22l1.176-5.291A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10s-4.477 10-10 10a9.96 9.96 0 0 1-4.709-1.176"
      />
    </svg>
  )
}

// BadgeFigures sets each figure as a column: the value large, a plain label under it, thin rules between. Badges
// are often shown at half size or less, so nothing is set smaller than the label size.
function BadgeFigures({
  figures,
  theme,
  valueSize,
  labelSize,
  fill = false,
}: {
  figures: BadgeFigure[]
  theme: BadgeTheme
  valueSize: number
  labelSize: number
  // fill spreads the figures over the full width in equal columns.
  fill?: boolean
}) {
  const palette = badgePalettes[theme]
  const wordSize = Math.round(valueSize * 0.56)
  return (
    <div
      style={{ display: 'flex', alignItems: 'stretch', flexShrink: 0, ...(fill ? { width: '100%' } : {}) }}
    >
      {figures.map((figure, index) => (
        <div
          key={figure.label}
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: labelSize * 0.35,
            padding: `0 ${String(labelSize * 1.1)}px`,
            ...(fill ? { flex: 1 } : {}),
            ...(index > 0
              ? { borderLeft: `${String(Math.max(2, labelSize / 10))}px solid ${palette.border}` }
              : {}),
          }}
        >
          {figure.word ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: wordSize * 0.3 }}>
              <BadgeCommentIcon color={figure.color} size={wordSize * 0.95} />
              <span style={{ fontSize: wordSize, fontWeight: 700, color: figure.color, lineHeight: 1 }}>
                {figure.value}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: valueSize * 0.06 }}>
              <span style={{ fontSize: valueSize, fontWeight: 700, color: figure.color, lineHeight: 0.9 }}>
                {figure.value}
              </span>
              {figure.suffix && (
                <span
                  style={{ fontSize: valueSize * 0.45, fontWeight: 700, color: palette.muted, lineHeight: 1 }}
                >
                  {figure.suffix}
                </span>
              )}
            </div>
          )}
          <span
            style={{
              fontSize: labelSize,
              fontWeight: 700,
              color: palette.muted,
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}
          >
            {figure.label}
          </span>
        </div>
      ))}
    </div>
  )
}

const LOGO_GREEN = '#3bdb78'
// LOGO_GREEN_ON_LIGHT is the wordmark's green on light badges, where the brand green is too faint on white.
const LOGO_GREEN_ON_LIGHT = '#15803d'

async function getWordmarkPng(height: number, theme: BadgeTheme): Promise<string> {
  const key = `${String(height)}-${theme}`
  const cached = logoPngCache.get(key)
  if (cached) return cached

  const svg = theme === 'light' ? logoNormalSvg.replaceAll(LOGO_GREEN, LOGO_GREEN_ON_LIGHT) : logoNormalSvg
  const pngBuffer = await sharp(Buffer.from(svg)).resize({ height }).png().toBuffer()
  const result = `data:image/png;base64,${pngBuffer.toString('base64')}`
  logoPngCache.set(key, result)
  return result
}

export function makeExtraOgImageTemplates({
  defaultOptions,
  defaultBackgroundSrc,
}: ExtraOgImageTemplateOptions) {
  const blogOgImageTemplates = makeBlogOgImageTemplate({
    defaultOptions,
    defaultBackgroundSrc,
  })

  const badgeLg: OgImageTemplate<OgImageProps<'badge-lg'>> = async (
    { site, verificationStatus, theme, ...options },
    _context
  ) => {
    const { palette, label, color, glow } = badgeStyle(verificationStatus, theme)
    const size = getBadgeSize('lg')
    const figures = badgeFigures({ theme, ...options })
    // Three figures leave less room, so the whole badge steps down one size rather than clipping.
    const crowded = figures.length > 2
    const wordmarkHeight = crowded ? 40 : 50
    const wordmarkPng = await getWordmarkPng(wordmarkHeight, theme)
    const labelSize = crowded ? 22 : 26
    const siteElement = (
      <span
        style={{
          maxWidth: crowded ? 520 : 480,
          fontSize: crowded ? 30 : 34,
          fontWeight: 700,
          fontFamily: 'Space Grotesk',
          color: palette.text,
          lineHeight: 1.1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {site}
      </span>
    )

    return renderOgImage(
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: figures.length ? 'space-between' : 'center',
          width: '100%',
          height: '100%',
          padding: crowded ? '0 36px' : '0 44px',
          gap: crowded ? 24 : 40,
          fontFamily: 'Inter',
          borderRadius: 28,
          border: `3px solid ${palette.border}`,
          backgroundColor: theme === 'light' ? '#fafbfa' : '#0a0b0b',
          backgroundImage: `radial-gradient(circle at 15% 40%, ${glow} 0%, transparent 45%), ${palette.background}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: figures.length ? 'flex-start' : 'center',
            gap: 20,
            flexShrink: 0,
          }}
        >
          <img src={wordmarkPng} height={wordmarkHeight} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <BadgeStatusIcon status={verificationStatus} color={color} size={crowded ? 44 : 52} />
            <span
              style={{
                fontSize: crowded ? 50 : 60,
                fontWeight: 700,
                color,
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </span>
          </div>
          {!figures.length && siteElement}
        </div>
        {figures.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: crowded ? 14 : 18,
              minWidth: 0,
            }}
          >
            {siteElement}
            <BadgeFigures
              figures={figures}
              theme={theme}
              valueSize={crowded ? 66 : 84}
              labelSize={labelSize}
            />
          </div>
        )}
      </div>,
      { ...defaultOptions, width: size.width, height: size.height }
    )
  }

  const badgeSm: OgImageTemplate<BadgeProps> = async (
    { verificationStatus, theme, ...options }: BadgeProps,
    _context
  ) => {
    const { palette, label, color, glow } = badgeStyle(verificationStatus, theme)
    const size = getBadgeSize('sm')
    const figures = badgeFigures({ theme, ...options })
    const wordmarkPng = await getWordmarkPng(figures.length ? 28 : 34, theme)

    return renderOgImage(
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: figures.length ? 'stretch' : 'center',
          width: '100%',
          height: '100%',
          padding: '0 26px',
          gap: figures.length ? 16 : 18,
          fontFamily: 'Inter',
          borderRadius: 22,
          border: `3px solid ${palette.border}`,
          backgroundColor: theme === 'light' ? '#fafbfa' : '#0a0b0b',
          backgroundImage: `radial-gradient(circle at 20% 25%, ${glow} 0%, transparent 50%), ${palette.background}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: figures.length ? 'row' : 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: figures.length ? 16 : 16,
          }}
        >
          <img src={wordmarkPng} height={figures.length ? 28 : 34} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BadgeStatusIcon status={verificationStatus} color={color} size={figures.length ? 32 : 40} />
            <span style={{ fontSize: figures.length ? 34 : 44, fontWeight: 700, color, lineHeight: 1 }}>
              {label}
            </span>
          </div>
        </div>
        {figures.length > 0 && (
          <div style={{ display: 'flex', borderTop: `2px solid ${palette.border}`, paddingTop: 14 }}>
            <BadgeFigures figures={figures} theme={theme} valueSize={46} labelSize={19} fill />
          </div>
        )}
      </div>,
      { ...defaultOptions, width: size.width, height: size.height }
    )
  }

  const badgeXs: OgImageTemplate<OgImageProps<'badge-xs'>> = async (
    { verificationStatus, theme }: OgImageProps<'badge-xs'>,
    _context
  ) => {
    const { palette, label, color } = badgeStyle(verificationStatus, theme)
    const wordmarkPng = await getWordmarkPng(19, theme)
    const size = getBadgeSize('xs')

    return renderOgImage(
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          gap: 12,
          padding: '0 18px',
          fontFamily: 'Inter',
          borderRadius: 14,
          border: `2px solid ${palette.border}`,
          backgroundColor: theme === 'light' ? '#fafbfa' : '#0a0b0b',
          backgroundImage: palette.background,
        }}
      >
        <img src={wordmarkPng} height={19} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <BadgeStatusIcon status={verificationStatus} color={color} size={22} />
          <span style={{ fontSize: 21, fontWeight: 700, color, lineHeight: 1 }}>{label}</span>
        </div>
      </div>,
      { ...defaultOptions, width: size.width, height: size.height }
    )
  }

  return {
    ...blogOgImageTemplates,
    'badge-lg': badgeLg,
    'badge-sm': badgeSm,
    'badge-xs': badgeXs,
  } as const
}
