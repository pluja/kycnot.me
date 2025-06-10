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
}

export const allServerEventsData = [
  'new-notification',
  'new-connection',
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
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Document {
    addEventListener<K extends keyof SSEEventMap>(
      type: K,
      listener: (this: Document, ev: SSEEventMap[K]) => void
    ): void
    dispatchEvent<K extends keyof SSEEventMap>(ev: SSEEventMap[K]): void
  }
}
