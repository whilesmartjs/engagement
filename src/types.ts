export type EngagementValue = string | number | boolean | null

export type EngagementProperties = Record<string, EngagementValue | EngagementValue[]>

export interface EngagementEvent {
  name: string
  visitor_id: string
  session_id: string
  url?: string
  referrer?: string
  source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
  click_id?: string
  properties?: EngagementProperties
  occurred_at: string
}

export interface TrackOptions {
  url?: string
  referrer?: string
  source?: string
}

export interface EngagementPerson {
  id: string
  properties?: EngagementProperties
}

export interface DestinationContext {
  visitorId: string
  sessionId: string
}

/**
 * Another analytics service that receives what the client records. Every
 * method is optional, and a destination that throws never stops the others or
 * the client's own delivery.
 */
export interface EngagementDestination {
  name: string
  start?(context: DestinationContext): void
  page?(event: EngagementEvent): void
  track?(event: EngagementEvent): void
  identify?(person: EngagementPerson): void
  reset?(): void
}

export interface EngagementClientOptions {
  /** Left out, events reach only the destinations. */
  endpoint?: string
  siteKey?: string
  consent?: () => boolean
  destinations?: EngagementDestination[]
  autoPageViews?: boolean
  autoLinkClicks?: boolean
  batchSize?: number
  flushInterval?: number
  fetch?: typeof globalThis.fetch
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  sessionStorage?: Pick<Storage, 'getItem' | 'setItem'>
  location?: Pick<Location, 'href' | 'search'>
  document?: Pick<Document, 'referrer' | 'visibilityState' | 'addEventListener' | 'removeEventListener'>
  onDestinationError?: (destination: string, error: unknown) => void
  navigator?: Pick<Navigator, 'sendBeacon'>
  crypto?: Pick<Crypto, 'randomUUID' | 'getRandomValues'>
}

export interface EngagementClient {
  page(properties?: EngagementProperties): void
  track(name: string, properties?: EngagementProperties, options?: TrackOptions): void
  identify(person: EngagementPerson): void
  reset(): void
  flush(useBeacon?: boolean): Promise<void>
  destroy(): Promise<void>
}
