import { z } from 'astro/zod'
import { ActionError } from 'astro:actions'
import { pick } from 'lodash-es'

import { getKycLevelClarificationInfo } from '../../constants/kycLevelClarifications'
import { getKycLevelInfo } from '../../constants/kycLevels'
import { getVerificationStatusInfo } from '../../constants/verificationStatus'
import { defineProtectedAction } from '../../lib/defineProtectedAction'
import { prisma } from '../../lib/prisma'
import { zodUrlOptionalProtocol } from '../../lib/zodUtils'

import type { Prisma } from '@prisma/client'

export const apiServiceActions = {
  get: defineProtectedAction({
    accept: 'json',
    permissions: 'guest',
    input: z.object({
      id: z.coerce.number().int().positive().optional(),
      slug: z
        .string()
        .min(1)
        .max(2048)
        .regex(/^[a-z0-9-]+$/, 'Allowed characters: lowercase letters, numbers, and hyphens')
        .optional(),
      url: zodUrlOptionalProtocol.optional(),
    }),
    handler: async (input, context) => {
      if (!input.id && !input.slug && !input.url) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'At least one of the following parameters is required: id, slug, url',
        })
      }

      const urlVariants = input.url
        ? [input.url]
            .flatMap((url) =>
              [
                url,
                url.startsWith('http://') ? url.replace('http://', 'https://') : undefined,
                url.startsWith('https://') ? url.replace('https://', 'http://') : undefined,
              ].filter((url) => url !== undefined)
            )
            .flatMap((url) => [url, url.endsWith('/') ? url.slice(0, -1) : `${url}/`])
        : undefined

      const select = {
        id: true,
        name: true,
        slug: true,
        description: true,
        kycLevel: true,
        kycLevelClarification: true,
        verificationStatus: true,
        categories: {
          select: {
            name: true,
            slug: true,
          },
        },
        serviceUrls: true,
        onionUrls: true,
        i2pUrls: true,
        tosUrls: true,
        referral: true,
        listedAt: true,
        verifiedAt: true,
        serviceVisibility: true,
      } as const satisfies Prisma.ServiceSelect

      let service = await prisma.service.findFirst({
        where: {
          listedAt: { lte: new Date() },
          serviceVisibility: { in: ['PUBLIC', 'ARCHIVED', 'UNLISTED'] },

          OR: [
            ...(input.id ? ([{ id: input.id }] satisfies Prisma.ServiceWhereInput[]) : []),
            ...(input.slug ? ([{ slug: input.slug }] satisfies Prisma.ServiceWhereInput[]) : []),
            ...(urlVariants
              ? ([
                  { serviceUrls: { hasSome: urlVariants } },
                  { onionUrls: { hasSome: urlVariants } },
                  { i2pUrls: { hasSome: urlVariants } },
                ] satisfies Prisma.ServiceWhereInput[])
              : []),
          ],
        },
        select,
      })

      if (!service && input.slug) {
        service = await prisma.service.findFirst({
          where: {
            listedAt: { lte: new Date() },
            serviceVisibility: { in: ['PUBLIC', 'ARCHIVED', 'UNLISTED'] },

            previousSlugs: { has: input.slug },
          },
          select,
        })
      }

      if (
        !service ||
        (service.serviceVisibility !== 'PUBLIC' &&
          service.serviceVisibility !== 'ARCHIVED' &&
          service.serviceVisibility !== 'UNLISTED') ||
        !service.listedAt ||
        service.listedAt > new Date()
      ) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'Service not found',
        })
      }

      return {
        id: service.id,
        slug: service.slug,
        name: service.name,
        description: service.description,
        serviceVisibility: service.serviceVisibility,
        verificationStatus: service.verificationStatus,
        verificationStatusInfo: pick(getVerificationStatusInfo(service.verificationStatus), [
          'value',
          'slug',
          'label',
          'labelShort',
          'description',
        ]),
        verifiedAt: service.verifiedAt,
        kycLevel: service.kycLevel,
        kycLevelInfo: pick(getKycLevelInfo(service.kycLevel.toString()), ['value', 'name', 'description']),
        kycLevelClarification: service.kycLevelClarification,
        kycLevelClarificationInfo: pick(getKycLevelClarificationInfo(service.kycLevelClarification), [
          'value',
          'name',
          'description',
        ]),
        categories: service.categories,
        listedAt: service.listedAt,
        serviceUrls: [...service.serviceUrls, ...service.onionUrls, ...service.i2pUrls].map(
          (url) => url + (service.referral ?? '')
        ),
        tosUrls: service.tosUrls,
        kycnotmeUrl: new URL(`/service/${service.slug}`, context.url).href,
      }
    },
  }),
}
