import { prisma } from '../../../../lib/prisma'

import type { Prisma } from '@prisma/client'
import type { APIRoute } from 'astro'

const MAX_ID_LENGTH = 2048

export const GET: APIRoute = async ({ params }) => {
  const { id } = params

  if (!id) {
    return new Response(JSON.stringify({ error: 'ID parameter is missing' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  if (id.length > MAX_ID_LENGTH) {
    return new Response(JSON.stringify({ error: 'ID parameter is too long' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  const orConditions: Prisma.ServiceWhereInput[] = [
    { slug: id },
    { name: id },
    { serviceUrls: { has: id } },
    { onionUrls: { has: id } },
    { i2pUrls: { has: id } },
  ]

  // Try direct ID lookup first
  const numericId = parseInt(id, 10)

  if (!isNaN(numericId)) {
    orConditions.push({ id: numericId })
  }

  if (id.startsWith('http://') || id.startsWith('https://')) {
    let alternativeId: string
    if (id.endsWith('/')) {
      alternativeId = id.slice(0, -1) // Remove trailing slash
    } else {
      alternativeId = id + '/' // Add trailing slash
    }
    orConditions.push({ serviceUrls: { has: alternativeId } })
    orConditions.push({ onionUrls: { has: alternativeId } })
    orConditions.push({ i2pUrls: { has: alternativeId } })
  } else {
    // For non-HTTP/S IDs, check as is (could be a direct onion/i2p address without protocol)
    orConditions.push({ serviceUrls: { has: id } })
    orConditions.push({ onionUrls: { has: id } })
    orConditions.push({ i2pUrls: { has: id } })
  }

  try {
    const service = await prisma.service.findFirst({
      where: {
        OR: orConditions,
      },
      select: {
        name: true,
        slug: true,
        description: true,
        kycLevel: true,
        categories: {
          select: {
            name: true,
            slug: true,
            icon: true,
          },
        },
        serviceUrls: true,
        onionUrls: true,
        i2pUrls: true,
        tosUrls: true,
      },
    })

    if (!service) {
      return new Response(JSON.stringify({ error: 'Service not found' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    }

    const responseData = {
      name: service.name,
      description: service.description,
      kycLevel: service.kycLevel,
      categories: service.categories.map((category) => category.slug),
      serviceUrls: service.serviceUrls,
      onionUrls: service.onionUrls,
      i2pUrls: service.i2pUrls,
      tosUrls: service.tosUrls,
      kycnotmeUrl: `https://kycnot.me/service/${service.slug}`,
    }

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    console.error('Error fetching service:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
}
