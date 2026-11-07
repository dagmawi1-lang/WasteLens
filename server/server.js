import express from 'express'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, copyFileSync, chmodSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { hashPassword, verifyPassword, validUsername, validPassword, hashSessionToken, sanitizeSyncData } from './security.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, 'data')
const dataFile = join(dataDir, 'classifications.json')
const usersFile = join(dataDir, 'users.json')
const syncFile = join(dataDir, 'sync.json')
const distDir = join(__dirname, '..', 'dist')
const indexFile = join(distDir, 'index.html')
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
for (const file of [dataFile, usersFile, syncFile]) if (!existsSync(file)) writeFileSync(file, '{}', { mode: 0o600 })

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false)
app.use(express.json({ limit: '500kb' }))
app.use((req,res,next) => {
  res.setHeader('X-Content-Type-Options','nosniff')
  res.setHeader('X-Frame-Options','DENY')
  res.setHeader('Referrer-Policy','no-referrer')
  res.setHeader('Permissions-Policy','camera=(self), microphone=(), geolocation=()')
  res.setHeader('Cache-Control','no-store')
  res.setHeader('X-Request-ID', randomBytes(12).toString('hex'))
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://storage.googleapis.com https://*.googleapis.com https://tfhub.dev; worker-src 'self' blob:; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")
  res.setHeader('Cross-Origin-Opener-Policy','same-origin')
  next()
})

function readJson(file, fallback) {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'))
    return value && typeof value === 'object' ? value : fallback
  } catch { return fallback }
}
function writeJsonAtomic(file, value) {
  const temporary = `${file}.${randomBytes(6).toString('hex')}.tmp`
  writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 })
  if (existsSync(file)) {
    try { copyFileSync(file, `${file}.bak`); chmodSync(`${file}.bak`, 0o600) } catch { /* A backup failure must not prevent the atomic write. */ }
  }
  renameSync(temporary, file)
}
function readClassifications() {
  const value = readJson(dataFile, [])
  return Array.isArray(value) ? value : []
}
function saveClassifications(rows) { writeJsonAtomic(dataFile, rows.slice(-500)) }
function readUsers() { return readJson(usersFile, {}) }
function saveUsers(users) { writeJsonAtomic(usersFile, users) }
function readSyncStore() { return readJson(syncFile, {}) }
function saveSyncStore(store) { writeJsonAtomic(syncFile, store) }
function validType(type) { return ['recycle','compost','trash','special','unknown'].includes(type) }

const sessions = new Map()
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const authAttempts = new Map()
function getClientKey(req) { return req.ip || req.socket.remoteAddress || 'unknown' }
function rateLimitAuth(req, res, next) {
  const key = getClientKey(req)
  const now = Date.now()
  const current = authAttempts.get(key)
  if (!current || now - current.startedAt > 15 * 60 * 1000) authAttempts.set(key, { startedAt: now, count: 1 })
  else current.count += 1
  if (authAttempts.get(key).count > 8) { res.setHeader('Retry-After', '900'); return res.status(429).json({ error: 'Too many account attempts. Try again later.' }) }
  next()
}
const apiWindows = new Map()
function apiRateLimit(req, res, next) {
  const key = getClientKey(req)
  const now = Date.now()
  let entry = apiWindows.get(key)
  if (!entry || now - entry.startedAt > 15 * 60 * 1000) { entry = { startedAt: now, count: 0 }; apiWindows.set(key, entry) }
  entry.count += 1
  if (entry.count > 600) { res.setHeader('Retry-After', '900'); return res.status(429).json({ error: 'API request limit reached. Try again later.' }) }
  next()
}

