import { actions } from 'astro:actions'

import { makeEndpointFromAction } from '../../../lib/endpoints'

import type { APIRoute } from 'astro'

export const POST: APIRoute = makeEndpointFromAction(actions.notification.webPush.subscribe)
