import { adminAnnouncementActions } from './announcement'
import { adminAttributeActions } from './attribute'
import { adminContactActions } from './contact'
import { adminEventActions } from './event'
import { adminNotificationActions } from './notification'
import { adminServiceActions } from './service'
import { adminServiceSuggestionActions } from './serviceSuggestion'
import { adminUserActions } from './user'
import { verificationStep } from './verificationStep'

export const adminActions = {
  announcement: adminAnnouncementActions,
  attribute: adminAttributeActions,
  contact: adminContactActions,
  event: adminEventActions,
  notification: adminNotificationActions,
  service: adminServiceActions,
  serviceSuggestions: adminServiceSuggestionActions,
  user: adminUserActions,
  verificationStep,
}
