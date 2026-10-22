import type { PostHog, PostHogConfig } from 'posthog-js'
import type { EngagementDestination } from './types.js'

type PostHogClient = Pick<PostHog, 'init' | 'capture' | 'identify' | 'reset'>

export interface PostHogDestinationOptions {
  token: string
  host: string
  config?: Partial<PostHogConfig>
  load?: () => Promise<PostHogClient>
}

/**
 * Sends what the engagement client records to PostHog. PostHog's library is
 * only downloaded once the client first has something to send, so a page that
 * never gets consent never loads it. Page views come from the engagement
 * client, so PostHog's own are off unless the config turns them back on.
 */
export function posthogDestination(options: PostHogDestinationOptions): EngagementDestination {
  let posthog: PostHogClient | undefined
  const waiting: Array<(client: PostHogClient) => void> = []

  function send(call: (client: PostHogClient) => void): void {
    if (posthog) call(posthog)
    else waiting.push(call)
  }

  return {
    name: 'posthog',
    start() {
      const load = options.load ?? (async () => (await import('posthog-js')).posthog)
      void load()
        .then((client) => {
          client.init(options.token, { api_host: options.host, capture_pageview: false, ...options.config })
          posthog = client
          for (const call of waiting.splice(0)) call(client)
        })
        .catch(() => {
          waiting.length = 0
        })
    },
    page(event) {
      send((client) => client.capture('$pageview', event.properties))
    },
    track(event) {
      send((client) => client.capture(event.name, event.properties))
    },
    identify(person) {
      send((client) => client.identify(person.id, person.properties))
    },
    reset() {
      send((client) => client.reset())
    },
  }
}
