import assert from 'node:assert/strict'
import test from 'node:test'
import { createEngagementClient } from '../dist/index.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

function clientOptions(fetch, overrides = {}) {
  return {
    endpoint: 'https://api.example.test/api/engagement/events',
    siteKey: 'site-key',
    autoPageViews: false,
    fetch,
    storage: memoryStorage(),
    sessionStorage: memoryStorage(),
    location: {
      href: 'https://site.example/pricing?utm_source=newsletter&utm_medium=email&utm_campaign=launch&gclid=click-1',
      search: '?utm_source=newsletter&utm_medium=email&utm_campaign=launch&gclid=click-1',
    },
    document: { referrer: '', visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    crypto: { randomUUID: () => 'fixed-id', getRandomValues: (value) => value },
    ...overrides,
  }
}

test('sends events using the server batch contract', async () => {
  const requests = []
  const client = createEngagementClient(clientOptions(async (url, init) => {
    requests.push({ url, init })
    return { ok: true, status: 202 }
  }))

  client.page({ plan: 'business' })
  await client.flush()
  await client.destroy()

  assert.equal(requests.length, 1)
  assert.equal(requests[0].init.headers['X-Engagement-Site-Key'], 'site-key')
  const payload = JSON.parse(requests[0].init.body)
  assert.equal(payload.events[0].name, 'page.view')
  assert.equal(payload.events[0].source, 'newsletter')
  assert.equal(payload.events[0].utm_medium, 'email')
  assert.equal(payload.events[0].utm_campaign, 'launch')
  assert.equal(payload.events[0].click_id, 'click-1')
  assert.deepEqual(payload.events[0].properties, { plan: 'business' })
})

test('does not collect events before consent', async () => {
  let requests = 0
  const client = createEngagementClient(clientOptions(async () => {
    requests += 1
    return { ok: true, status: 202 }
  }, { consent: () => false }))

  client.track('signup.started')
  await client.flush()
  await client.destroy()

  assert.equal(requests, 0)
})

test('restores a failed batch for a later retry', async () => {
  let attempts = 0
  const client = createEngagementClient(clientOptions(async () => {
    attempts += 1
    return { ok: attempts > 1, status: attempts > 1 ? 202 : 503 }
  }))

  client.track('signup.started')
  await assert.rejects(client.flush(), /status 503/)
  await client.flush()
  await client.destroy()

  assert.equal(attempts, 2)
})
