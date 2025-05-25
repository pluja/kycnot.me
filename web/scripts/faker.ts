import crypto from 'crypto'

import { faker } from '@faker-js/faker'
import {
  AnnouncementType,
  AttributeCategory,
  AttributeType,
  CommentStatus,
  Currency,
  EventType,
  PrismaClient,
  ServiceSuggestionStatus,
  ServiceSuggestionType,
  ServiceUserRole,
  VerificationStatus,
  type Prisma,
  type User,
  type ServiceVisibility,
} from '@prisma/client'
import { uniqBy } from 'lodash-es'
import { generateUsername } from 'unique-username-generator'

import { kycLevels } from '../src/constants/kycLevels'
import { undefinedIfEmpty } from '../src/lib/arrays'
import { transformCase } from '../src/lib/strings'

// Exit if not in development mode
if (process.env.NODE_ENV === 'production') {
  console.error("This script can't run in production mode")
  process.exit(1)
}

/** Duplicate of parseIntWithFallback in src/lib/numbers.ts */
function parseIntWithFallback<F = null>(value: unknown, fallback: F = null as F) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return fallback
  return parsed
}

/** Duplicate of hashUserSecretToken in src/lib/userSecretToken.ts */
function hashUserSecretToken(token: string): string {
  return crypto.createHash('sha512').update(token).digest('hex')
}

/** Duplicate of generateUserSecretToken in src/lib/userSecretToken.ts */
export function generateUserSecretToken() {
  const LOWERCASE_VOWEL_CHARACTERS = ['a', 'e', 'i', 'o', 'u'] as const
  return [
    faker.helpers.arrayElement(LOWERCASE_VOWEL_CHARACTERS),
    faker.string.alpha({ length: 1, casing: 'lower', exclude: LOWERCASE_VOWEL_CHARACTERS }),
    faker.helpers.arrayElement(LOWERCASE_VOWEL_CHARACTERS),
    faker.string.alpha({ length: 1, casing: 'lower', exclude: LOWERCASE_VOWEL_CHARACTERS }),

    faker.helpers.arrayElement(LOWERCASE_VOWEL_CHARACTERS),
    faker.string.alpha({ length: 1, casing: 'lower', exclude: LOWERCASE_VOWEL_CHARACTERS }),
    faker.helpers.arrayElement(LOWERCASE_VOWEL_CHARACTERS),
    faker.string.alpha({ length: 1, casing: 'lower', exclude: LOWERCASE_VOWEL_CHARACTERS }),

    faker.helpers.arrayElement(LOWERCASE_VOWEL_CHARACTERS),
    faker.string.alpha({ length: 1, casing: 'lower', exclude: LOWERCASE_VOWEL_CHARACTERS }),
    faker.helpers.arrayElement(LOWERCASE_VOWEL_CHARACTERS),
    faker.string.alpha({ length: 1, casing: 'lower', exclude: LOWERCASE_VOWEL_CHARACTERS }),

    faker.helpers.arrayElement(LOWERCASE_VOWEL_CHARACTERS),
    faker.string.alpha({ length: 1, casing: 'lower', exclude: LOWERCASE_VOWEL_CHARACTERS }),
    faker.helpers.arrayElement(LOWERCASE_VOWEL_CHARACTERS),
    faker.string.alpha({ length: 1, casing: 'lower', exclude: LOWERCASE_VOWEL_CHARACTERS }),

    faker.string.numeric(1),
    faker.string.numeric(1),
    faker.string.numeric(1),
    faker.string.numeric(1),
  ].join('')
}

/** Duplicate of createAccount in src/lib/accountCreate.ts */
async function createAccount(preGeneratedToken?: string) {
  const token = preGeneratedToken ?? generateUserSecretToken()
  const verifiedLink = faker.helpers.maybe(() => faker.internet.url(), { probability: 0.5 })

  const user = await prisma.user.create({
    data: {
      name: `${generateUsername('_')}_${Math.floor(Math.random() * 10000).toString()}`,
      secretTokenHash: hashUserSecretToken(token),
      notificationPreferences: { create: {} },
      verifiedLink,
      verified: !!verifiedLink,
      admin: faker.datatype.boolean({ probability: 0.1 }),
      moderator: faker.datatype.boolean({ probability: 0.1 }),
    },
    include: {
      serviceAffiliations: true,
    },
  })

  return { token, user }
}

// Parse command line arguments
const args = process.argv.slice(2)
const shouldCleanup = args.includes('--cleanup') || args.includes('-c')
const onlyCleanup = args.includes('--only-cleanup') || args.includes('-oc')

// Parse number of services from --services or -s flag
const servicesArg = args.find((arg) => arg.startsWith('--services=') || arg.startsWith('-s='))
const numServices = parseIntWithFallback(servicesArg?.split('=')[1], 100) // Default to 100 if not specified

if (isNaN(numServices) || numServices < 1) {
  console.error('❌ Invalid number of services specified. Must be a positive number.')
  process.exit(1)
}

const prisma = new PrismaClient()

const generateFakeAttribute = () => {
  const title = transformCase(faker.lorem.words({ min: 1, max: 4 }), 'sentence')
  const slug = `${faker.helpers.slugify(title).toLowerCase()}-${faker.string.numeric({ length: 2 })}`
  const type = faker.helpers.arrayElement(Object.values(AttributeType))
  const category = faker.helpers.arrayElement(Object.values(AttributeCategory))
  const attributePointsByType = {
    [AttributeType.GOOD]: { min: 0, max: 10 },
    [AttributeType.BAD]: { min: -10, max: 0 },
    [AttributeType.WARNING]: { min: -5, max: 0 },
    [AttributeType.INFO]: { min: 0, max: 0 },
  } as const satisfies Record<AttributeType, Parameters<typeof faker.number.int>[0]>
  const attributePointsByTypeWrongCategory = {
    [AttributeType.GOOD]: { min: 0, max: 1 },
    [AttributeType.BAD]: { min: -1, max: 0 },
    [AttributeType.WARNING]: { min: -1, max: 0 },
    [AttributeType.INFO]: { min: 0, max: 0 },
  } as const satisfies Record<AttributeType, Parameters<typeof faker.number.int>[0]>

  return {
    title,
    slug,
    description: faker.lorem.sentences({ min: 1, max: 3 }),
    privacyPoints:
      category === 'PRIVACY'
        ? faker.number.int(attributePointsByType[type])
        : faker.number.int(attributePointsByTypeWrongCategory[type]),
    trustPoints:
      category === 'TRUST'
        ? faker.number.int(attributePointsByType[type])
        : faker.number.int(attributePointsByTypeWrongCategory[type]),
    category,
    type,
  } as const satisfies Prisma.AttributeCreateInput
}

