import { adminAttributeActions } from './attribute'
import { adminEventActions } from './event'
import { adminServiceActions } from './service'
import { adminServiceSuggestionActions } from './serviceSuggestion'
import { adminUserActions } from './user'
import { verificationStep } from './verificationStep'

export const adminActions = {
  attribute: adminAttributeActions,
  event: adminEventActions,
  service: adminServiceActions,
  serviceSuggestions: adminServiceSuggestionActions,
  user: adminUserActions,
  verificationStep,
}
