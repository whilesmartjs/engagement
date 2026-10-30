import assert from 'node:assert/strict'
import test from 'node:test'
import { createEngagementClient } from '../dist/index.js'
import { ga4Destination } from '../dist/ga4.js'

function setup(overrides = {}) {
  const calls = []
  let loads = 0
  const destination = ga4Destination({
    measurementId: 'G-EXAMPLE',
    load: () => {
      loads++
      return (...command) => calls.push(command)
    },
  })
  const client = createEngagementClient({
    autoPageViews: false,
    location: { href: 'https://example.test/pricing?email=private#account', search: '?email=private' },
    document: undefined,
    destinations: [destination],
    ...overrides,
  })
  return { client, calls, loads: () => loads }
}

test('consent gates loading and page views through the engagement client', async () => {
  let consent = false
  const { client, calls, loads } = setup({ consent: () => consent })
  try {
    client.page()
    assert.equal(loads(), 0)
    assert.deepEqual(calls, [])
    consent = true
    client.page()
    assert.equal(loads(), 1)
    assert.deepEqual(calls, [
      ['config', 'G-EXAMPLE', { send_page_view: false }],
      ['event', 'page_view', {
        send_to: 'G-EXAMPLE', page_location: 'https://example.test/pricing', page_referrer: '',
      }],
    ])
    consent = false
    client.page()
    assert.equal(calls.length, 2)
  } finally {
    await client.destroy()
  }
})

test('each page call produces a page view without forwarding event payloads or identities', async () => {
  const { client, calls } = setup()
  try {
    client.page({ email: 'private@example.test' })
    client.track('signup.clicked', { label: 'private' })
    client.identify({ id: 'private', properties: { email: 'private@example.test' } })
    client.reset()
    client.page()
    assert.equal(calls.length, 3)
    assert.deepEqual(calls.slice(1).map((call) => call[1]), ['page_view', 'page_view'])
    assert.equal(JSON.stringify(calls).includes('private'), false)
  } finally {
    await client.destroy()
  }
})

test('multiple destinations configure each measurement ID once and target their own stream', async () => {
  const calls = []
  const tag = (...command) => calls.push(command)
  const client = createEngagementClient({
    location: { href: 'https://example.test/', search: '' },
    destinations: ['G-FIRST', 'G-FIRST', 'G-SECOND'].map((measurementId) =>
      ga4Destination({ measurementId, load: () => tag })),
  })
  await client.destroy()
  assert.deepEqual(calls.filter(([command]) => command === 'config').map((call) => call[1]), ['G-FIRST', 'G-SECOND'])
  assert.deepEqual(calls.filter(([command]) => command === 'event').map((call) => call[2].send_to), ['G-FIRST', 'G-FIRST', 'G-SECOND'])
})

test('referrers lose query strings and fragments', async () => {
  const { client, calls } = setup({
    document: {
      referrer: 'https://search.example.test/search?q=private#result',
      addEventListener() {},
      removeEventListener() {},
    },
  })
  try {
    client.page()
    assert.equal(calls[1][2].page_referrer, 'https://search.example.test/search')
  } finally {
    await client.destroy()
  }
})

test('invalid page locations are not sent', async () => {
  const { client, calls } = setup({ location: { href: 'file:///private', search: '' } })
  try {
    client.page()
    assert.equal(calls.length, 1)
  } finally {
    await client.destroy()
  }
})

test('an unavailable loader leaves other destinations working', async () => {
  const pages = []
  const client = createEngagementClient({
    destinations: [ga4Destination({ measurementId: 'G-EXAMPLE', load: () => undefined }),
      { name: 'other', page: (event) => pages.push(event.name) }],
  })
  await client.destroy()
  assert.deepEqual(pages, ['page.view'])
})

test('the default loader is safe without a browser', async () => {
  const client = createEngagementClient({ destinations: [ga4Destination({ measurementId: 'G-EXAMPLE' })] })
  await client.destroy()
})

test('a failed tag configuration is reported without sending an unconfigured page view', async () => {
  const error = new Error('Tag unavailable')
  const calls = []
  const errors = []
  const client = createEngagementClient({
    location: { href: 'https://example.test/', search: '' },
    destinations: [ga4Destination({
      measurementId: 'G-EXAMPLE',
      load: () => (...command) => {
        calls.push(command)
        throw error
      },
    })],
    onDestinationError: (name, failure) => errors.push([name, failure]),
  })
  await client.destroy()
  assert.deepEqual(errors, [['ga4', error]])
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'config')
})

test('a GA4 measurement ID is required', () => {
  for (const measurementId of ['', 'GT-EXAMPLE', 'G-EXAMPLE&extra=value']) {
    assert.throws(() => ga4Destination({ measurementId }), /GA4 measurement ID/)
  }
})