const categoriesToCreate = [
  {
    name: 'Exchange',
    slug: 'exchange',
    icon: 'ri:arrow-left-right-fill',
  },
  {
    name: 'VPN',
    slug: 'vpn',
    icon: 'ri:door-lock-fill',
  },
  {
    name: 'Email',
    slug: 'email',
    icon: 'ri:mail-fill',
  },
  {
    name: 'Hosting',
    slug: 'hosting',
    icon: 'ri:server-fill',
  },
  {
    name: 'VPS',
    slug: 'vps',
    icon: 'ri:function-add-fill',
  },
  {
    name: 'Gift Cards',
    slug: 'gift-cards',
    icon: 'ri:gift-line',
  },
  {
    name: 'Goods',
    slug: 'goods',
    icon: 'ri:shopping-basket-fill',
  },
  {
    name: 'Travel',
    slug: 'travel',
    icon: 'ri:plane-fill',
  },
  {
    name: 'SMS',
    slug: 'sms',
    icon: 'ri:message-2-fill',
  },
  {
    name: 'Store',
    slug: 'store',
    icon: 'ri:store-2-line',
  },
  {
    name: 'Tool',
    slug: 'tool',
    icon: 'ri:tools-fill',
  },
  {
    name: 'Market',
    slug: 'market',
    icon: 'ri:price-tag-3-line',
  },
  {
    name: 'Aggregator',
    slug: 'aggregator',
    icon: 'ri:list-ordered',
  },
  {
    name: 'AI',
    slug: 'ai',
    icon: 'ri:ai-generate-2',
  },
  {
    name: 'CEX',
    slug: 'cex',
    icon: 'ri:rotate-lock-fill',
  },
  {
    name: 'DEX',
    slug: 'dex',
    icon: 'ri:fediverse-line',
  },
] as const satisfies Prisma.CategoryCreateInput[]

const serviceNames = [
  'MajesticBank',
  'eXch',
  'Mullvad VPN',
  'iVPN',
  'Coinbase',
  'Binance',
  'Kraken',
  'Coinbase Pro',
  'Bitfinex',
  'KuCoin',
  'Bitstamp',
  'Gemini',
  'Bitpanda',
  'Bitpanda Pro',
  'MyNymBox',
  'ProtonVPN',
  'Proxystore',
  'WizardSwap',
  'OrangeFren',
  'Trocador',
  'Bisq',
  'Sms4Sats',
  'Vexl',
  'Haveno',
  'BasicSwap Beta',
  'TheLongServiceName Service',
  'TheVeryVeryVeryLongServiceName Service',
  'The Very Very Very Long Service Name Service',
  'The %4W3*ird _?sym[bol$] $#ervice',
  'The <script>alert("XSS")</script> Service',
  'Random',
  'Anonymous',
  'Atomic Technologies',
  'France',
  '8a9a j9a0',
]

const serviceDescriptions = [
  "Buy and sell bitcoin for fiat (or other cryptocurrencies) privately and securely using Bisq's peer-to-peer network and open-source desktop software. No registration required.",
  'Bitcoin -> Monero atomic swaps, securely and in a decentralized manner using a state-of-the-art cryptographic protocol and open-source desktop software.',
  'P2P exchange bitcoin for national currencies. Robosats simplifies the peer-to-peer user experience.',
  'Anonymous exchange: Exchange Bitcoin to Monero and vice versa.',
  'Private web Hosting, KVM VPS, Dedicated Servers, Domain Names and VPN.',
  'SMS verification numbers online, pay using the Lightning Network. Cheap, easy, fast and anonymous.',
  'Hosting solutions, servers, domain registrations and dns parking. We do not require any personal information. Pay with Bitcoin and Monero.',
  'Send and receive sms messages via an XMPP client. You can also make and receive phone calls.',
  'VPN with unlimited bandwidth, dedicated servers without hard drives, no logging VPN service that accepts Monero.',
  'Privacy-first automated crytpocurrency swaps without registration.',
  'High-speed VPN available with multiple protocols, with strict no-logs policy and based in Switzerland.',
  'No logs, fully anonymous VPN. Resist Online Surveillance.',
  'Boltz is a non-custodial Bitcoin bridge built to swap between different Bitcoin layers like the Liquid and Lightning Network. Boltz Swaps are non-custodial, which means users can always rest assured to be in full control of their bitcoin throughout the entire flow of a swap.',
  'Iceland-based freedom of speech web hosting provider offering high-quality and secure web hosting solutions to its customers worldwide, with an award-winning customer support team.',
  'Privacy-friendly VPN with strong cryptography, no logs, anonymous payment methods, and Tor and I2P access. They support OpenVPN and WireGuard.',
  'Peach is a mobile application that connects Bitcoin Buyers & Sellers together. Buy or sell bitcoin peer-to-peer, anywhere, at anytime, with the payment method of your choice.',
  'Use GPT4 (and more) without accounts, subscriptions or credit cards. The interface runs on a pay-per-query model via Lightning.',
  'Xchange.me offers a cryptocurrency exchange service that allows you to exchange cryptocurrency through a fast automated process. No registration process or lengthy verification is needed.',
  'Exchange more than 1200+ coins on all available networks, quickly and easily.',
  'Swap between coins with fast and easy user experience, no sign-up required.',
  'Instant swap service, with no mandatory account registration. Fixed and floating rates.',
  'P2P marketplace that accepts Monero. It is similar to MoneroMarket and Facebook Marketplace. Messenger for buyer/seller is included with PGP encryption.',
]

