import { ImageResponse } from '@vercel/og'
import sharp from 'sharp'

import faviconSvg from '../../public/favicon.svg?raw'
import logoNormalSvg from '../assets/logo/logo-normal.svg?raw'
import logoSmallSvg from '../assets/logo/logo-small.svg?raw'
import { makeOverallScoreInfo } from '../lib/overallScore'
import { getBadgeSize, type BadgeTheme } from '../lib/serviceBadges'

import { makeBlogOgImageTemplate } from './OgImageBlogTemplate'

import type { VerificationStatus } from '@prisma/client'
import type { APIContext } from 'astro'

type OgImageTemplate<TProps> = (
  props: TProps,
  context: APIContext
) => ImageResponse | Promise<ImageResponse | null> | null

type ExtraOgImageTemplateOptions = {
  defaultOptions: ConstructorParameters<typeof ImageResponse>[1]
  absoluteUrl: (url: string) => string
  defaultBackgroundSrc: string
}

type BadgeProps = {
  verificationStatus: VerificationStatus | null
  overallScore: number | null
  averageUserRating: number | null
  kycLevel: number | null
  showScore: boolean
  showRating: boolean
  showKycLevel: boolean
  theme: BadgeTheme
}

const badgeStatusMap: Record<VerificationStatus, { label: string; color: string }> = {
  VERIFICATION_SUCCESS: { label: 'Verified', color: '#40e6c2' },
  APPROVED: { label: 'Approved', color: '#ffffff' },
  COMMUNITY_CONTRIBUTED: { label: 'Community', color: '#facc15' },
  VERIFICATION_FAILED: { label: 'Scam', color: '#ef4444' },
}

const badgeScoreColors = {
  'bg-score-1': '#e26136',
  'bg-score-2': '#eba370',
  'bg-score-3': '#eddb82',
  'bg-score-4': '#8de2d7',
  'bg-score-5': '#3cdd71',
} as const

const logoPngCache = new Map<string, string>()

function badgeStatusInfo(status: VerificationStatus | null, theme: BadgeTheme) {
  if (!status) return { label: 'Unknown', color: '#6b7280' }

  if (status === 'APPROVED' && theme === 'light') {
    return { label: 'Approved', color: '#1f2937' }
  }

  return badgeStatusMap[status]
}

function badgeThemeColors(theme: BadgeTheme) {
  return theme === 'light'
    ? { bg: '#f8f9fa', text: '#1a1a1a', muted: '#6b7280', scoreFg: '#000000' }
    : { bg: '#0a0b0b', text: '#ffffff', muted: '#9ca3af', scoreFg: '#000000' }
}

function badgeScoreColor(scoreInfo: ReturnType<typeof makeOverallScoreInfo>) {
  return (
    Object.entries(badgeScoreColors).find(([className]) =>
      (scoreInfo.classNameBg ?? '').includes(className)
    )?.[1] ?? '#6b7280'
  )
}

function badgeKycLevelColor(kycLevel: number | null) {
  if (kycLevel == null) return '#e26136'
  if (kycLevel <= 1) return '#3cdd71'
  if (kycLevel <= 2) return '#eddb82'
  return '#e26136'
}

function BadgeStatusDot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        flexShrink: 0,
      }}
    />
  )
}

function BadgeCheckIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24">
      <path fill={color} d="m10 15.17l9.192-9.191l1.414 1.414L10 17.999l-6.364-6.364l1.414-1.414z" />
    </svg>
  )
}

function BadgeStarIcon({ size }: { size: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24">
      <path
        fill="#facc15"
        d="m12 18.26l-7.053 3.948l1.575-7.928L.588 8.792l8.027-.952L12 .5l3.385 7.34l8.027.952l-5.934 5.488l1.575 7.928z"
      />
    </svg>
  )
}

function BadgeVerifiedIcon({ size }: { size: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24">
      <path
        fill="#40e6c2"
        d="M10.007 2.104a3 3 0 0 0-3.595 1.49L5.606 5.17a1 1 0 0 1-.436.436l-1.577.806a3 3 0 0 0-1.49 3.595l.546 1.685a1 1 0 0 1 0 .616l-.545 1.685a3 3 0 0 0 1.49 3.595l1.576.806a1 1 0 0 1 .436.436l.806 1.577a3 3 0 0 0 3.595 1.49l1.685-.546a1 1 0 0 1 .616 0l1.685.545a3 3 0 0 0 3.595-1.489l.806-1.577a1 1 0 0 1 .436-.436l1.577-.805a3 3 0 0 0 1.49-3.596l-.546-1.685a1 1 0 0 1 0-.616l.545-1.685a3 3 0 0 0-1.489-3.595l-1.577-.806a1 1 0 0 1-.436-.436l-.805-1.577a3 3 0 0 0-3.596-1.49l-1.685.546a1 1 0 0 1-.616 0zM6.76 11.757l1.414-1.414l2.828 2.829l5.657-5.657l1.415 1.414l-7.072 7.07z"
      />
    </svg>
  )
}