function cookieValue(req, name) {
  const cookie = req.headers.cookie || ''
  const item = cookie.split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`))
  if (!item) return ''
  try { return decodeURIComponent(item.slice(name.length + 1)) } catch { return '' }
}
function cookieOptions() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `wastelens_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure}`
}
function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `wastelens_session=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS/1000)}; HttpOnly; SameSite=Strict${secure}`)
}
function clearSessionCookie(res) { res.setHeader('Set-Cookie', cookieOptions()) }
function requireSameOrigin(req, res, next) {
  const origin = req.headers.origin
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Cross-origin request blocked.' })
    } catch { return res.status(403).json({ error: 'Invalid request origin.' }) }
  }
  next()
}
if (existsSync(distDir)) {
  app.use(express.static(distDir, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.includes('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      else if (filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache')
    }
  }))
}
app.use('/api', apiRateLimit)

function createSession(userId, res) {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = hashSessionToken(token)
  sessions.set(tokenHash, { userId, expiresAt: Date.now() + SESSION_TTL_MS })
  setSessionCookie(res, token)
}
function requireAuth(req, res, next) {
  const token = cookieValue(req, 'wastelens_session')
  if (!token) return res.status(401).json({ error: 'Sign in to use cloud sync.' })
  const tokenHash = hashSessionToken(token)
  const session = sessions.get(tokenHash)
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(tokenHash)
    clearSessionCookie(res)
    return res.status(401).json({ error: 'Your session expired. Sign in again.' })
  }
  const user = Object.values(readUsers()).find(item => item.id === session.userId)
  if (!user) return res.status(401).json({ error: 'Account not found. Sign in again.' })
  req.user = user
  req.sessionHash = tokenHash
  next()
}

app.get('/api/health',(req,res)=>res.json({ok:true,service:'WasteLens'}))
app.get('/api/stats',(req,res)=>{
  const rows=readClassifications()
  res.json({total:rows.length,recyclable:rows.filter(x=>x.type==='recycle').length,verified:rows.filter(x=>x.verified).length})
})
app.get('/api/classifications',(req,res)=>res.json(readClassifications().slice(-50).reverse()))
app.post('/api/classifications',(req,res)=>{
  const body=req.body||{}
  if(typeof body.label!=='string'||!validType(body.type)) return res.status(400).json({error:'Invalid classification'})
  const rows=readClassifications()
  rows.push({id:String(body.id||Date.now()),label:body.label.slice(0,120),confidence:Math.max(0,Math.min(100,Number(body.confidence)||0)),type:body.type,material:String(body.material||'').slice(0,160),verified:Boolean(body.verified),createdAt:new Date().toISOString()})
  saveClassifications(rows)
  res.status(201).json({ok:true})
})
app.post('/api/classifications/verify',(req,res)=>{
  const {id,type}=req.body||{}
  if(!id||!validType(type)) return res.status(400).json({error:'Invalid verification'})
  const rows=readClassifications(); const row=rows.find(x=>x.id===id)
  if(!row) return res.status(404).json({error:'Classification not found'})
  row.type=type; row.verified=true; saveClassifications(rows); res.json({ok:true})
})

app.post('/api/auth/register', requireSameOrigin, rateLimitAuth, async (req,res) => {
  const { username, password } = req.body || {}
  if (!validUsername(username)) return res.status(400).json({ error: 'Username must be 3–24 characters using letters, numbers, underscores, or hyphens.' })
  if (!validPassword(password)) return res.status(400).json({ error: 'Password must be 12–128 characters.' })
  const users = readUsers()
  const normalized = username.toLowerCase()
  if (Object.values(users).some(user => user.username.toLowerCase() === normalized)) return res.status(409).json({ error: 'That username is already in use.' })
  const id = randomBytes(16).toString('hex')
  users[id] = { id, username, passwordHash: await hashPassword(password), createdAt: new Date().toISOString() }
  saveUsers(users)
  createSession(id, res)
  res.status(201).json({ ok: true, user: { id, username } })
})
app.post('/api/auth/login', requireSameOrigin, rateLimitAuth, async (req,res) => {
  const { username, password } = req.body || {}
  if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Enter your username and password.' })
  const user = Object.values(readUsers()).find(item => item.username.toLowerCase() === username.toLowerCase())
  if (!user || !(await verifyPassword(password, user.passwordHash))) return res.status(401).json({ error: 'Username or password is incorrect.' })
  createSession(user.id, res)
  res.json({ ok: true, user: { id: user.id, username: user.username } })
})
app.post('/api/auth/logout', requireSameOrigin, (req,res) => {
  const token = cookieValue(req, 'wastelens_session')
  if (token) sessions.delete(hashSessionToken(token))
  clearSessionCookie(res)
  res.json({ ok: true })
})
app.get('/api/auth/me', requireAuth, (req,res) => res.json({ user: { id: req.user.id, username: req.user.username } }))

app.get('/api/sync', requireAuth, (req,res) => {
  const store = readSyncStore()
  const entry = store[req.user.id] || { revision: 0, data: {} }
  res.json({ revision: entry.revision, updatedAt: entry.updatedAt || null, data: entry.data || {} })
})
app.put('/api/sync', requireSameOrigin, requireAuth, (req,res) => {
  const body = req.body || {}
  if (!Number.isInteger(body.expectedRevision) || body.expectedRevision < 0) return res.status(400).json({ error: 'A valid expectedRevision is required.' })
  let data
  try { data = sanitizeSyncData(body.data) } catch (error) { return res.status(400).json({ error: error.message }) }
  const store = readSyncStore()
  const current = store[req.user.id] || { revision: 0, data: {} }
  if (body.expectedRevision !== current.revision) return res.status(409).json({ error: 'Cloud data changed since you last loaded it. Load the latest cloud copy before syncing again.', revision: current.revision })
  const next = { revision: current.revision + 1, updatedAt: new Date().toISOString(), data }
  store[req.user.id] = next
  saveSyncStore(store)
  res.json({ ok: true, revision: next.revision, updatedAt: next.updatedAt })
})

app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }))
if (existsSync(indexFile)) {
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(indexFile)
  })
}

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error)
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' })
  if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'Invalid JSON request body.' })
  res.status(500).json({ error: 'Unexpected server error.' })
})

const port=process.env.PORT||3001
app.listen(port,()=>console.log(`WasteLens API running on http://localhost:${port}`))
