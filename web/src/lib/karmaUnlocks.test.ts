import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  APPROVED_ORDER_ID_REVIEW_WEIGHT,
  karmaUnlocks,
  MIN_TRUSTED_RATING_WEIGHT,
} from '../constants/karmaUnlocks'

import { computeKarmaUnlocks } from './karmaUnlocks'

const ratingTriggerSql = readFileSync(
  new URL('../../prisma/triggers/03_service_user_rating.sql', import.meta.url),
  'utf8'
)
const karmaWeightBranchSql = ratingTriggerSql.split('CREATE OR REPLACE FUNCTION refresh_user_comment_rating_trust()')[0] ?? ''
const sqlKarmaWeightUnlocks = [
  ...Array.from(
    karmaWeightBranchSql.matchAll(
      /author_record\."totalKarma"\s*>=\s*(-?\d+)[\s\S]*?RETURN QUERY SELECT ([\d.]+)::DOUBLE PRECISION/g
    ),
    (match) => ({ karma: Number(match[1]), reviewWeight: Number(match[2]) })
  ),
  ...Array.from(
    karmaWeightBranchSql.matchAll(
      /author_record\."totalKarma"\s*<=\s*(-?\d+)[\s\S]*?RETURN QUERY SELECT ([\d.]+)::DOUBLE PRECISION/g
    ),
    (match) => ({ karma: Number(match[1]), reviewWeight: Number(match[2]) })
  ),
  ...Array.from(
    karmaWeightBranchSql.matchAll(
      /RETURN QUERY SELECT ([\d.]+)::DOUBLE PRECISION, NULL::TEXT, 'Author has little account activity'/g
    ),
    (match) => ({ karma: -4, reviewWeight: Number(match[1]) })
  ),
]
const constantKarmaWeightUnlocks = karmaUnlocks.flatMap((unlock) =>
  unlock.reviewWeight === undefined ? [] : [{ karma: unlock.karma, reviewWeight: unlock.reviewWeight }]
)
const sortKarmaWeightUnlocks = <T extends { karma: number; reviewWeight: number }>(data: T[]) =>
  data.toSorted((a, b) => a.karma - b.karma)

void test('computes regular karma unlocks', () => {
  assert.equal(computeKarmaUnlocks(-5).baseReviewWeight, false)
  assert.equal(computeKarmaUnlocks(-4).baseReviewWeight, true)
  assert.equal(computeKarmaUnlocks(-5).reviewsNotCounted, true)
  assert.equal(computeKarmaUnlocks(-4).reviewsNotCounted, false)
  assert.equal(computeKarmaUnlocks(4).someActivityReviewWeight, false)
  assert.equal(computeKarmaUnlocks(5).someActivityReviewWeight, true)
  assert.equal(computeKarmaUnlocks(24).activeReviewWeight, false)
  assert.equal(computeKarmaUnlocks(25).activeReviewWeight, true)
  assert.equal(computeKarmaUnlocks(149).trustedReviewWeight, false)
  assert.equal(computeKarmaUnlocks(150).trustedReviewWeight, true)
  assert.equal(computeKarmaUnlocks(-29).untrustedBadge, false)
  assert.equal(computeKarmaUnlocks(-30).untrustedBadge, true)
})

void test('karma review weight unlocks match the rating trigger both ways', () => {
  assert.deepEqual(sortKarmaWeightUnlocks(sqlKarmaWeightUnlocks), sortKarmaWeightUnlocks(constantKarmaWeightUnlocks))
  assert.equal(MIN_TRUSTED_RATING_WEIGHT, 0.45)
  assert.match(
    karmaWeightBranchSql,
    new RegExp(`p_order_id_status = 'APPROVED'[\\s\\S]*SELECT ${String(APPROVED_ORDER_ID_REVIEW_WEIGHT)}::DOUBLE PRECISION`)
  )
})
