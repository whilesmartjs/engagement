import type { EngagementDestination } from './types.js'

export type GoogleTag = (...command:
  | ['js', Date]
  | ['config', string, { send_page_view: false }]
  | ['event', 'page_view', { send_to: string; page_location: string; page_referrer: string }]
) => void

export interface Ga4DestinationOptions {
  measurementId: string
  load?: () => GoogleTag | undefined
}

const configured = new WeakMap<GoogleTag, Set<string>>()

export function ga4Destination(options: Ga4DestinationOptions): EngagementDestination {
  if (!/^G-[A-Z0-9]+$/.test(options.measurementId)) {
    throw new Error('A GA4 measurement ID starting with G- is required')
  }
  let tag: GoogleTag | undefined

  return {
    name: 'ga4',
    start() {
      tag = undefined
      const loaded = options.load ? options.load() : loadGoogleTag(options.measurementId)
      if (!loaded) return
      let targets = configured.get(loaded)
      if (!targets) {
        targets = new Set()
        configured.set(loaded, targets)
      }
      if (!targets.has(options.measurementId)) {
        loaded('config', options.measurementId, { send_page_view: false })
        targets.add(options.measurementId)
      }
      tag = loaded
    },
    page(event) {
      if (!tag) return
      const pageLocation = pageUrl(event.url)
      if (!pageLocation) return
      const pageReferrer = pageUrl(event.referrer)
      tag('event', 'page_view', {
        send_to: options.measurementId,
        page_location: pageLocation,
        page_referrer: pageReferrer ?? '',
      })
    },
  }
}

function pageUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    return url.origin + url.pathname
  } catch {
    return undefined
  }
}

function loadGoogleTag(measurementId: string): GoogleTag | undefined {
  if (typeof window === 'undefined' || typeof document === 'undefined') return undefined
  const browser = window as Window & { dataLayer?: unknown[]; gtag?: GoogleTag }
  if (!browser.gtag) {
    const dataLayer = browser.dataLayer ??= []
    browser.gtag = function (..._command) { dataLayer.push(arguments) }
    browser.gtag('js', new Date())
  }
  const installed = Array.from(document.scripts).some((script) => {
    try {
      const url = new URL(script.src)
      return url.origin === 'https://www.googletagmanager.com' && url.pathname === '/gtag/js'
    } catch {
      return false
    }
  })
  if (!installed) {
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
    document.head.appendChild(script)
  }
  return browser.gtag
}
