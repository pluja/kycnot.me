import { accountActions } from './account'
import { adminActions } from './admin'
import { commentActions } from './comment'
import { notificationActions } from './notifications'
import { serviceActions } from './service'
import { serviceSuggestionActions } from './serviceSuggestion'

/**
 * @deprecated Don't import this object, use {@link actions} instead, like: `import { actions } from 'astro:actions'`
 *
 * @example
 * ```ts
 * import { actions } from 'astro:actions'
 * import { server } from '~/actions' // WRONG!!!!
 *
 * const result = Astro.getActionResult(actions.admin.attribute.create)
 * ```
 */
export const server = {
  account: accountActions,
  admin: adminActions,
  comment: commentActions,
  notification: notificationActions,
  service: serviceActions,
  serviceSuggestion: serviceSuggestionActions,
}

// Don't create an object named actions, put the actions in the server object instead. Astro will automatically export the server object as actions.
