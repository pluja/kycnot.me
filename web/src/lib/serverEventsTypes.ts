import type { Assert } from './assert'
import type { Equals } from 'ts-toolbelt/out/Any/Equals'

export type NotificationAction = {
  action: string
  title: string
  icon?: string

  url: string | null
  iconName?: string
}

export type NotificationPayload = {
  title: string
  body: string | null
  actions: NotificationAction[]
}

export type NotificationData = {
  defaultActionUrl: string
  payload: NotificationPayload | null
}

export type ServerEventsData = {
  'new-notification': NotificationPayload
  'new-connection': {
    timestamp: string
  }
  'new-chat-message': {
    conversationType: ChatConversationType
    id: number
  }
}

export type ChatConversationType = 'contact' | 'suggestion'

export const allServerEventsData = [
  'new-notification',
  'new-connection',
  'new-chat-message',
] as const satisfies (keyof ServerEventsData)[]

type _ExpectServerEventsDataToHaveAllValues = Assert<
  Equals<(typeof allServerEventsData)[number], keyof ServerEventsData>
>

export type ServerEventsEvent = {
  [K in keyof ServerEventsData]: {
    type: K
    data: ServerEventsData[K]
  }
}[keyof ServerEventsData]

export type SSEEventMap = {
  [K in keyof ServerEventsData as `sse:${K}`]: CustomEvent<ServerEventsData[K]>
}

declare global {
  // Added to the event map rather than as an overload on Document. An overload
  // constrained to these events wins when a type argument is given explicitly,
  // which left addEventListener<'astro:page-load'> unable to name an event it
  // handles perfectly well.
  // Empty on purpose: extending is what merges these events into the map.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions, @typescript-eslint/no-empty-object-type
  interface DocumentEventMap extends SSEEventMap {}

  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Document {
    dispatchEvent<K extends keyof SSEEventMap>(ev: SSEEventMap[K]): void
  }
}