const tosReviewExamples: PrismaJson.TosReview[] = [
  {
    kycLevel: 1,
    summary: '**Non-KYC exchange** with strong privacy features, but registered in Belize.',
    complexity: 'medium',
    contentHash: faker.string.uuid(),
    highlights: [
      {
        title: 'No KYC Required',
        content: 'No KYC or Source of Funds verification required for transactions.',
        rating: 'positive',
      },
      {
        title: 'Privacy Protection',
        content: 'No metadata collection (IP addresses, browser information, etc.).',
        rating: 'positive',
      },
      {
        title: 'Tor Support',
        content: 'Offers .onion address for enhanced privacy through Tor network.',
        rating: 'positive',
      },
      {
        title: 'Transparency',
        content: 'Provides proof of reserves on request, enhancing trust.',
        rating: 'positive',
      },
      {
        title: 'Privacy Coins',
        content: 'Supports privacy-focused cryptocurrencies like Monero.',
        rating: 'positive',
      },
      {
        title: 'Jurisdiction Risk',
        content: 'Registered in Belize which may have lax regulatory oversight.',
        rating: 'negative',
      },
      {
        title: 'Transaction Risk',
        content: 'Mixed pool transactions may lead to frozen funds on major exchanges.',
        rating: 'negative',
      },
      {
        title: 'Privacy Trade-off',
        content: 'Aggregated pool reduces risk of frozen funds but compromises privacy.',
        rating: 'neutral',
      },
      {
        title: 'Mobile Security',
        content: 'Mobile wallets recommended only if available on F-Droid (reproducible builds).',
        rating: 'neutral',
      },
      {
        title: 'Messaging Security',
        content: 'Avoid Telegram bots for exchanges due to lack of end-to-end encryption.',
        rating: 'negative',
      },
    ],
  },
  {
    kycLevel: 2,
    summary:
      'MajesticBank offers privacy-conscious crypto exchange services, with no mandatory registration, no logging, encryption, and optional JavaScript usage. Ensures anonymity and sovereignty through privacy-oriented features like Tor access and log-free practices.',
    complexity: 'low',
    contentHash: faker.string.uuid(),
    highlights: [
      {
        title: 'Anonymous Exchange',
        content: 'Registration is not required, supporting anonymous exchanges.',
        rating: 'positive',
      },
      {
        title: 'Limited Data Retention',
        content: 'No logs are kept, and exchange data is deleted upon request or after two weeks.',
        rating: 'positive',
      },
      {
        title: 'Strong Encryption',
        content: 'Military-grade encryption ensures user data security.',
        rating: 'positive',
      },
      {
        title: 'Optional JavaScript',
        content: 'Optional JavaScript enhances security for privacy-conscious users.',
        rating: 'positive',
      },
      {
        title: 'Hidden Transactions',
        content: 'Default hidden transaction ID prioritizes user privacy.',
        rating: 'positive',
      },
      {
        title: 'Clean Coin History',
        content: 'Clean coin history ensures safe usability of exchanged cryptocurrencies.',
        rating: 'positive',
      },
      {
        title: 'Tor Support',
        content: 'Recommended Tor v3 hidden service for secure access supports self-sovereignty.',
        rating: 'positive',
      },
    ],
  },
  {
    kycLevel: 3,
    summary:
      '**SideShift.ai blocks users from certain countries** including the US, North Korea, and others. Restrictions on SideShift Token (XAI) apply particularly for US residents, limiting functionality and access.',
    complexity: 'low',
    contentHash: faker.string.uuid(),
    highlights: [
      {
        title: 'No KYC Mentioned',
        content:
          'SideShift.ai excludes KYC requirements in the text—potential benefit for anonymity in non-blocked jurisdictions.',
        rating: 'positive',
      },
      {
        title: 'Privacy-First Design',
        content:
          'Its absence of direct data collection mentions could imply privacy-first design for eligible users.',
        rating: 'positive',
      },
    ],
  },
  {
    kycLevel: 4,
    summary:
      '**SideShift.ai blocks users from certain countries** including the US, North Korea, and others. Restrictions on SideShift Token (XAI) apply particularly for US residents, limiting functionality and access.',
    complexity: 'low',
    contentHash: faker.string.uuid(),
    highlights: [
      {
        title: 'No KYC Mentioned',
        content:
          'SideShift.ai excludes KYC requirements in the text—potential benefit for anonymity in non-blocked jurisdictions.',
        rating: 'positive',
      },
      {
        title: 'Privacy-First Design',
        content:
          'Its absence of direct data collection mentions could imply privacy-first design for eligible users.',
        rating: 'positive',
      },
    ],
  },
  {
    kycLevel: 0,
    summary:
      '**Kyun! Terms of Service** emphasize data collection with potential privacy risks. Key clauses suggest user tracking, require KYC for services, and describe limited protections for anonymity.',
    complexity: 'medium',
    contentHash: faker.string.uuid(),
    highlights: [
      {
        title: 'Tor Integration',
        content: 'Integration with Tor for enhanced anonymity.',
        rating: 'positive',
      },
      {
        title: 'Transparency Measures',
        content: 'A published canary file and PGP keys provide additional transparency.',
        rating: 'positive',
      },
      {
        title: 'Data Control',
        content: 'Privacy Policy indicates a degree of user control over personal data requests.',
        rating: 'neutral',
      },
    ],
  },
]

