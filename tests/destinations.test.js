import assert from 'node:assert/strict'
import test from 'node:test'
import { createEngagementClient } from '../dist/index.js'
import { posthogDestination } from '../dist/posthog.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

function listeners() {
  const handlers = new Map()
  return {
    referrer: '',
    visibilityState: 'visible',
    addEventListener: (type, handler) => handlers.set(type, handler),
    removeEventListener: (type) => handlers.delete(type),
    fire: (type, event) => handlers.get(type)?.(event),
  }
}

function clientOptions(overrides = {}) {
  return {
    endpoint: 'https://api.example.test/api/engagement/events',
    siteKey: 'site-key',
    autoPageViews: false,
    fetch: async () => ({ ok: true, status: 202 }),
    storage: memoryStorage(),
    sessionStorage: memoryStorage(),
    location: { href: 'https://site.example/pricing', search: '' },
    document: listeners(),
    crypto: { randomUUID: () => 'fixed-id', getRandomValues: (value) => value },
    ...overrides,
  }
}

function recorder(name = 'recorder') {
  const calls = []
  return {
    calls,
    destination: {
      name,
      start: (context) => calls.push(['start', context]),
      page: (event) => calls.push(['page', event.name]),
      track: (event) => calls.push(['track', event.name, event.properties]),
      identify: (person) => calls.push(['identify', person.id]),
      reset: () => calls.push(['reset']),
    },
  }
}

test('every destination receives what the client records, and the backend still does', async () => {
  const sent = []
  const { calls, destination } = recorder()
  const client = createEngagementClient(clientOptions({
    destinations: [destination],
    fetch: async (url, init) => {
      sent.push(...JSON.parse(init.body).events.map((event) => event.name))
      return { ok: true, status: 202 }
    },
  }))

  client.page()
  client.track('signup.clicked', { label: 'Start' })
  client.identify({ id: '7' })
  client.reset()
  await client.destroy()

  assert.deepEqual(calls, [
    ['start', { visitorId: 'fixed-id', sessionId: 'fixed-id' }],
    ['page', 'page.view'],
    ['track', 'signup.clicked', { label: 'Start' }],
    ['identify', '7'],
    ['reset'],
  ])
  assert.deepEqual(sent, ['page.view', 'signup.clicked'])
})

test('no destination starts or hears anything before consent', async () => {
  const { calls, destination } = recorder()
  const client = createEngagementClient(clientOptions({ destinations: [destination], consent: () => false }))

  client.page()
  client.track('signup.clicked')
  client.identify({ id: '7' })
  await client.destroy()

  assert.deepEqual(calls, [])
})

test('a destination that throws does not stop the others', async () => {
  const errors = []
  const { calls, destination } = recorder('second')
  const client = createEngagementClient(clientOptions({
    destinations: [{ name: 'broken', track: () => { throw new Error('down') } }, destination],
    onDestinationError: (name, error) => errors.push([name, error.message]),
  }))

  client.track('signup.clicked')
  await client.destroy()

  assert.deepEqual(errors, [['broken', 'down']])
  assert.deepEqual(calls.map(([kind]) => kind), ['start', 'track'])
})

test('link clicks are recorded when asked for', async () => {
  const document = listeners()
  const { calls, destination } = recorder()
  const client = createEngagementClient(clientOptions({ destinations: [destination], document, autoLinkClicks: true }))

  const link = { href: 'https://app.example/register', origin: 'https://app.example', pathname: '/register', textContent: ' Start free ' }
  globalThis.Element ??= class {}
  Object.setPrototypeOf(link, globalThis.Element.prototype)
  link.closest = () => link
  document.fire('click', { target: link })
  const internal = Object.assign(Object.create(globalThis.Element.prototype), {
    href: 'https://site.example/pricing', origin: 'https://site.example', pathname: '/pricing', textContent: 'Pricing',
  })
  internal.closest = () => internal
  document.fire('click', { target: internal })
  await client.destroy()

  assert.deepEqual(calls.slice(-2), [
    ['track', 'link.clicked', { label: 'Start free', destination: 'https://app.example/register', outbound: true }],
    ['track', 'link.clicked', { label: 'Pricing', destination: 'https://site.example/pricing', outbound: false }],
  ])
})

test('link clicks can be recorded without what the link says', async () => {
  const document = listeners()
  const { calls, destination } = recorder()
  const client = createEngagementClient(clientOptions({ destinations: [destination], document, autoLinkClicks: { text: false } }))

  globalThis.Element ??= class {}
  const link = Object.assign(Object.create(globalThis.Element.prototype), {
    href: 'https://site.example/repositories/secret', origin: 'https://site.example', pathname: '/repositories/secret', textContent: 'acme/secret-repo',
  })
  link.closest = () => link
  document.fire('click', { target: link })
  await client.destroy()

  assert.deepEqual(calls.at(-1), ['track', 'link.clicked', { destination: 'https://site.example/repositories/secret', outbound: false }])
})

test('posthog hears what arrived before its library loaded, in order', async () => {
  const calls = []
  let loaded
  const library = new Promise((resolve) => (loaded = resolve))
  const client = createEngagementClient(clientOptions({
    destinations: [posthogDestination({
      token: 'project-token',
      host: 'https://us.i.posthog.com',
      config: { mask_all_text: true },
      load: () => library,
    })],
  }))

  client.page({ section: 'pricing' })
  client.track('signup.clicked', { label: 'Start' })
  client.identify({ id: '7', properties: { email: 'ada@example.test' } })

  loaded({
    init: (token, config) => calls.push(['init', token, config]),
    capture: (name, properties) => calls.push(['capture', name, properties]),
    identify: (id, properties) => calls.push(['identify', id, properties]),
    reset: () => calls.push(['reset']),
  })
  await library
  await new Promise((resolve) => setImmediate(resolve))
  client.reset()
  await client.destroy()

  assert.deepEqual(calls, [
    ['init', 'project-token', { api_host: 'https://us.i.posthog.com', capture_pageview: false, mask_all_text: true }],
    ['capture', '$pageview', { section: 'pricing' }],
    ['capture', 'signup.clicked', { label: 'Start' }],
    ['identify', '7', { email: 'ada@example.test' }],
    ['reset'],
  ])
})

test('a flush made as the page is left does not wait behind one already sending', async () => {
  const bodies = []
  const pending = []
  const client = createEngagementClient(clientOptions({
    navigator: { sendBeacon: () => false },
    fetch: (url, init) => {
      bodies.push(JSON.parse(init.body).events.map((event) => event.name))
      return new Promise((resolve) => pending.push(() => resolve({ ok: true, status: 202 })))
    },
  }))

  client.track('link.clicked')
  const first = client.flush(true)
  client.track('signup.clicked')
  const second = client.flush(true)

  assert.deepEqual(bodies, [['link.clicked'], ['signup.clicked']])
  for (const resolve of pending) resolve()
  await Promise.all([first, second])
  await client.destroy()
})

test('without an endpoint, events reach only the destinations', async () => {
  let requests = 0
  const { calls, destination } = recorder()
  const client = createEngagementClient(clientOptions({
    endpoint: undefined,
    siteKey: undefined,
    destinations: [destination],
    fetch: async () => {
      requests += 1
      return { ok: true, status: 202 }
    },
  }))

  client.track('signup.clicked')
  await client.flush()
  await client.destroy()

  assert.equal(requests, 0)
  assert.deepEqual(calls.map(([kind]) => kind), ['start', 'track'])
})
