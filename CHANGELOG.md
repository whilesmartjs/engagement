# Changelog

All notable changes to the WhileSmart engagement client are documented in this file.

## [0.2.0] - 2026-10-22

### Added
- Destinations: other analytics services receive every page view, event, sign-in and sign-out the client records, behind the same consent check, while the client keeps sending to its own endpoint
- A PostHog destination, loading `posthog-js` (an optional peer dependency) only once there is something to send
- `identify` and `reset`, passed to every destination
- `autoLinkClicks`, recording each link click with its text, destination and whether it leaves the site; `{ text: false }` leaves the text out
- `endpoint` and `siteKey` are optional: left out, events reach only the destinations

### Fixed
- A batch the backend refuses during a scheduled flush is kept for the next attempt without surfacing as an unhandled error in the page
- A flush made as the page is left sends at once instead of waiting behind a request already on its way, so the last events before a link is followed are not lost

## [0.1.0] - 2026-09-20

- Initial release.
- Browser client that records page views and named events against a site key.
- Visitor and session identifiers persisted in local and session storage.
- Referrer and UTM attribution read from the page on first sight.
- Batched delivery with consent gating, and a failed batch restored for a later retry.