// User sentiment examples for AI-generated summaries
const generateFakeUserSentiment = () => {
  const sentiments = ['positive', 'neutral', 'negative'] as const
  const sentiment = faker.helpers.arrayElement(sentiments)

  // Generate what users like based on sentiment
  const likeCount =
    sentiment === 'positive'
      ? faker.number.int({ min: 3, max: 6 })
      : sentiment === 'neutral'
        ? faker.number.int({ min: 1, max: 4 })
        : faker.number.int({ min: 0, max: 2 })

  // Generate what users dislike based on sentiment
  const dislikeCount =
    sentiment === 'negative'
      ? faker.number.int({ min: 3, max: 6 })
      : sentiment === 'neutral'
        ? faker.number.int({ min: 1, max: 4 })
        : faker.number.int({ min: 0, max: 2 })

  const whatUsersLike = Array.from({ length: likeCount }, () =>
    faker.helpers.arrayElement([
      'Fast transaction times',
      'No KYC required',
      'Excellent support team',
      'Low fees',
      'Multiple currency options',
      'Easy to use interface',
      'Clear documentation',
      'Tor support',
      'Strong privacy policies',
      'No IP logging',
      'Quick verification process',
      'Responsive website',
      'Mobile-friendly design',
      'Reliable uptime',
      'Transparent fee structure',
    ])
  )

  const whatUsersDislike = Array.from({ length: dislikeCount }, () =>
    faker.helpers.arrayElement([
      'Slow transaction times',
      'High fees',
      'Poor customer support',
      'Confusing interface',
      'Limited currency options',
      'Website downtime',
      'Hidden fees',
      'No mobile support',
      'Lack of transparency',
      'Limited payment methods',
      'Bugs in the platform',
      'Restrictive limits',
      'Delayed withdrawals',
      'Verification issues',
      'Complicated signup process',
    ])
  )

  // Create summary based on sentiment
  let summary = ''
  if (sentiment === 'positive') {
    summary = faker.helpers.arrayElement([
      `Users overwhelmingly praise this service for its ${faker.helpers.arrayElements(whatUsersLike, 2).join(' and ')}. Many highlight the ${faker.helpers.arrayElement(whatUsersLike)} as a standout feature.`,
      `Based on multiple user reviews, this service receives high marks for ${faker.helpers.arrayElements(whatUsersLike, 2).join(' and ')}. Most users report positive experiences with minimal issues.`,
      `Community feedback indicates strong satisfaction with this service, particularly regarding ${faker.helpers.arrayElements(whatUsersLike, 2).join(' and ')}.`,
    ])
  } else if (sentiment === 'neutral') {
    summary = faker.helpers.arrayElement([
      `User sentiment is mixed. While many appreciate the ${faker.helpers.arrayElement(whatUsersLike)}, common complaints include ${faker.helpers.arrayElement(whatUsersDislike)}.`,
      `Community feedback shows balanced opinions. Users like the ${faker.helpers.arrayElement(whatUsersLike)} but have concerns about ${faker.helpers.arrayElement(whatUsersDislike)}.`,
      `Analysis of reviews indicates neither overwhelmingly positive nor negative sentiment. Users value ${faker.helpers.arrayElement(whatUsersLike)} but criticize ${faker.helpers.arrayElement(whatUsersDislike)}.`,
    ])
  } else {
    summary = faker.helpers.arrayElement([
      `User reviews highlight significant concerns with this service, primarily regarding ${faker.helpers.arrayElements(whatUsersDislike, 2).join(' and ')}. Few users mention positive aspects.`,
      `Community feedback is predominantly negative, with recurring complaints about ${faker.helpers.arrayElements(whatUsersDislike, 2).join(' and ')}.`,
      `Analysis of user comments reveals widespread dissatisfaction, especially concerning ${faker.helpers.arrayElements(whatUsersDislike, 2).join(' and ')}.`,
    ])
  }

  return {
    summary,
    sentiment,
    whatUsersLike: [...new Set(whatUsersLike)],
    whatUsersDislike: [...new Set(whatUsersDislike)],
  }
}

const eventTitles = [
  'Service maintenance scheduled',
  'Server outage reported',
  'New feature launched',
  'Security update released',
  'Price changes announced',
  'Service temporarily unavailable',
  'Verification process changed',
  'High traffic warning',
  'API changes coming soon',
  'Database maintenance',
  'KYC policy updated',
  'Privacy policy update',
  'New cryptocurrencies added',
  'Lower fees promotion',
  'Important security notification',
  'Partial service disruption',
  'Full service restored',
  'Address format changed',
  'Exchange rate issues fixed',
  'Holiday operating hours',
]

const generateFakeEvent = (serviceId: number) => {
  const type = faker.helpers.arrayElement(Object.values(EventType))
  const visible = faker.datatype.boolean(0.9) // 90% chance of being visible
  const startedAt = faker.date.between({
    from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
    to: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days in future
  })
  const endedAt = faker.helpers.arrayElement([
    // Option 1: Future date (1-14 days after start)
    faker.date.between({
      from: startedAt,
      to: new Date(startedAt.getTime() + faker.number.int({ min: 1, max: 14 }) * 24 * 60 * 60 * 1000),
    }),
    // Option 2: null (ongoing event)
    null,
    // Option 3: Same date as startedAt (one-time event)
    new Date(startedAt),
  ])

  const title = faker.helpers.arrayElement(eventTitles)

  return {
    title,
    content: faker.lorem.sentence({ min: 1, max: 10 }),
    source: faker.helpers.maybe(() => faker.internet.url(), { probability: 0.7 }),
    type,
    visible,
    startedAt,
    endedAt,
    service: { connect: { id: serviceId } },
  } as const satisfies Prisma.EventCreateInput
}