async function getLogoPng(size = 24): Promise<string> {
  const key = `icon-${String(size)}`
  const cached = logoPngCache.get(key)
  if (cached) return cached

  const pngBuffer = await sharp(Buffer.from(faviconSvg)).resize(size, size).png().toBuffer()
  const result = `data:image/png;base64,${pngBuffer.toString('base64')}`
  logoPngCache.set(key, result)
  return result
}

async function getLogoTextPng(height = 24): Promise<string> {
  const key = `text-${String(height)}`
  const cached = logoPngCache.get(key)
  if (cached) return cached

  const pngBuffer = await sharp(Buffer.from(logoNormalSvg)).resize({ height }).png().toBuffer()
  const result = `data:image/png;base64,${pngBuffer.toString('base64')}`
  logoPngCache.set(key, result)
  return result
}

async function getLogoSmallPng(height = 60): Promise<string> {
  const key = `small-${String(height)}`
  const cached = logoPngCache.get(key)
  if (cached) return cached

  const pngBuffer = await sharp(Buffer.from(logoSmallSvg)).resize({ height }).png().toBuffer()
  const result = `data:image/png;base64,${pngBuffer.toString('base64')}`
  logoPngCache.set(key, result)
  return result
}

export function makeExtraOgImageTemplates({
  defaultOptions,
  absoluteUrl,
  defaultBackgroundSrc,
}: ExtraOgImageTemplateOptions) {
  const blogOgImageTemplates = makeBlogOgImageTemplate({
    defaultOptions,
    absoluteUrl,
    defaultBackgroundSrc,
  })

  const badgeLg: OgImageTemplate<BadgeProps & { name: string }> = async (
    {
      name,
      verificationStatus,
      overallScore,
      averageUserRating,
      kycLevel,
      showScore,
      showRating,
      showKycLevel,
      theme,
    }: BadgeProps & { name: string },
    _context
  ) => {
    const status = badgeStatusInfo(verificationStatus, theme)
    const colors = badgeThemeColors(theme)
    const scoreInfo = showScore ? makeOverallScoreInfo(overallScore ?? 0, 10) : null
    const scoreBgColor = scoreInfo ? badgeScoreColor(scoreInfo) : undefined
    const iconPng = await getLogoPng(120)
    const textLogoPng = await getLogoTextPng(28)
    const neutralChipBg = theme === 'light' ? '#eef2f7' : '#1a1d20'
    const ratingTextColor = theme === 'light' ? '#374151' : '#e5e7eb'
    const kycLevelColor = badgeKycLevelColor(kycLevel)
    const size = getBadgeSize('lg')

    return new ImageResponse(
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          height: '100%',
          background: colors.bg,
          padding: '24px 36px',
          fontFamily: 'Inter',
          borderRadius: 20,
          gap: 40,
        }}
      >
        <img src={iconPng} width={120} height={120} style={{ flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 14, justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <span
              style={{
                fontSize: 50,
                color: status.color,
                fontWeight: 700,
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              {status.label}
            </span>
            <span style={{ fontSize: 38, color: colors.muted, lineHeight: 1, whiteSpace: 'nowrap' }}>on</span>
            <img src={textLogoPng} height={36} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, overflow: 'hidden', marginRight: 12 }}>
              {verificationStatus === 'VERIFICATION_SUCCESS' && <BadgeVerifiedIcon size={26} />}
              {verificationStatus === 'APPROVED' && (
                <BadgeCheckIcon color={theme === 'light' ? '#1f2937' : '#ffffff'} size={20} />
              )}
              <span
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  color: colors.text,
                  fontFamily: 'Space Grotesk',
                  lineHeight: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {name}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0, marginRight: 48 }}>
              {showKycLevel && kycLevel != null && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    border: `3px solid ${kycLevelColor}`,
                    background: theme === 'light' ? '#ffffff' : '#101712',
                    borderRadius: 15,
                    height: 64,
                    padding: '0 16px',
                  }}
                >
                  <span style={{ fontSize: 17, fontWeight: 700, color: kycLevelColor }}>KYC</span>
                  <span style={{ fontSize: 32, fontWeight: 700, color: kycLevelColor }}>{kycLevel}</span>
                </div>
              )}
              {showRating && averageUserRating != null && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    background: neutralChipBg,
                    borderRadius: 15,
                    height: 64,
                    padding: '0 18px',
                  }}
                >
                  <BadgeStarIcon size={26} />
                  <span style={{ fontSize: 28, color: ratingTextColor, fontWeight: 700 }}>
                    {averageUserRating.toFixed(1)}/5
                  </span>
                </div>
              )}
              {scoreInfo && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: scoreBgColor,
                    borderRadius: 16,
                    width: 74,
                    height: 74,
                  }}
                >
                  <span style={{ fontSize: 36, fontWeight: 700, color: colors.scoreFg }}>
                    {scoreInfo.formattedScore}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>,
      { ...defaultOptions, width: size.width, height: size.height }
    )
  }

  const badgeSm: OgImageTemplate<BadgeProps> = async (
    {
      verificationStatus,
      overallScore,
      averageUserRating,
      kycLevel,
      showScore,
      showRating,
      showKycLevel,
      theme,
    }: BadgeProps,
    _context
  ) => {
    const status = badgeStatusInfo(verificationStatus, theme)
    const colors = badgeThemeColors(theme)
    const scoreInfo = showScore ? makeOverallScoreInfo(overallScore ?? 0, 10) : null
    const scoreBgColor = scoreInfo ? badgeScoreColor(scoreInfo) : undefined
    const logoSmallPng = await getLogoSmallPng(72)
    const neutralChipBg = theme === 'light' ? '#eef2f7' : '#1a1d20'
    const ratingTextColor = theme === 'light' ? '#374151' : '#e5e7eb'
    const kycLevelColor = badgeKycLevelColor(kycLevel)
    const size = getBadgeSize('sm')

    return new ImageResponse(
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          height: '100%',
          background: colors.bg,
          padding: '20px 28px',
          fontFamily: 'Inter',
          borderRadius: 16,
          gap: 46,
        }}
      >
        <img src={logoSmallPng} height={72} style={{ flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BadgeStatusDot color={status.color} size={12} />
            <span style={{ fontSize: 28, color: status.color, fontWeight: 700 }}>{status.label}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {showKycLevel && kycLevel != null && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  border: `2px solid ${kycLevelColor}`,
                  background: theme === 'light' ? '#ffffff' : '#101712',
                  borderRadius: 10,
                  width: 74,
                  height: 50,
                  padding: '0 11px',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 700, color: kycLevelColor }}>KYC</span>
                <span style={{ fontSize: 26, fontWeight: 700, color: kycLevelColor }}>{kycLevel}</span>
              </div>
            )}
            {showRating && averageUserRating != null && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  background: neutralChipBg,
                  borderRadius: 10,
                  width: 108,
                  height: 50,
                  padding: '0 13px 0 11px',
                }}
              >
                <BadgeStarIcon size={21} />
                <span style={{ fontSize: 21, color: ratingTextColor, fontWeight: 700 }}>
                  {averageUserRating.toFixed(1)}/5
                </span>
              </div>
            )}
            {scoreInfo && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: scoreBgColor,
                  borderRadius: 10,
                  width: 58,
                  height: 50,
                }}
              >
                <span style={{ fontSize: 27, fontWeight: 700, color: colors.scoreFg }}>
                  {scoreInfo.formattedScore}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>,
      { ...defaultOptions, width: size.width, height: size.height }
    )
  }

  const badgeXs: OgImageTemplate<Pick<BadgeProps, 'theme' | 'verificationStatus'>> = async (
    { verificationStatus, theme }: Pick<BadgeProps, 'theme' | 'verificationStatus'>,
    _context
  ) => {
    const status = badgeStatusInfo(verificationStatus, theme)
    const colors = badgeThemeColors(theme)
    const logoTextPng = await getLogoTextPng(22)
    const size = getBadgeSize('xs')

    return new ImageResponse(
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: colors.bg,
          padding: '10px 20px',
          fontFamily: 'Inter',
          borderRadius: 24,
          gap: 14,
        }}
      >
        <img src={logoTextPng} height={22} />
        <BadgeStatusDot color={status.color} size={10} />
        <span style={{ fontSize: 18, color: status.color, fontWeight: 600 }}>{status.label}</span>
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
