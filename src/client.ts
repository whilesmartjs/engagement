import type {
  EngagementClient,
  EngagementClientOptions,
  EngagementDestination,
  EngagementEvent,
  EngagementPerson,
  EngagementProperties,
  TrackOptions,
} from './types.js'

const visitorStorageKey = 'whilesmart.engagement.visitor'
const sessionStorageKey = 'whilesmart.engagement.session'

export function createEngagementClient(options: EngagementClientOptions): EngagementClient {
  const batchSize = Math.min(Math.max(options.batchSize ?? 10, 1), 20)
  const fetcher = options.fetch ?? globalThis.fetch?.bind(globalThis)
  const browserLocation = options.location ?? globalThis.location
  const browserDocument = options.document ?? globalThis.document
  const browserNavigator = options.navigator ?? globalThis.navigator
  const localStorage = options.storage ?? safeStorage('localStorage')
  const sessionStorage = options.sessionStorage ?? safeStorage('sessionStorage')
  const browserCrypto = options.crypto ?? globalThis.crypto
  const visitorId = persistentId(localStorage, visitorStorageKey, browserCrypto)
  const sessionId = persistentId(sessionStorage, sessionStorageKey, browserCrypto)
  const queue: EngagementEvent[] = []
  const destinations = options.destinations ?? []
  let started = false
  let flushing: Promise<void> | undefined

  function deliver(call: (destination: EngagementDestination) => void): void {
    if (!started) {
      started = true
      deliver((destination) => destination.start?.({ visitorId, sessionId }))
    }
    for (const destination of destinations) {
      try {
        call(destination)
      } catch (error) {
        options.onDestinationError?.(destination.name, error)
      }
    }
  }

  function consented(): boolean {
    return !options.consent || options.consent()
  }

  const onVisibilityChange = () => {
    if (browserDocument?.visibilityState === 'hidden') void flush(true)
  }

  browserDocument?.addEventListener('visibilitychange', onVisibilityChange)

  const timer = globalThis.setInterval(() => void flush(), options.flushInterval ?? 5000)

  function track(name: string, properties?: EngagementProperties, eventOptions: TrackOptions = {}): void {
    if (!consented()) return

    const event: EngagementEvent = {
      name,
      visitor_id: visitorId,
      session_id: sessionId,
      occurred_at: new Date().toISOString(),
    }
    const url = eventOptions.url ?? browserLocation?.href
    const referrer = eventOptions.referrer ?? browserDocument?.referrer
    const attribution = attributionFrom(browserLocation?.search, referrer)
    const source = eventOptions.source ?? attribution.source

    if (url) event.url = url
    if (referrer) event.referrer = referrer
    if (source) event.source = source
    if (attribution.utm_medium) event.utm_medium = attribution.utm_medium
    if (attribution.utm_campaign) event.utm_campaign = attribution.utm_campaign
    if (attribution.utm_term) event.utm_term = attribution.utm_term
    if (attribution.utm_content) event.utm_content = attribution.utm_content
    if (attribution.click_id) event.click_id = attribution.click_id
    if (properties && Object.keys(properties).length > 0) event.properties = properties

    queue.push(event)
    deliver((destination) => (name === 'page.view' ? destination.page?.(event) : destination.track?.(event)))
    if (queue.length >= batchSize) void flush()
  }

  function page(properties?: EngagementProperties): void {
    track('page.view', properties)
  }

  function identify(person: EngagementPerson): void {
    if (!consented()) return
    deliver((destination) => destination.identify?.(person))
  }

  function reset(): void {
    deliver((destination) => destination.reset?.())
  }

  const withText = typeof options.autoLinkClicks !== 'object' || options.autoLinkClicks.text

  const onClick = (event: Event) => {
    const link = event.target instanceof Element ? event.target.closest('a') : null
    if (!link?.href) return
    const properties: EngagementProperties = {
      destination: link.origin + link.pathname,
      outbound: link.origin !== originOf(browserLocation?.href),
    }
    if (withText) properties.label = (link.textContent ?? '').trim().slice(0, 200)
    track('link.clicked', properties)
    void flush(true).catch(() => {})
  }

  if (options.autoLinkClicks) browserDocument?.addEventListener('click', onClick)

  /**
   * An urgent flush is one made as the page is left, so it sends at once rather
   * than waiting behind a request already on its way: by the time that one
   * settles, the page may be gone along with whatever was still queued.
   */
  async function flush(urgent = false): Promise<void> {
    if (!options.endpoint) {
      queue.length = 0
      return
    }
    if (flushing && !urgent) return flushing
    if (queue.length === 0) return
    const endpoint = options.endpoint

    const events = queue.splice(0, batchSize)
    const body = JSON.stringify({ site_key: options.siteKey, events })

    if (urgent && browserNavigator?.sendBeacon?.(endpoint, new Blob([body], { type: 'application/json' }))) {
      return
    }

    if (!fetcher) {
      queue.unshift(...events)
      throw new Error('No fetch implementation is available')
    }

    const request = fetcher(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Engagement-Site-Key': options.siteKey ?? '',
      },
      body,
      keepalive: true,
    }).then((response) => {
      if (!response.ok) throw new Error(`Engagement request failed with status ${response.status}`)
    }).catch((error) => {
      queue.unshift(...events)
      throw error
    }).finally(() => {
      if (flushing === request) flushing = undefined
    })

    flushing = request
    return request
  }

  async function destroy(): Promise<void> {
    globalThis.clearInterval(timer)
    browserDocument?.removeEventListener('visibilitychange', onVisibilityChange)
    browserDocument?.removeEventListener('click', onClick)
    await flush()
  }

  if (options.autoPageViews !== false) page()

  return { page, track, identify, reset, flush, destroy }
}

function originOf(href: string | undefined): string | undefined {
  try {
    return href ? new URL(href).origin : undefined
  } catch {
    return undefined
  }
}

function persistentId(storage: Pick<Storage, 'getItem' | 'setItem'> | undefined, key: string, crypto: Pick<Crypto, 'randomUUID' | 'getRandomValues'> | undefined): string {
  const existing = storage?.getItem(key)
  if (existing) return existing

  const value = createId(crypto)
  try {
    storage?.setItem(key, value)
  } catch {}
  return value
}

function createId(crypto: Pick<Crypto, 'randomUUID' | 'getRandomValues'> | undefined): string {
  if (crypto?.randomUUID) return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto?.getRandomValues?.(bytes)
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('') || `${Date.now()}-${Math.random()}`
}

function safeStorage(name: 'localStorage' | 'sessionStorage'): Storage | undefined {
  try {
    return globalThis[name]
  } catch {
    return undefined
  }
}

function attributionFrom(search = '', referrer = '') {
  const params = new URLSearchParams(search)
  const campaignSource = params.get('utm_source')
  let source = campaignSource ?? 'direct'

  if (!campaignSource && referrer) {
    try {
      source = new URL(referrer).hostname
    } catch {
      source = referrer
    }
  }

  return {
    source,
    utm_medium: params.get('utm_medium') ?? undefined,
    utm_campaign: params.get('utm_campaign') ?? undefined,
    utm_term: params.get('utm_term') ?? undefined,
    utm_content: params.get('utm_content') ?? undefined,
    click_id: params.get('gclid') ?? params.get('fbclid') ?? params.get('msclkid') ?? undefined,
  }
}