const generateFakeService = (users: User[]) => {
  const status = faker.helpers.weightedArrayElement<VerificationStatus>([
    { weight: 20, value: 'VERIFICATION_SUCCESS' },
    { weight: 30, value: 'APPROVED' },
    { weight: 40, value: 'COMMUNITY_CONTRIBUTED' },
    { weight: 10, value: 'VERIFICATION_FAILED' },
  ])
  const name = faker.helpers.arrayElement(serviceNames)
  const slug = `${faker.helpers.slugify(name).toLowerCase()}-${faker.string.alphanumeric({ length: 6, casing: 'lower' })}`

  return {
    name,
    slug,
    description: faker.helpers.arrayElement(serviceDescriptions),
    kycLevel: faker.helpers.arrayElement(kycLevels.map((level) => level.value)),
    overallScore: 0,
    privacyScore: 0,
    trustScore: 0,
    serviceVisibility: faker.helpers.weightedArrayElement<ServiceVisibility>([
      { weight: 80, value: 'PUBLIC' },
      { weight: 10, value: 'UNLISTED' },
      { weight: 5, value: 'HIDDEN' },
      { weight: 5, value: 'ARCHIVED' },
    ]),
    verificationStatus: status,
    verificationSummary:
      status === 'VERIFICATION_SUCCESS' || status === 'VERIFICATION_FAILED' ? faker.lorem.paragraph() : null,
    verificationRequests: {
      create: uniqBy(
        Array.from({ length: faker.number.int({ min: 0, max: 10 }) }, () => ({
          userId: faker.helpers.arrayElement(users).id,
        })),
        'userId'
      ),
    },
    verificationProofMd:
      status === 'VERIFICATION_SUCCESS' || status === 'VERIFICATION_FAILED' ? faker.lorem.paragraphs() : null,
    referral: `?ref=${faker.string.alphanumeric(6)}`,
    acceptedCurrencies: faker.helpers.arrayElements(Object.values(Currency), { min: 1, max: 5 }),
    serviceUrls: Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () => faker.internet.url()),
    tosUrls: Array.from({ length: faker.number.int({ min: 0, max: 2 }) }, () => faker.internet.url()),
    onionUrls: Array.from(
      { length: faker.number.int({ min: 0, max: 2 }) },
      () => `http://${faker.string.alphanumeric({ length: 56, casing: 'lower' })}.onion`
    ),
    i2pUrls: Array.from(
      { length: faker.number.int({ min: 0, max: 2 }) },
      () => `http://${faker.string.alphanumeric({ length: 52, casing: 'lower' })}.b32.i2p`
    ),
    imageUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&format=svg`,
    listedAt: faker.date.past(),
    verifiedAt: status === VerificationStatus.VERIFICATION_SUCCESS ? faker.date.past() : null,
    tosReview: faker.helpers.arrayElement(tosReviewExamples),
    tosReviewAt: faker.date.past(),
    userSentiment: Math.random() > 0.2 ? generateFakeUserSentiment() : undefined,
    userSentimentAt: faker.date.recent(),
  } as const satisfies Prisma.ServiceCreateInput
}

const commentList = [
  'This service is amazing!',
  "I've had a great experience with this service.",
  'Would recommend to everyone.',
  'Not the best service, but it works.',
  "I've had some issues with this service.",
  'Avoid this service at all costs.',
  "It's been over 12 hours. Page just says 'Something went wrong. Try to generate new circuit or get back to homepage' entering exchange ID in track says it cannot be found. out $500",
  'Wow man so slow exchange im starting to think i just got scammed',
  "takes very long to swap. Waiting for almost 2h using 'Priority' transaction but still waiting. Reasonable service but very slow. Thank you",
  'If you are in a hurry, i advise against using this site. It took 2h to process...',
  'I had to wait 2 hours for my transaction to be processed. I was very disappointed.',
  'Good service, low fees, would use again.',
  'exchange on majesticbank takes 30 minutes after confirmations and slower compared to other eXchange services but trusted too.',
  'scam',
  'test',
  'good morning everyone',
  'shitty service, bad support team, avoid',
  'hey admin, please could you check the service URLs? they seem to have changed',
  'they are now accepting lightning payments, which is great!',
  'I have been using this service for a while now and I must say that it is one of the best I have used. The customer support is excellent and the service is very reliable. I would highly recommend this service to anyone looking for a reliable and trustworthy service.',
  'last time i used this was a long ago, but they were good',

  // Positive, high-quality reviews
  'This service is amazing! The transaction was smooth and support team was very helpful throughout.',
  "I've had a great experience with this service. Fast processing times and reasonable fees.",
  'Would definitely recommend to everyone - saved me a lot in fees compared to competitors.',
  'Their new Lightning Network integration is fantastic. Makes transactions so much faster.',
  "One of the most reliable services I've used in 5+ years of crypto trading.",

  // Balanced/Mixed reviews
  'Not the best service, but it works well enough for basic transactions.',
  "I've had some issues but support helped resolve them quickly.",
  'Exchange rates could be better but service is reliable.',
  'A bit slow sometimes but very secure and trustworthy.',
  'Interface needs work but core functionality is solid.',

  // Negative but legitimate reviews
  'Avoid this service if you need fast transactions. Too slow.',
  'Support took 3 days to respond to my ticket. Not acceptable.',
  'Fees are higher than advertised. Be careful.',
  'Site was down for maintenance during peak hours.',
  'Mobile experience is terrible, desktop only works properly.',

  // Spam/Low quality
  'scam scam scam!!!11',
  'WORST SERVICE EVER!!!!!',
  'test test',
  'first',
  'nice',
  'good',
  'hi admin',
  'check dm',
  'lol',
  '+1',

  // Potential scam/fraud
  'DOUBLE YOUR BITCOIN - Send 0.1 BTC to address xyz123...',
  'FREE CRYPTO GIVEAWAY at totally-legit-site.com',
  'DM me for special rates',
  'WhatsApp +123456789 for instant exchange',
  'Guaranteed 100% returns daily!!!',

  // Time-wasting/Trolling
  'Does this work with Dogecoin? Asking for my cat.',
  'Instructions unclear, bought a lambo instead',
  'When moon? When lambo?',
  'This is the way',
  'HODL!!!',

  // Long rambling reviews
  "I have been using this service for approximately 2.4 years and I must say that while initially I was skeptical due to the interface design choices particularly the color scheme which reminds me of my grandmother's curtains from the 1970s but that's besides the point because ultimately what matters is functionality and in that regard I can definitively state that based on my extensive experience with various competing services including but not limited to...",

  // Technical issues/bugs
  "It's been over 12 hours. Page just says 'Something went wrong. Try to generate new circuit or get back to homepage' entering exchange ID in track says it cannot be found. out $500",
  'Error 404 on confirmation page',
  'API keeps timing out',
  'Cloudflare is blocking access',
  'KYC verification stuck at 99%',

  // Legitimate but poorly written
  'gud service fast n cheap',
  'works ok i guess',
  'better then others maybe',
  'ya its fine whatever',
  'does job',

  // Support questions/issues
  'hey admin, please check support ticket #12345',
  'when will site maintenance end???',
  'need help with transaction',
  'support not responding!!!',
  'how to cancel order??',

  // Requires admin attention
  'The correct name of this service is "MoneroSMS", not "monero sms" (no space)',
  'Since they recommend using a swap service. I don\'t think it can be labled as "support monero".',
  'new tor address is \nhttp://4kanxsg3sbveimuoqgxhaj3clrj2aw7swow5fpc6odqmtclww3ukcqqd.onion/',

  // Feature requests/suggestions
  'Please add support for Monero',
  'Dark mode would be nice',
  'Mobile app when?',
  'Can we get lower fees for high volume?',
  'Add more payment methods please',

  // Time-related complaints
  'Wow man so slow exchange im starting to think i just got scammed',
  'takes very long to swap. Waiting for almost 2h using Priority transaction',
  'If you are in a hurry, avoid - took 2h to process...',
  '30+ minutes after confirmation still waiting',
  'Stuck pending for 3 hours now',

  // Competitor mentions/comparisons
  'Much slower than competitor X',
  'Fees higher than service Y',
  'Other exchanges are faster',
  'Better rates on Z exchange',
  'Moving to competitor service',
  "To activate your account, you can either deposit $15 to your balance or enter your referral code if you have one. \n(If you'd like to pay in a cryptocurrency other than Bitcoin, currently we recommend using a service like simpleswap.io, morphtoken.com, changenow.io, or godex.io. Manual payment via Bitcoin Cash is also available if you contact support.)",

  // Random/nonsensical
  'potato',
  'asdfghjkl',
  'testing testing 123',
  '........................',
  '🚀🚀🚀🚀🚀',

  // Old reviews
  'Used this back in 2019, was good then',
  'Last time I checked was months ago',
  'Things have changed since I last used it',
  'Service quality has declined since early days',
  'Not as good as it used to be',
]

const commentReplyList = [
  // Replies to comments
  'yup',
  'noope',
  'yeah',
  'yes',
  'maybe',
  'thanks',
  'thank you',
  'thx',
  'thx for the help',
  'right',
  'same here',
  'same issue man',
  'same',
  'same problem',
  'same problem here',
  'same problem man',
  'same problem here man',
  'same experience',
  'same experience here',
  'same experience here man',
  'same experience man',
  'same experience here man',
]

const generateFakeComment = (userId: number, serviceId: number, parentId?: number) =>
  ({
    upvotes: faker.number.int({ min: 0, max: 100 }),
    status:
      Math.random() > 0.1
        ? faker.helpers.arrayElement([CommentStatus.APPROVED, CommentStatus.REJECTED, CommentStatus.VERIFIED])
        : CommentStatus.PENDING,
    suspicious: Math.random() > 0.2 ? false : faker.datatype.boolean(),
    communityNote: Math.random() > 0.2 ? '' : faker.lorem.paragraph(),
    internalNote: Math.random() > 0.2 ? '' : faker.lorem.paragraph(),
    privateContext: Math.random() > 0.2 ? '' : faker.lorem.paragraph(),
    content:
      parentId && Math.random() > 0.3
        ? faker.helpers.arrayElement(commentReplyList)
        : faker.helpers.arrayElement(commentList),
    rating: parentId ? null : Math.random() < 0.33 ? faker.number.int({ min: 1, max: 5 }) : null,
    ratingActive: false as boolean,
    authorId: userId,
    serviceId,
    parentId,
  }) satisfies Prisma.CommentCreateManyInput

const generateFakeServiceContactMethod = (serviceId: number) => {
  const types = [
    {
      value: `mailto:${faker.internet.email()}`,
    },
    {
      value: `tel:${faker.phone.number({ style: 'international' })}`,
    },
    {
      value: `https://wa.me/${faker.phone.number({ style: 'international' })}`,
    },
    {
      value: `https://t.me/${faker.internet.username()}`,
    },
    {
      value: `https://x.com/${faker.internet.username()}`,
    },
    {
      value: `https://matrix.to/#/@${faker.internet.username()}:${faker.internet.domainName()}`,
    },
    {
      value: `https://instagram.com/${faker.internet.username()}`,
    },
    {
      value: `https://linkedin.com/in/${faker.helpers.slugify(faker.person.fullName())}`,
    },
    {
      label: faker.lorem.word({ length: 2 }),
      value: `https://bitcointalk.org/index.php?topic=${faker.number.int({ min: 1, max: 1000000 }).toString()}.0`,
    },
    {
      value: `https://bitcointalk.org/index.php?topic=${faker.number.int({ min: 1, max: 1000000 }).toString()}.0`,
    },
    {
      value: faker.internet.url(),
    },
    {
      label: faker.lorem.word({ length: 2 }),
      value: faker.internet.url(),
    },
    {
      value: `https://linkedin.com/company/${faker.helpers.slugify(faker.company.name())}`,
    },
  ] as const satisfies Partial<Prisma.ServiceContactMethodCreateInput>[]

  return {
    services: { connect: { id: serviceId } },
    ...faker.helpers.arrayElement(types),
  } as const satisfies Prisma.ServiceContactMethodCreateInput
}

