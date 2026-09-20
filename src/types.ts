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

export interface EngagementClientOptions {
  endpoint: string
  siteKey: string
  consent?: () => boolean
  autoPageViews?: boolean
  batchSize?: number
  flushInterval?: number
  fetch?: typeof globalThis.fetch
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  sessionStorage?: Pick<Storage, 'getItem' | 'setItem'>
  location?: Pick<Location, 'href' | 'search'>
  document?: Pick<Document, 'referrer' | 'visibilityState' | 'addEventListener' | 'removeEventListener'>
  navigator?: Pick<Navigator, 'sendBeacon'>
  crypto?: Pick<Crypto, 'randomUUID' | 'getRandomValues'>
}

export interface EngagementClient {
  page(properties?: EngagementProperties): void
  track(name: string, properties?: EngagementProperties, options?: TrackOptions): void
  flush(useBeacon?: boolean): Promise<void>
  destroy(): Promise<void>
}
