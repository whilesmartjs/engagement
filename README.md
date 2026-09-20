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

The site key identifies a website. It is not a secret. The server must also restrict accepted browser origins.

## License

MIT. WhileSmart LTD.