const specialUsersData = {
  admin: {
    name: 'admin_dev',
    envToken: 'DEV_ADMIN_USER_SECRET_TOKEN',
    defaultToken: 'admin',
    admin: true,
    moderator: true,
    verified: true,
    verifiedLink: 'https://kycnot.me',
    totalKarma: 1001,
    link: 'https://kycnot.me',
    picture: 'https://comments.kycnot.me/api/users/549f290e-0542-4c18-b437-5b64b35758f0/avatar?size=L',
  },
  moderator: {
    name: 'moderator_dev',
    envToken: 'DEV_MODERATOR_USER_SECRET_TOKEN',
    defaultToken: 'moderator',
    admin: false,
    moderator: true,
    verified: true,
    verifiedLink: 'https://kycnot.me',
    totalKarma: 1001,
    link: 'https://kycnot.me',
    picture: 'https://comments.kycnot.me/api/users/549f290e-0542-4c18-b437-5b64b35758f0/avatar?size=L',
  },
  verified: {
    name: 'verified_dev',
    envToken: 'DEV_VERIFIED_USER_SECRET_TOKEN',
    defaultToken: 'verified',
    admin: false,
    moderator: false,
    verified: true,
    verifiedLink: 'https://kycnot.me',
    totalKarma: 1001,
  },
  normal: {
    name: 'normal_dev',
    envToken: 'DEV_NORMAL_USER_SECRET_TOKEN',
    defaultToken: 'normal',
    admin: false,
    moderator: false,
    verified: false,
  },
  spam: {
    name: 'spam_dev',
    envToken: 'DEV_SPAM_USER_SECRET_TOKEN',
    defaultToken: 'spam',
    admin: false,
    moderator: false,
    verified: false,
    totalKarma: -100,
    spammer: true,
  },
} as const satisfies Record<
  string,
  Omit<Prisma.UserCreateInput, 'secretTokenHash'> & {
    envToken: string
    defaultToken: string
  }
