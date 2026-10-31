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

## Google Analytics 4

```ts
import { createEngagementClient } from '@whilesmart/engagement'
import { ga4Destination } from '@whilesmart/engagement/ga4'

const engagement = createEngagementClient({
  endpoint,
  siteKey,
  consent: () => analyticsConsentGranted(),
  destinations: [ga4Destination({ measurementId: 'G-EXAMPLE' })],
})
```

The GA4 destination loads the Google tag on the first consented event. It reuses
an existing tag script and configures each measurement ID once, with automatic
page views disabled. Every `engagement.page()` call sends one `page_view` to
that measurement ID. The default client records the initial page view; apps
that record router navigation themselves should set `autoPageViews: false`.

Disable **Page changes based on browser history events** in the GA4 stream's
Enhanced Measurement settings to prevent duplicate page views on navigation.
`send_page_view: false` only disables the initial automatic page view.

Only HTTP(S) page and referrer URLs are forwarded, without query strings or
fragments. Custom event payloads, link labels, identities, and engagement visitor
and session IDs are not forwarded. URL paths must not contain personal data.
The host owns consent changes and any Google consent-mode configuration.

For a host-managed Google tag, `load` can return its existing `gtag` function
instead of inserting a script. A loader that returns `undefined` disables this
destination. Server-side rendering does not load the tag.

Google documents the [tag commands](https://developers.google.com/tag-platform/gtagjs/reference)
and [manual page view settings](https://developers.google.com/analytics/devguides/collection/ga4/views).

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
