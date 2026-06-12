import { z } from 'astro/zod'

import { prisma } from './prisma'

// similarity() runs per Service row, so an unbounded value is an amplification
// vector. Cap the length and skip queries too short to trigram-match anything.
const MAX_SIMILARITY_QUERY_LENGTH = 100
const MIN_SIMILARITY_QUERY_LENGTH = 2

export async function findServicesBySimilarity(value: string, similarityThreshold = 0.01) {
  const query = value.trim().slice(0, MAX_SIMILARITY_QUERY_LENGTH)
  if (query.length < MIN_SIMILARITY_QUERY_LENGTH) return []

  const data = await prisma.$queryRaw`
      SELECT id, similarity(name, ${query}) AS similarity_score
      FROM "Service"
      WHERE similarity(name, ${query}) >= ${similarityThreshold}
      ORDER BY similarity(name, ${query}) desc`

  const schema = z.array(z.object({ id: z.number(), similarity_score: z.number() }))
  const parsedData = schema.parse(data)

  return parsedData.map(({ id, similarity_score }) => ({ id, similarityScore: similarity_score }))
}