>

const generateFakeServiceSuggestionMessage = (suggestionId: number, userIds: number[]) =>
  ({
    content: faker.lorem.paragraph(),
    user: { connect: { id: faker.helpers.arrayElement(userIds) } },
    suggestion: { connect: { id: suggestionId } },
  }) satisfies Prisma.ServiceSuggestionMessageCreateInput

const generateFakeServiceSuggestion = ({
  type,
  status = ServiceSuggestionStatus.PENDING,
  userId,
  serviceId,
}: {
  type: ServiceSuggestionType
  status?: ServiceSuggestionStatus
  userId: number
  serviceId: number
}) =>
  ({
    type,
    status,
    notes: faker.lorem.paragraph(),
    user: { connect: { id: userId } },
    service: { connect: { id: serviceId } },
  }) satisfies Prisma.ServiceSuggestionCreateInput

const generateFakeInternalNote = (userId: number, addedByUserId?: number) =>
  ({
    content: faker.lorem.paragraph(),
    user: { connect: { id: userId } },
    addedByUser: addedByUserId ? { connect: { id: addedByUserId } } : undefined,
  }) satisfies Prisma.InternalUserNoteCreateInput

const generateFakeAnnouncement = () => {
  const type = faker.helpers.arrayElement(Object.values(AnnouncementType))
  const startDate = faker.date.past()
  const endDate = faker.helpers.maybe(() => faker.date.future(), { probability: 0.3 })

  return {
    content: faker.lorem.sentence(),
    type,
    link: faker.internet.url(),
    linkText: faker.lorem.word({ length: 2 }),
    startDate,
    endDate,
    isActive: true,
  } as const satisfies Prisma.AnnouncementCreateInput
}

