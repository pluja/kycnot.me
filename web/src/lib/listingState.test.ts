import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getListingState } from './listingState'

void test('visibility decides the state for public, archived and hidden services', () => {
  assert.equal(
    getListingState({ serviceVisibility: 'PUBLIC', latestCreateSuggestionStatus: 'PENDING' }),
    'LISTED'
  )
  assert.equal(
    getListingState({ serviceVisibility: 'ARCHIVED', latestCreateSuggestionStatus: null }),
    'ARCHIVED'
  )
  assert.equal(
    getListingState({ serviceVisibility: 'HIDDEN', latestCreateSuggestionStatus: 'REJECTED' }),
    'HIDDEN'
  )
})

void test('an unlisted service with an open suggestion is awaiting review', () => {
  assert.equal(
    getListingState({ serviceVisibility: 'UNLISTED', latestCreateSuggestionStatus: 'PENDING' }),
    'AWAITING_REVIEW'
  )
  assert.equal(
    getListingState({ serviceVisibility: 'UNLISTED', latestCreateSuggestionStatus: 'UNDER_REVIEW' }),
    'AWAITING_REVIEW'
  )
})

void test('a rejected suggestion reads as declined, a withdrawn one as closed', () => {
  assert.equal(
    getListingState({ serviceVisibility: 'UNLISTED', latestCreateSuggestionStatus: 'REJECTED' }),
    'DECLINED'
  )
  assert.equal(
    getListingState({ serviceVisibility: 'UNLISTED', latestCreateSuggestionStatus: 'WITHDRAWN' }),
    'CLOSED'
  )
})

void test('an unlisted service that was approved, or never suggested, has been removed', () => {
  assert.equal(
    getListingState({ serviceVisibility: 'UNLISTED', latestCreateSuggestionStatus: 'APPROVED' }),
    'REMOVED'
  )
  assert.equal(
    getListingState({ serviceVisibility: 'UNLISTED', latestCreateSuggestionStatus: null }),
    'REMOVED'
  )
})
