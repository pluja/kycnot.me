import type { ListingState } from '../constants/listingStates'
import type { ServiceSuggestionStatus, ServiceVisibility } from '@prisma/client'

type ListingStateInput = {
  serviceVisibility: ServiceVisibility
  // Status of the service's most recent new-service suggestion, or null when it never had one.
  latestCreateSuggestionStatus: ServiceSuggestionStatus | null
}

export function getListingState({
  serviceVisibility,
  latestCreateSuggestionStatus,
}: ListingStateInput): ListingState {
  switch (serviceVisibility) {
    case 'PUBLIC':
      return 'LISTED'
    case 'ARCHIVED':
      return 'ARCHIVED'
    case 'HIDDEN':
      return 'HIDDEN'
    case 'UNLISTED':
      return getUnlistedState(latestCreateSuggestionStatus)
  }
}

function getUnlistedState(latestCreateSuggestionStatus: ServiceSuggestionStatus | null): ListingState {
  switch (latestCreateSuggestionStatus) {
    case 'PENDING':
    case 'UNDER_REVIEW':
      return 'AWAITING_REVIEW'
    case 'REJECTED':
      return 'DECLINED'
    case 'WITHDRAWN':
      return 'CLOSED'
    case 'APPROVED':
    case null:
      return 'REMOVED'
  }
}