async function runFaker() {
  await prisma.$transaction(
    async (tx) => {
      // ---- Clean up existing data if requested ----
      if (shouldCleanup || onlyCleanup) {
        console.info('🧹 Cleaning up existing data...')

        try {
          await tx.commentVote.deleteMany()
          await tx.karmaTransaction.deleteMany()
          await tx.comment.deleteMany()
          await tx.serviceAttribute.deleteMany()
          await tx.serviceContactMethod.deleteMany()
          await tx.event.deleteMany()
          await tx.verificationStep.deleteMany()
          await tx.serviceSuggestionMessage.deleteMany()
          await tx.serviceSuggestion.deleteMany()
          await tx.serviceVerificationRequest.deleteMany()
          await tx.service.deleteMany()
          await tx.attribute.deleteMany()
          await tx.category.deleteMany()
          await tx.internalUserNote.deleteMany()
          await tx.user.deleteMany()
          await tx.announcement.deleteMany()
          console.info('✅ Existing data cleaned up')
        } catch (error) {
          console.error('❌ Error cleaning up data:', error)
          throw error
        }
        if (onlyCleanup) return
      }

      // ---- Get or create categories ----
      const categories = await Promise.all(
        categoriesToCreate.map(async (cat) => {
          const existing = await tx.category.findUnique({
            where: { name: cat.name },
          })
          if (existing) return existing

          return await tx.category.create({
            data: cat,
          })
        })
      )

      // ---- Create users ----
      const specialUsersUntyped = Object.fromEntries(
        await Promise.all(
          Object.entries(specialUsersData).map(async ([key, userData]) => {
            const secretToken = process.env[userData.envToken] ?? userData.defaultToken
            const secretTokenHash = hashUserSecretToken(secretToken)

            const { envToken, defaultToken, ...userCreateData } = userData
            const user = await tx.user.create({
              data: {
                notificationPreferences: { create: {} },
                ...userCreateData,
                secretTokenHash,
              },
            })

            console.info(`✅ Created ${user.name} with secret token "${secretToken}"`)

            return [key, user] as const
          })
        )
      )

      const specialUsers = specialUsersUntyped as {
        [K in keyof typeof specialUsersData]: (typeof specialUsersUntyped)[K]
      }

      let users = await Promise.all(
        Array.from({ length: 10 }, async () => {
          const { user } = await createAccount()
          return user
        })
      )

      // ---- Create attributes ----
      const attributes = await Promise.all(
        Array.from({ length: 16 }, async () => {
          return await tx.attribute.create({
            data: generateFakeAttribute(),
          })
        })
      )

      // ---- Create services ----
      const services = await Promise.all(
        Array.from({ length: numServices }, async () => {
          const serviceData = generateFakeService(users)
          const randomCategories = faker.helpers.arrayElements(categories, { min: 1, max: 3 })

          const service = await tx.service.create({
            data: {
              ...serviceData,
              categories: {
                connect: randomCategories.map((cat) => ({ id: cat.id })),
              },
            },
          })

          // Create contact methods for each service
          await Promise.all(
            Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () =>
              tx.serviceContactMethod.create({
                data: generateFakeServiceContactMethod(service.id),
              })
            )
          )

          // Link random attributes to the service
          await Promise.all(
            faker.helpers.arrayElements(attributes, { min: 2, max: 5 }).map((attr) =>
              tx.serviceAttribute.create({
                data: {
                  serviceId: service.id,
                  attributeId: attr.id,
                },
              })
            )
          )

          // Create events for the service
          await Promise.all(
            Array.from({ length: faker.number.int({ min: 0, max: 5 }) }, () =>
              tx.event.create({
                data: generateFakeEvent(service.id),
              })
            )
          )

          return service
        })
      )

      // ---- Create service user affiliations for the service ----
      await Promise.all(
        users
          .filter((user) => user.verified)
          .map(async (user) => {
            const servicesToAddAffiliations = uniqBy(
              faker.helpers.arrayElements(services, {
                min: 1,
                max: 3,
              }),
              'id'
            )

            return tx.user.update({
              where: { id: user.id },
              data: {
                serviceAffiliations: {
                  createMany: {
                    data: servicesToAddAffiliations.map((service) => ({
                      role: faker.helpers.arrayElement(Object.values(ServiceUserRole)),
                      serviceId: service.id,
                    })),
                  },
                },
              },
            })
          })
      )

      users = await tx.user.findMany({
        include: {
          serviceAffiliations: true,
        },
      })

      // ---- Create comments and replies ----
      await Promise.all(
        services.map(async (service) => {
          // Create parent comments
          const commentCount = faker.number.int({ min: 1, max: 10 })
          const commentData = Array.from({ length: commentCount }, () =>
            generateFakeComment(faker.helpers.arrayElement(users).id, service.id)
          )
          const indexesToUpdate = users.map((user) => {
            return commentData.findIndex((comment) => comment.authorId === user.id && comment.rating !== null)
          })
          commentData.forEach((comment, index) => {
            if (indexesToUpdate.includes(index)) comment.ratingActive = true
          })

          await tx.comment.createMany({
            data: commentData,
          })

          const comments = await tx.comment.findMany({
            where: {
              serviceId: service.id,
              parentId: null,
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: commentCount,
          })

          const affiliatedUsers = undefinedIfEmpty(
            users.filter((user) =>
              user.serviceAffiliations.some((affiliation) => affiliation.serviceId === service.id)
            )
          )

          // Create replies to comments
          await Promise.all(
            comments.map(async (comment) => {
              const replyCount = faker.number.int({ min: 0, max: 3 })
              return Promise.all(
                Array.from({ length: replyCount }, () => {
                  const user = faker.helpers.arrayElement(
                    faker.helpers.maybe(() => affiliatedUsers, { probability: 0.3 }) ?? users
                  )

                  return tx.comment.create({
                    data: generateFakeComment(user.id, service.id, comment.id),
                  })
                })
              )
            })
          )
        })
      )

      // ---- Create service suggestions for normal_dev user ----
      // First create 3 CREATE_SERVICE suggestions with their services
      for (let i = 0; i < 3; i++) {
        const serviceData = generateFakeService(users)
        const randomCategories = faker.helpers.arrayElements(categories, { min: 1, max: 3 })

        const service = await tx.service.create({
          data: {
            ...serviceData,
            verificationStatus: VerificationStatus.COMMUNITY_CONTRIBUTED,
            categories: {
              connect: randomCategories.map((cat) => ({ id: cat.id })),
            },
          },
        })

        const serviceSuggestion = await tx.serviceSuggestion.create({
          data: generateFakeServiceSuggestion({
            type: ServiceSuggestionType.CREATE_SERVICE,
            userId: specialUsers.normal.id,
            serviceId: service.id,
          }),
        })

        // Create some messages for each suggestion
        await Promise.all(
          Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () =>
            tx.serviceSuggestionMessage.create({
              data: generateFakeServiceSuggestionMessage(serviceSuggestion.id, [
                specialUsers.normal.id,
                specialUsers.admin.id,
              ]),
            })
          )
        )
      }

      // Then create 5 EDIT_SERVICE suggestions
      await Promise.all(
        services.slice(0, 5).map(async (service) => {
          const status = faker.helpers.arrayElement(Object.values(ServiceSuggestionStatus))
          const suggestion = await tx.serviceSuggestion.create({
            data: generateFakeServiceSuggestion({
              type: ServiceSuggestionType.EDIT_SERVICE,
              status,
              userId: specialUsers.normal.id,
              serviceId: service.id,
            }),
          })

          // Create some messages for each suggestion
          await Promise.all(
            Array.from({ length: faker.number.int({ min: 0, max: 3 }) }, () =>
              tx.serviceSuggestionMessage.create({
                data: generateFakeServiceSuggestionMessage(suggestion.id, [
                  specialUsers.normal.id,
                  specialUsers.admin.id,
                ]),
              })
            )
          )
        })
      )

      // ---- Create internal notes for users ----
      await Promise.all(
        users.map(async (user) => {
          // Create 1-3 notes for each user
          const numNotes = faker.number.int({ min: 1, max: 3 })
          return Promise.all(
            Array.from({ length: numNotes }, () =>
              tx.internalUserNote.create({
                data: generateFakeInternalNote(
                  user.id,
                  faker.helpers.arrayElement([specialUsers.admin.id, specialUsers.moderator.id])
                ),
              })
            )
          )
        })
      )

      // Add some notes to special users as well
      await Promise.all(
        Object.values(specialUsers).map(async (user) => {
          const numNotes = faker.number.int({ min: 1, max: 3 })
          return Promise.all(
            Array.from({ length: numNotes }, () =>
              tx.internalUserNote.create({
                data: generateFakeInternalNote(
                  user.id,
                  faker.helpers.arrayElement([specialUsers.admin.id, specialUsers.moderator.id])
                ),
              })
            )
          )
        })
      )

      // ---- Create announcement ----
      await tx.announcement.create({
        data: generateFakeAnnouncement(),
      })
    },
    {
      timeout: 1000 * 60 * 10, // 10 minutes
    }
  )
}

async function main() {
  try {
    await runFaker()

    console.info('✅ Fake data generated successfully')
  } catch (error) {
    console.error('❌ Error generating fake data:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
