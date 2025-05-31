import { actions } from 'astro:actions'

import { makeEndpointFromAction } from '../../../../lib/endpoints'

import type { APIRoute } from 'astro'

export const QUERY: APIRoute = makeEndpointFromAction(actions.api.service.get)
