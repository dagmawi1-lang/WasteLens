import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'))
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')

test('PWA manifest defines a standalone app shell and icon', () => {
  assert.equal(manifest.name, 'WasteLens')
  assert.equal(manifest.display, 'standalone')
  assert.ok(manifest.icons.some(icon => icon.src === '/icons/wastelens.svg'))
  assert.match(html, /rel="manifest"/)
})

test('service worker caches app shell and versioned static assets', () => {
  assert.match(sw, /wastelens-shell-v22/)
  assert.match(sw, /APP_SHELL/)
  assert.match(sw, /\/assets\//)
})

test('service worker does not cache API or non-GET requests', () => {
  assert.match(sw, /request\.method !== 'GET'/)
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/)
  assert.ok(sw.indexOf("if (request.method !== 'GET') return") < sw.indexOf("if (url.pathname.startsWith('/api/')) return"))
})
