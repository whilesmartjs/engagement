# Changelog

All notable changes to the WhileSmart engagement client are documented in this file.

## [Unreleased]

### Added
- Destinations: other analytics services receive every page view, event, sign-in and sign-out the client records, behind the same consent check, while the client keeps sending to its own endpoint
- A PostHog destination, loading `posthog-js` (an optional peer dependency) only once there is something to send
- `identify` and `reset`, passed to every destination
- `autoLinkClicks`, recording each link click with its text, destination and whether it leaves the site

## [0.1.0] - 2026-09-20

- Initial release.
- Browser client that records page views and named events against a site key.
- Visitor and session identifiers persisted in local and session storage.
- Referrer and UTM attribution read from the page on first sight.
- Batched delivery with consent gating, and a failed batch restored for a later retry.
