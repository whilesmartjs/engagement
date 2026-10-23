# WhileSmart Engagement

Framework-independent browser event tracking for `whilesmart/eloquent-engagement`.

## Install

```bash
npm install @whilesmart/engagement
```

## Use

```ts
import { createEngagementClient } from '@whilesmart/engagement'

const engagement = createEngagementClient({
  endpoint: 'https://api.example.com/api/engagement/events',
  siteKey: 'public-site-key',
  consent: () => analyticsConsentGranted(),
})

engagement.track('signup.started', { plan: 'business' })
```

The client records a random visitor ID in local storage and a random session ID in session storage. It derives source attribution from `utm_source`, then the referrer host, then `direct`. Events are batched, retried after failed requests, and flushed with `sendBeacon` when the page becomes hidden.

Set `autoLinkClicks: true` to record every link click as `link.clicked`, with
the link's text, where it goes, and whether it leaves the site. Use
`{ text: false }` where link text can be private, such as inside an app.

## Other analytics services

A destination receives everything the client records: page views, events,
`identify` on sign-in and `reset` on sign-out. The client still sends its own
events to the endpoint, so the admin console keeps its figures whichever
services are added, and one consent check covers them all.

```ts
import { createEngagementClient } from '@whilesmart/engagement'
import { posthogDestination } from '@whilesmart/engagement/posthog'

const engagement = createEngagementClient({
  endpoint,
  siteKey,
  autoLinkClicks: true,
  destinations: [
    posthogDestination({
      token: 'your-project-token-here',
      host: 'https://us.i.posthog.com',
      config: { session_recording: { maskAllInputs: true } },
    }),
  ],
})

engagement.identify({ id: '42', properties: { email: 'ada@example.com' } })
```

`posthog-js` is an optional peer dependency, downloaded only once the client
first has something to send. Any service can be added by passing an object with
a `name` and whichever of `start`, `page`, `track`, `identify` and `reset` it
needs. One that throws is reported to `onDestinationError` and never stops the
others.

The site key identifies a website. It is not a secret. The server must also restrict accepted browser origins.

## Linking a visitor to an account

The client gives each browser a random visitor id and each session a random
session id, and stamps both on every event. Neither is personal data. After
sign-in, the host posts the visitor id to its own authenticated route, so the
server can attribute that visitor's events to the account:

```ts
await api.post('/api/engagement/identify', { visitor_id: engagement.visitorId() })
```

`sessionId()` returns the current session id the same way.

## License

MIT. WhileSmart LTD.
