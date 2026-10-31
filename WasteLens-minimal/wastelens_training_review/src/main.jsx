import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as mobilenet from '@tensorflow-models/mobilenet'
import * as tf from '@tensorflow/tfjs'
import { Camera, CheckCircle2, ChevronRight, CircleHelp, Cloud, Database, Download, History, ImagePlus, Leaf, LogIn, LogOut, RefreshCw, Recycle, ScanSearch, ShieldCheck, Sparkles, Trash2, Upload, User, X, Images } from 'lucide-react'
import './styles.css'
import { safeGetJSON, safeSetJSON, safeGetText, safeSetText } from './storage.js'
import { createGroupSplit } from './splits.js'
import { summarizeFieldTrials } from './fieldTrials.js'
import { validateSourceRule, isSourceRuleStale } from './localRules.js'
import { DEMO_STEPS, getDemoProgress } from './demo.js'

const CATEGORIES = {
  recycle: { name: 'Recycle', icon: Recycle, tone: 'green', note: 'Place in recycling only when your local program accepts this material.' },
  compost: { name: 'Compost', icon: Leaf, tone: 'lime', note: 'Food and certified compostable items may belong here. Check local rules.' },
  trash: { name: 'Trash', icon: Trash2, tone: 'gray', note: 'Use the trash stream when the item is not accepted elsewhere.' },
  special: { name: 'Special disposal', icon: ShieldCheck, tone: 'orange', note: 'Some items need a drop-off program instead of a normal bin.' },
  unknown: { name: 'Needs verification', icon: CircleHelp, tone: 'blue', note: 'The model is uncertain. Verify the item before disposing of it.' }
}

const LOCAL_PROFILES = {
  general: { name: 'General guidance', note: 'Generic guidance only. Recycling rules vary by community.' },
  virginia: { name: 'Virginia demo profile', note: 'Demo local profile for development. Always confirm with your actual hauler or local government.' },
  county: { name: 'Custom local profile', note: 'Use this profile to test location-specific rules before connecting a live local-rules source.' }
}

const RULES = [
  { keys: ['bottle', 'water bottle', 'plastic bottle'], type: 'recycle', material: 'PET plastic', preparation: 'Empty and rinse. Check whether your local program accepts bottles.' },
  { keys: ['can', 'tin', 'beer can', 'pop can'], type: 'recycle', material: 'Metal', preparation: 'Empty and rinse. Keep the lid attached when local guidance recommends it.' },
  { keys: ['cardboard', 'carton', 'box', 'paper'], type: 'recycle', material: 'Paper or cardboard', preparation: 'Keep it clean and dry. Flatten boxes when practical.' },
  { keys: ['banana', 'apple', 'orange', 'lemon', 'fruit'], type: 'compost', material: 'Food organics', preparation: 'Place in a compost stream if your local program accepts food scraps.' },
  { keys: ['cell phone', 'mobile phone', 'laptop', 'computer'], type: 'special', material: 'Electronic waste', preparation: 'Do not place electronics in normal recycling. Use an approved e-waste drop-off.' },
  { keys: ['battery', 'power bank'], type: 'special', material: 'Battery/electronic material', preparation: 'Use a battery or hazardous-waste collection program.' },
  { keys: ['pizza', 'plate', 'food'], type: 'trash', material: 'Food-contaminated item', preparation: 'If the item cannot be cleaned for your local recycling program, use trash or compost as appropriate.' }
]


function localGuidance(rule, region) {
  if (region === 'virginia' && rule.type === 'recycle' && rule.material === 'Paper or cardboard') {
    return { ...rule, local: 'Demo profile: paper/cardboard is commonly accepted, but acceptance depends on the local program.' }
  }
  if (region === 'virginia' && rule.type === 'special') {
    return { ...rule, local: 'Use a designated drop-off program. Do not place batteries or electronics in ordinary curbside recycling.' }
  }
  return { ...rule, local: LOCAL_PROFILES[region]?.note || LOCAL_PROFILES.general.note }
}

function App() {
  const [model, setModel] = useState(null)
  const [modelStatus, setModelStatus] = useState('Loading general vision model…')
  const [customModel, setCustomModel] = useState(null)
  const [customModelName, setCustomModelName] = useState('')
  const [customModelStatus, setCustomModelStatus] = useState('No custom model loaded')
  const customModelFilesRef = useRef(null)
  const [preview, setPreview] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [history, setHistory] = useState(() => safeGetJSON('wastelens-history', []))
  const [stats, setStats] = useState({ total: 0, recyclable: 0, verified: 0 })
  const [manualOpen, setManualOpen] = useState(false)
  const [manualChoice, setManualChoice] = useState('recycle')
  const [guideQuery, setGuideQuery] = useState('')
  const [guideCategory, setGuideCategory] = useState('all')
  const [region, setRegion] = useState(() => safeGetText('wastelens-region', 'virginia'))
  const [customRules, setCustomRules] = useState(() => safeGetJSON('wastelens-custom-rules', {}))
  const [sourceRules, setSourceRules] = useState(() => { const saved = safeGetJSON('wastelens-source-rules', []); return Array.isArray(saved) ? saved : [] })
  const [sourceRuleDraft, setSourceRuleDraft] = useState({ ruleKey: RULES[0].keys[0], type: 'recycle', sourceTitle: '', sourceUrl: '', authority: 'municipality', checkedDate: new Date().toISOString().slice(0,10), notes: '', confirmed: false })
  const [programName, setProgramName] = useState(() => safeGetText('wastelens-program-name', 'My recycling program'))
  const [contamination, setContamination] = useState({ food: 'none', liquid: 'none', grease: 'none', mixed: 'no', cleanable: 'yes' })
  const [contaminationChecked, setContaminationChecked] = useState(false)
  const [feedback, setFeedback] = useState(() => safeGetJSON('wastelens-feedback', []))
  const [fieldTrials, setFieldTrials] = useState(() => safeGetJSON('wastelens-field-trials', []))
  const [fieldContext, setFieldContext] = useState({ lighting: 'bright', background: 'simple', angle: 'front', distance: 'medium' })
  const [accountUser, setAccountUser] = useState(null)
  const [accountUsername, setAccountUsername] = useState('')
  const [accountPassword, setAccountPassword] = useState('')
  const [accountMode, setAccountMode] = useState('login')
  const [accountBusy, setAccountBusy] = useState(false)
  const [accountStatus, setAccountStatus] = useState('Cloud sync is optional. Your data stays on this device unless you sign in and sync.')
  const [syncRevision, setSyncRevision] = useState(0)
  const [syncUpdatedAt, setSyncUpdatedAt] = useState(null)
  const [demoCompleted, setDemoCompleted] = useState([])
  const [datasetSamples, setDatasetSamples] = useState([])
  const [datasetImage, setDatasetImage] = useState('')
  const [datasetImageMeta, setDatasetImageMeta] = useState(null)
  const [datasetBatch, setDatasetBatch] = useState([])
  const [datasetLabel, setDatasetLabel] = useState('recycle')
  const [datasetGroup, setDatasetGroup] = useState('')
  const [datasetConsent, setDatasetConsent] = useState(false)
  const [modelEvaluation, setModelEvaluation] = useState(() => safeGetJSON('wastelens-model-evaluation', null))
  const [modelComparisons, setModelComparisons] = useState(() => safeGetJSON('wastelens-model-comparisons', []))
  const evaluationFileRef = useRef(null)
  const comparisonFileRef = useRef(null)
  const fileRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  useEffect(() => {
    mobilenet.load({ version: 2, alpha: 1.0 }).then(m => {
      setModel(m)
      setModelStatus('General vision model ready')
    }).catch(() => setModelStatus('Vision model unavailable. Manual mode is still available.'))
    fetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'same-origin' }).then(async response => {
      if (!response.ok) return null
      return response.json()
    }).then(payload => {
      if (payload?.user) { setAccountUser(payload.user); refreshCloudRevision() }
    }).catch(() => setAccountStatus('Cloud sync is unavailable until the WasteLens API server is running. Local features remain available.'))
  }, [])

  useEffect(() => {
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Offline shell registration failed:', error))
    }
  }, [])

  useEffect(() => { safeSetJSON('wastelens-history', history) }, [history])

  useEffect(() => { safeSetText('wastelens-region', region) }, [region])
  useEffect(() => { safeSetJSON('wastelens-custom-rules', customRules) }, [customRules])
  useEffect(() => { safeSetJSON('wastelens-source-rules', sourceRules) }, [sourceRules])
  useEffect(() => { safeSetText('wastelens-program-name', programName) }, [programName])
  useEffect(() => { safeSetJSON('wastelens-feedback', feedback) }, [feedback])
  useEffect(() => { safeSetJSON('wastelens-field-trials', fieldTrials) }, [fieldTrials])
  useEffect(() => { safeSetJSON('wastelens-model-evaluation', modelEvaluation) }, [modelEvaluation])
  useEffect(() => { safeSetJSON('wastelens-model-comparisons', modelComparisons) }, [modelComparisons])
  useEffect(() => { readDataset().then(setDatasetSamples).catch(() => {}) }, [])
  useEffect(() => { if (!preview) return undefined; return () => URL.revokeObjectURL(preview) }, [preview])
  useEffect(() => () => { streamRef.current?.getTracks().forEach(track => track.stop()) }, [])

  async function accountFetch(path, method, body) {
    const response = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || 'Account request failed.')
    return payload
  }

  async function refreshCloudRevision() {
    try {
      const cloud = await accountFetch('/api/sync', 'GET')
      setSyncRevision(cloud.revision || 0)
      setSyncUpdatedAt(cloud.updatedAt || null)
      setAccountStatus(cloud.revision ? `Cloud copy found · revision ${cloud.revision}. Choose whether to load it or upload this device.` : 'Account ready. No cloud backup exists yet.')
    } catch (error) { setAccountStatus(error.message) }
  }

  async function submitAccount() {
    setAccountBusy(true)
    try {
      const path = accountMode === 'register' ? '/api/auth/register' : '/api/auth/login'
      const payload = await accountFetch(path, 'POST', { username: accountUsername, password: accountPassword })
      setAccountUser(payload.user)
      setAccountPassword('')
      setAccountStatus('Signed in. Checking your cloud copy…')
      await refreshCloudRevision()
    } catch (error) { setAccountStatus(error.message) }
    finally { setAccountBusy(false) }
  }

  async function signOut() {
    setAccountBusy(true)
    try { await accountFetch('/api/auth/logout', 'POST', {}); setAccountUser(null); setSyncRevision(0); setSyncUpdatedAt(null); setAccountStatus('Signed out. Local data remains on this device.') }
    catch (error) { setAccountStatus(error.message) }
    finally { setAccountBusy(false) }
  }

  async function loadCloudCopy() {
    setAccountBusy(true)
    try {
      const cloud = await accountFetch('/api/sync', 'GET')
      const data = cloud.data || {}
      setHistory(Array.isArray(data.history) ? data.history : [])
      setRegion(data.region || 'virginia')
      setCustomRules(data.customRules && typeof data.customRules === 'object' ? data.customRules : {})
      setSourceRules(Array.isArray(data.sourceRules) ? data.sourceRules : [])
      setProgramName(data.programName || 'My recycling program')
      setFieldTrials(Array.isArray(data.fieldTrials) ? data.fieldTrials : [])
      setFeedback(Array.isArray(data.feedback) ? data.feedback : [])
      setModelEvaluation(data.modelEvaluation || null)
      setModelComparisons(Array.isArray(data.modelComparisons) ? data.modelComparisons : [])
      setSyncRevision(cloud.revision || 0)
      setSyncUpdatedAt(cloud.updatedAt || null)
      setAccountStatus(`Loaded cloud copy revision ${cloud.revision}. Images in the local dataset are not included in cloud sync.`)
    } catch (error) { setAccountStatus(error.message) }
    finally { setAccountBusy(false) }
  }

  async function syncThisDevice() {
    if (!accountUser) return
    setAccountBusy(true)
    const data = { history, region, customRules, sourceRules, programName, fieldTrials, feedback, modelEvaluation, modelComparisons }
    try {
      const result = await accountFetch('/api/sync', 'PUT', { expectedRevision: syncRevision, data })
      setSyncRevision(result.revision)
      setSyncUpdatedAt(result.updatedAt)
      setAccountStatus(`This device was synced to cloud revision ${result.revision}. Photos are not uploaded.`)
    } catch (error) { setAccountStatus(error.message) }
    finally { setAccountBusy(false) }
  }

  function saveLocalRule(ruleKey, type) {
    setCustomRules(current => ({ ...current, [ruleKey]: type }))
  }

  function resetLocalRules() {
    setCustomRules({})
    setSourceRules([])
    setProgramName('My recycling program')
  }

  function addSourceRule() {
    try {
      const normalized = validateSourceRule(sourceRuleDraft, RULES.map(rule => rule.keys[0]))
      setSourceRules(rows => [normalized, ...rows.filter(row => row.ruleKey !== normalized.ruleKey)])
      setSourceRuleDraft(draft => ({ ...draft, sourceTitle: '', sourceUrl: '', notes: '', confirmed: false, checkedDate: new Date().toISOString().slice(0,10) }))
    } catch (error) { alert(error.message || 'Could not save this local source rule.') }
  }

  function removeSourceRule(ruleKey) {
    setSourceRules(rows => rows.filter(row => row.ruleKey !== ruleKey))
  }

  function exportLocalRulebook() {
    downloadFile('wastelens-local-rulebook.json', JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), programName, note: 'Source citations and rule selections were entered and reviewed by the user. WasteLens does not independently authenticate these sources.', sourceRules, customRules }, null, 2), 'application/json')
  }

  function effectiveRule(rule) {
    const sourceRule = region === 'county' ? sourceRules.find(item => item.ruleKey === rule.keys[0]) : null
    if (sourceRule) {
      let safeUrl = false
      try { safeUrl = new URL(sourceRule.sourceUrl).protocol === 'https:' } catch { safeUrl = false }
      if (safeUrl && CATEGORIES[sourceRule.type]) {
        const stale = isSourceRuleStale(sourceRule)
        return { ...rule, type: sourceRule.type, local: `${stale ? 'Source needs rechecking' : 'User-reviewed source'}: ${sourceRule.sourceTitle} · checked ${sourceRule.checkedDate}. ${sourceRule.notes || ''}`, sourceRule, sourceStale: stale }
      }
    }
    const override = region === 'county' ? customRules[rule.keys[0]] : null
    return override ? { ...rule, type: override, local: `Your custom rule: ${CATEGORIES[override]?.name || 'Needs verification'}.` } : localGuidance(rule, region)
  }

  function addHistory(item) {
    const next = [item, ...history].slice(0, 20)
    setHistory(next)
    fetch('/api/classifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) }).catch(() => {})
    setStats(s => ({ ...s, total: s.total + 1, recyclable: s.recyclable + (item.type === 'recycle' ? 1 : 0), verified: s.verified + (item.verified ? 1 : 0) }))
  }

  async function classify(file, captureMethod = 'upload') {
    if (!file) return
    if (!file.type?.startsWith('image/')) { alert('Please select an image file.'); return }
    if (file.size > 12 * 1024 * 1024) { alert('Please choose an image smaller than 12 MB.'); return }
    setBusy(true)
    setResult(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    try {
      const img = new Image()
      img.src = url
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject })
      let predictions = []
      let label = ''
      let confidence = 0
      let type = 'unknown'
      let material = 'Not confidently identified'
      let preparation = 'Use manual verification before disposal.'
      let alternatives = []
      let source = 'MobileNet general-purpose model'
      if (customModel) {
        const pixels = tf.browser.fromPixels(img).resizeBilinear([224, 224]).toFloat().expandDims(0)
        const output = customModel.predict(pixels)
        const values = Array.from(await output.data())
        pixels.dispose(); output.dispose()
        const labels = ['recycle', 'compost', 'trash', 'special']
        const ranked = values.map((probability, index) => ({ type: labels[index], probability })).sort((a,b) => b.probability-a.probability)
        const top = ranked[0]
        confidence = Math.round((top?.probability || 0) * 100)
        type = confidence >= 40 ? top.type : 'unknown'
        label = `Waste-specific model: ${top?.type || 'unknown'}`
        material = 'Predicted disposal category; object material not separately identified.'
        preparation = 'Confirm the item material and local acceptance rules before disposal.'
        alternatives = ranked.slice(1, 4).map(x => ({ className: x.type, probability: x.probability }))
        source = customModelName || 'Custom WasteLens model'
      } else {
        if (model) predictions = await model.classify(img, 5)
        const top = predictions[0]
        label = top?.className || 'Unknown object'
        const rule = RULES.find(r => r.keys.some(k => label.toLowerCase().includes(k)))
        confidence = top ? Math.round(top.probability * 100) : 0
        type = rule && confidence >= 35 ? rule.type : 'unknown'
        material = rule?.material || 'Not confidently identified'
        preparation = rule?.preparation || 'Use manual verification before disposal.'
        alternatives = predictions.slice(1, 4)
      }
      const category = CATEGORIES[type]
      const item = { id: crypto.randomUUID(), label, confidence, type, material, preparation, verified: false, modelSource: source, createdAt: new Date().toISOString() }
      setResult({ ...item, category, alternatives })
      if (source !== 'MobileNet general-purpose model' || predictions.length) {
        setFieldTrials(rows => [{ id: item.id, modelSource: source, predictedLabel: label, predictedType: type, confidence, humanType: null, outcome: 'pending', context: { ...fieldContext, captureMethod }, createdAt: item.createdAt }, ...rows].slice(0, 1000))
      }
      addHistory(item)
    } catch {
      setResult({ type: 'unknown', label: 'Could not analyze image', confidence: 0, material: 'Unknown', preparation: 'Try another photo or use manual verification.', category: CATEGORIES.unknown, alternatives: [] })
    } finally { setBusy(false) }
  }

  async function loadCustomModel(files) {
    if (!files?.length) return
    const selected = Array.from(files)
    const json = selected.find(file => file.name.endsWith('.json'))
    if (!json) { setCustomModelStatus('Select model.json and all referenced weight files.'); return }
    try {
      setCustomModelStatus('Loading custom model…')
      const loaded = await tf.loadLayersModel(tf.io.browserFiles(selected))
      const shape = loaded.outputs?.[0]?.shape || []
      if (shape[shape.length - 1] !== 4) { loaded.dispose(); throw new Error('Expected exactly four output classes: recycle, compost, trash, special.') }
      customModel?.dispose()
      setCustomModel(loaded)
      setCustomModelName(json.name.replace(/\.json$/i, ''))
      setCustomModelStatus('Custom waste model ready · 4 output categories')
    } catch (error) {
      setCustomModelStatus(error.message || 'Could not load this model. Check that all weight files are selected.')
    }
  }

  function unloadCustomModel() {
    customModel?.dispose()
    setCustomModel(null)
    setCustomModelName('')
    setCustomModelStatus('No custom model loaded. General MobileNet will be used.')
    if (customModelFilesRef.current) customModelFilesRef.current.value = ''
  }

  function onFile(e) { classify(e.target.files?.[0]) }

  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) { alert('Camera access is not supported here. You can upload a photo instead.'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      setCameraOpen(true)
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream }, 50)
    } catch { alert('Camera access was unavailable. You can upload a photo instead.') }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraOpen(false)
  }

  function capture() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    if (!video.videoWidth || !video.videoHeight) { alert('The camera is not ready yet. Try again in a moment.'); return }
    const context = canvas.getContext('2d')
    if (!context) { alert('Could not capture from this camera. Upload a photo instead.'); return }
    context.drawImage(video, 0, 0)
    canvas.toBlob(blob => { closeCamera(); if (blob) classify(new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' }), 'camera'); else alert('Could not create the camera image. Try uploading a photo.') }, 'image/jpeg', .92)
  }

  const demoProgress = getDemoProgress(demoCompleted)

  const guideItems = RULES.map(effectiveRule).filter(rule => {
    const matchesQuery = !guideQuery || [...rule.keys, rule.material, rule.preparation].join(' ').toLowerCase().includes(guideQuery.toLowerCase())
    const matchesCategory = guideCategory === 'all' || rule.type === guideCategory
    return matchesQuery && matchesCategory
  })

  const datasetCounts = Object.fromEntries(Object.keys(CATEGORIES).filter(k => k !== 'unknown').map(k => [k, datasetSamples.filter(sample => sample.label === k).length]))
  const duplicateGroups = (() => {
    const seen = new Map()
    for (const sample of datasetSamples) {
      const key = sample.imageData
      if (!seen.has(key)) seen.set(key, [])
      seen.get(key).push(sample)
    }
    return [...seen.values()].filter(group => group.length > 1)
  })()
  const nonzeroCounts = Object.values(datasetCounts).filter(count => count > 0)
  const balanceRatio = nonzeroCounts.length > 1 ? Math.min(...nonzeroCounts) / Math.max(...nonzeroCounts) : 0
  const representedClasses = nonzeroCounts.length
  const splitManifest = createGroupSplit(datasetSamples)
  const uniqueCaptureGroups = new Set(datasetSamples.map(sample => String(sample.groupId || sample.id))).size
  const lowResolutionSamples = datasetSamples.filter(sample => sample.width && sample.height && (sample.width < 224 || sample.height < 224)).length
  const categoryGroupCounts = Object.fromEntries(Object.keys(CATEGORIES).filter(key => key !== 'unknown').map(label => [label, new Set(datasetSamples.filter(sample => sample.label === label).map(sample => String(sample.groupId || sample.id))).size]))
  const conflictingGroupIds = new Set(splitManifest.filter(row => row.groupLabelConflict).map(row => row.groupId))
  const trainingReady = representedClasses === 4 && Object.values(categoryGroupCounts).every(count => count >= 3) && conflictingGroupIds.size === 0
  const splitCounts = Object.fromEntries(['train','validation','test'].map(split => [split, splitManifest.filter(row => row.split === split).length]))

  function datasetDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('wastelens-dataset', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('samples', { keyPath: 'id' })
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async function readDataset() {
    const db = await datasetDB()
    return new Promise((resolve, reject) => {
      const request = db.transaction('samples', 'readonly').objectStore('samples').getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  }

  async function saveDatasetSample() {
    if (!datasetConsent || !datasetImage) return
    if (datasetImage.length > 16 * 1024 * 1024) { alert('This image is too large for the local dataset. Choose a smaller image.'); return }
    const sampleId = crypto.randomUUID()
    const sample = { id: sampleId, imageData: datasetImage, label: datasetLabel, groupId: datasetGroup.trim().slice(0, 60) || sampleId, ...(datasetImageMeta || {}), createdAt: new Date().toISOString(), consent: true, source: 'user-curated' }
    const db = await datasetDB()
    await new Promise((resolve, reject) => {
      const request = db.transaction('samples', 'readwrite').objectStore('samples').add(sample)
      request.onsuccess = resolve
      request.onerror = () => reject(request.error)
    })
    setDatasetSamples(rows => [sample, ...rows])
    setDatasetImage('')
    setDatasetImageMeta(null)
    setDatasetGroup('')
    setDatasetConsent(false)
  }

  async function removeDatasetSample(id) {
    const db = await datasetDB()
    await new Promise((resolve, reject) => {
      const request = db.transaction('samples', 'readwrite').objectStore('samples').delete(id)
      request.onsuccess = resolve
      request.onerror = () => reject(request.error)
    })
    setDatasetSamples(rows => rows.filter(row => row.id !== id))
  }

  async function updateDatasetGroup(id, groupId) {
    const normalized = String(groupId || '').trim().slice(0, 60) || id
    const current = datasetSamples.find(sample => sample.id === id)
    if (!current) return
    const updated = { ...current, groupId: normalized }
    const db = await datasetDB()
    await new Promise((resolve, reject) => {
      const request = db.transaction('samples', 'readwrite').objectStore('samples').put(updated)
      request.onsuccess = resolve
      request.onerror = () => reject(request.error)
    })
    setDatasetSamples(rows => rows.map(sample => sample.id === id ? updated : sample))
  }

  function onDatasetImage(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setDatasetImage('')
    setDatasetImageMeta(null)
    if (!file.type.startsWith('image/')) { alert('Please choose an image file.'); event.target.value = ''; return }
    if (file.size > 12 * 1024 * 1024) { alert('Please choose an image smaller than 12 MB.'); event.target.value = ''; return }
    readImageFile(file).then(image => {
      if (image.width < 96 || image.height < 96) { alert('Choose an image at least 96 × 96 pixels.'); return }
      setDatasetImage(image.imageData)
      setDatasetImageMeta({ width: image.width, height: image.height, mimeType: image.mimeType, bytes: image.bytes, fileName: image.fileName })
    }).catch(error => alert(error.message || 'Could not load this image.'))
    event.target.value = ''
  }

  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
      reader.onload = () => {
        const imageData = String(reader.result || '')
        const image = new Image()
        image.onload = () => resolve({ fileName: file.name, imageData, width: image.naturalWidth, height: image.naturalHeight, mimeType: file.type, bytes: file.size })
        image.onerror = () => reject(new Error(`${file.name} is not a supported image.`))
        image.src = imageData
      }
      reader.readAsDataURL(file)
    })
  }

  async function onDatasetBatch(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    if (files.length > 10) { alert('Choose no more than 10 images at once.'); return }
    const invalid = files.find(file => !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024)
    if (invalid) { alert(`${invalid.name} is not supported or exceeds the 5 MB per-image limit.`); return }
    try {
      const loaded = await Promise.all(files.map(readImageFile))
      const tooSmall = loaded.filter(image => image.width < 96 || image.height < 96)
      if (tooSmall.length) { alert(`These images are smaller than 96 × 96 pixels: ${tooSmall.map(image=>image.fileName).join(', ')}`); return }
      setDatasetBatch(loaded)
    } catch (error) {
      alert(error.message || 'One or more images could not be loaded.')
    }
  }

  async function saveDatasetBatch() {
    if (!datasetConsent || !datasetBatch.length) return
    const sharedGroup = datasetGroup.trim().slice(0, 60)
    const samples = datasetBatch.map(image => {
      const id = crypto.randomUUID()
      return { id, imageData: image.imageData, label: datasetLabel, groupId: sharedGroup || id, fileName: image.fileName, width: image.width, height: image.height, mimeType: image.mimeType, bytes: image.bytes, createdAt: new Date().toISOString(), consent: true, source: 'user-batch-curated' }
    })
    try {
      const db = await datasetDB()
      await new Promise((resolve, reject) => {
        const tx = db.transaction('samples', 'readwrite')
        const store = tx.objectStore('samples')
        samples.forEach(sample => store.add(sample))
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error || new Error('Dataset save was cancelled.'))
      })
      setDatasetSamples(rows => [...samples, ...rows])
      setDatasetBatch([])
      setDatasetConsent(false)
      setDatasetGroup('')
    } catch (error) {
      alert(error.message || 'Could not save the image batch. Check available browser storage.')
    }
  }

  function exportDataset() {
    const payload = { schemaVersion: 2, exportedAt: new Date().toISOString(), purpose: 'User-curated waste image samples for review and future model development.', warning: 'Labels are user-provided and have not been independently verified. Review quality, remove duplicates, and split data by source before any training.', samples: datasetSamples }
    downloadFile('wastelens-curated-image-dataset.json', JSON.stringify(payload), 'application/json')
  }

  function exportSplitManifest() {
    const manifest = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      strategy: 'Deterministic class-stratified group-aware split: all images sharing groupId are assigned to one split. Within each class, independent groups are allocated approximately 70% train, 15% validation, 15% test when at least 3 groups exist. Classes with fewer than 3 groups remain in train. Groups carrying conflicting labels are kept in train and flagged.',
      records: splitManifest,
      uniqueGroups: uniqueCaptureGroups,
      categoryGroupCounts,
      conflictingGroupIds: [...conflictingGroupIds],
      limitations: ['Group separation depends on the user assigning the same groupId to every photo of the same physical object or capture session.', 'This grouping cannot detect visually similar images if they were assigned different group IDs.', 'Group-level splitting does not guarantee class balance; inspect categoryGroupCounts and collect more independent groups for sparse classes.', 'With fewer than 3 unique groups, all records remain in training and there is no held-out validation/test set.', 'Review labels independently. This manifest does not train or evaluate a model.']
    }
    downloadFile('wastelens-training-split-manifest.json', JSON.stringify(manifest, null, 2), 'application/json')
  }

  function exportDatasetAudit() {
    const audit = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      totalSamples: datasetSamples.length,
      lowResolutionSamples,
      categoryCounts: datasetCounts,
      representedCategories: representedClasses,
      duplicateGroups: duplicateGroups.map(group => ({ sampleIds: group.map(item => item.id), labels: [...new Set(group.map(item => item.label))] })),
      balanceRatio: Number(balanceRatio.toFixed(3)),
      limitations: ['Exact duplicate check compares identical stored image data only; visually similar images may not be detected.', 'Category labels are user-provided and not independently verified.', 'This audit does not train or evaluate a machine-learning model.']
    }
    downloadFile('wastelens-dataset-audit.json', JSON.stringify(audit, null, 2), 'application/json')
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importModelEvaluation(file) {
    if (!file) return
    try {
      const report = JSON.parse(await file.text())
      if (report.schemaVersion !== 1 || !Array.isArray(report.classes) || !report.metrics || !report.metrics.classificationReport || !Array.isArray(report.metrics.confusionMatrix)) {
        throw new Error('This file is not a supported WasteLens evaluation report.')
      }
      if (report.classes.length !== report.metrics.confusionMatrix.length || report.metrics.confusionMatrix.some(row => !Array.isArray(row) || row.length !== report.classes.length)) {
        throw new Error('The confusion matrix dimensions do not match the category list.')
      }
      setModelEvaluation(report)
    } catch (error) {
      alert(error.message || 'Could not read this evaluation report.')
    } finally {
      if (evaluationFileRef.current) evaluationFileRef.current.value = ''
    }
  }

  function validEvaluationReport(report) {
    return report?.schemaVersion === 1 && Array.isArray(report.classes) && report.metrics && report.metrics.classificationReport && Array.isArray(report.metrics.confusionMatrix) && report.classes.length === report.metrics.confusionMatrix.length && !report.metrics.confusionMatrix.some(row => !Array.isArray(row) || row.length !== report.classes.length)
  }

  async function importComparisonReports(files) {
    if (!files?.length) return
    try {
      const imported = []
      for (const file of Array.from(files)) {
        const report = JSON.parse(await file.text())
        if (!validEvaluationReport(report)) throw new Error(`${file.name} is not a valid WasteLens evaluation report.`)
        const key = `${report.modelName || file.name}-${report.generatedAt || ''}`
        if (!modelComparisons.some(item => item.key === key) && !imported.some(item => item.key === key)) imported.push({ key, fileName: file.name, report })
      }
      setModelComparisons(current => [...current, ...imported].slice(-8))
      if (!imported.length) alert('Those reports are already in the comparison list.')
    } catch (error) {
      alert(error.message || 'Could not import the comparison reports.')
    } finally {
      if (comparisonFileRef.current) comparisonFileRef.current.value = ''
    }
  }

  function comparisonSummary(report) {
    const macro = report.metrics.classificationReport?.['macro avg'] || {}
    return { accuracy: Number(report.metrics.testAccuracy || 0), loss: Number(report.metrics.testLoss || 0), f1: Number(macro['f1-score'] || 0), samples: Number(report.metrics.testSampleCount || 0) }
  }

  function exportComparison() {
    const payload = { schemaVersion: 1, exportedAt: new Date().toISOString(), warning: 'Reports are only directly comparable when evaluated on the same untouched test dataset with identical labels and split.', reports: modelComparisons.map(item => ({ fileName: item.fileName, report: item.report })) }
    downloadFile('wastelens-model-comparison.json', JSON.stringify(payload, null, 2), 'application/json')
  }

  function exportFieldTrials() {
    const summary = summarizeFieldTrials(fieldTrials)
    downloadFile('wastelens-field-trial-report.json', JSON.stringify({ schemaVersion: 2, exportedAt: new Date().toISOString(), methodology: 'Observational field pilot. User-selected test conditions are self-reported; only human-reviewed records are included in correction-rate calculations.', summary, records: fieldTrials, limitations: ['Only manually verified predictions are counted as confirmed or corrected.', 'Unverified predictions are not ground truth.', 'Results reflect this browser user’s selected examples and are not a representative benchmark.'] }, null, 2), 'application/json')
  }

  function exportFieldTrialsCsv() {
    const columns = ['modelSource','predictedLabel','predictedType','confidence','humanType','outcome','lighting','background','angle','distance','captureMethod','createdAt','verifiedAt']
    const quote = value => '"' + String(value ?? '').replaceAll('"', '""') + '"'
    downloadFile('wastelens-field-trials.csv', [columns.join(','), ...fieldTrials.map(row => columns.map(key => quote(['lighting','background','angle','distance','captureMethod'].includes(key) ? row.context?.[key] : row[key])).join(','))].join('\n'), 'text/csv;charset=utf-8')
  }


  function exportFeedback() {
    downloadFile('wastelens-correction-feedback.json', JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), note: 'Metadata-only correction log; contains no image files.', records: feedback }, null, 2), 'application/json')
  }

  function exportFeedbackCsv() {
    const columns = ['predictedLabel','predictedType','correctedType','confidence','source','createdAt']
    const quote = value => '"' + String(value ?? '').replaceAll('"', '""') + '"'
    const rows = [columns.join(','), ...feedback.map(row => columns.map(key => quote(row[key])).join(','))]
    downloadFile('wastelens-correction-feedback.csv', rows.join('\n'), 'text/csv;charset=utf-8')
  }


  function exportTrainingKit() {
    const rows = splitManifest.map(row => ({ ...row, sample: datasetSamples.find(sample => sample.id === row.id) })).filter(row => row.sample)
    const packageData = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      project: 'WasteLens V18 robust training kit',
      warning: 'Human labels are not ground truth until independently reviewed. All photos sharing a groupId are kept in one split, but user-entered group IDs must be accurate to prevent leakage.',
      splitStrategy: 'group-aware object/capture-session split',
      categories: Object.keys(CATEGORIES).filter(key => key !== 'unknown'),
      samples: rows.map(row => ({ id: row.id, label: row.label, groupId: row.groupId, split: row.split, createdAt: row.createdAt, imageData: row.sample.imageData }))
    }
    downloadFile('wastelens-training-dataset.json', JSON.stringify(packageData), 'application/json')
    downloadFile('train_wastelens.py', trainingScript, 'text/x-python;charset=utf-8')
    downloadFile('WASTELENS_TRAINING_README.md', trainingReadme, 'text/markdown;charset=utf-8')
  }

  const trainingReadme = [
    '# WasteLens V18 Training Kit',
    '',
    '## Files',
    '- `wastelens-training-dataset.json`: exported labeled images and their train/validation/test assignments.',
    '- `train_wastelens.py`: local TensorFlow/Keras transfer-learning starter.',
    '',
    '## Requirements',
    'Python 3.10 or 3.11 is recommended. Install dependencies:',
    '',
    '```bash',
    'python -m pip install tensorflow pillow numpy scikit-learn matplotlib tensorflowjs',
    '```',
    '',
    'Put both downloaded files in the same folder, then run:',
    '',
    '```bash',
    'python train_wastelens.py wastelens-training-dataset.json --fine-tune-epochs 5 --fine-tune-layers 30',
    '```',
    '',
    'The script validates group isolation and consistent labels within each group, verifies and normalizes image files, extracts images into train/validation/test folders, trains a MobileNetV2 transfer-learning classifier with class weights, augmentation, early stopping, and optional fine-tuning of the final MobileNetV2 layers, prints held-out test metrics, saves a Keras model and training history, writes a confusion-matrix image, and exports wastelens_evaluation.json for the in-app Evaluation Center. The first run may download ImageNet weights and needs internet access.',
    '',
    'To create a browser-loadable TensorFlow.js model, convert the Keras model after training:',
    '',
    '```bash',
    'tensorflowjs_converter --input_format=keras wastelens_mobilenetv2.keras wastelens_tfjs_model',
    '```',
    '',
    'In WasteLens V13, choose `model.json` and every `.bin` shard from `wastelens_tfjs_model` together. The model must accept 224×224×3 RGB pixel input and return four softmax outputs ordered exactly: `recycle`, `compost`, `trash`, `special`. The provided training script uses this order.',
    '',
    '## Important limitations',
    '- This is a starter training workflow, not a validated production model.',
    '- Labels are user supplied and need independent review.',
    '- Group-aware, class-stratified splitting keeps identical group IDs together. The script rejects group IDs that cross splits or contain conflicting labels. This depends on consistently assigning the same group ID to every image of the same object/session.',
    '- Small datasets can produce meaningless metrics. Collect varied examples and keep a truly independent test set. The training pipeline uses class weights and early stopping; it does not make a small or biased dataset representative.',
    '- The model predicts the four WasteLens disposal categories; it does not determine whether a local municipality accepts a particular item. Import wastelens_evaluation.json into the Evaluation Center to review metrics and the confusion matrix.'
  ].join('\n')

  const trainingScript = String.raw`#!/usr/bin/env python3
"""WasteLens V18 robust image validation and fine-tuning pipeline. See WASTELENS_TRAINING_README.md."""
import argparse, base64, json, re, random, io
from pathlib import Path
from collections import Counter
from PIL import Image

import numpy as np
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
from sklearn.metrics import classification_report, confusion_matrix, ConfusionMatrixDisplay
import matplotlib.pyplot as plt

CLASSES = ["recycle", "compost", "trash", "special"]
SPLITS = ["train", "validation", "test"]

def decode_data_uri(data_uri):
    match = re.match(r"^data:image/[^;]+;base64,(.+)$", data_uri or "", re.DOTALL)
    if not match:
        raise ValueError("An image sample did not contain a supported base64 data URI.")
    return base64.b64decode(match.group(1))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", nargs="?", default="wastelens-training-dataset.json")
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--image-size", type=int, default=224)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--patience", type=int, default=3)
    parser.add_argument("--fine-tune-epochs", type=int, default=5)
    parser.add_argument("--fine-tune-layers", type=int, default=30)
    args = parser.parse_args()
    if args.epochs < 1 or args.batch_size < 1 or args.image_size != 224 or args.patience < 1 or args.fine_tune_epochs < 0 or args.fine_tune_layers < 0:
        raise SystemExit("epochs and batch-size must be positive; image-size must be 224 for scanner compatibility; fine-tune options cannot be negative.")
    random.seed(args.seed)
    np.random.seed(args.seed)
    tf.random.set_seed(args.seed)
    payload = json.loads(Path(args.dataset).read_text(encoding="utf-8"))
    samples = payload.get("samples", [])
    if not samples:
        raise SystemExit("No labeled image samples were found in the dataset export.")

    group_splits = {}
    group_labels = {}
    for sample in samples:
        group_id = str(sample.get("groupId") or sample.get("id", ""))
        split = sample.get("split")
        label = sample.get("label")
        if not group_id or split not in SPLITS:
            raise SystemExit("Every sample must have a groupId (or id) and a valid split.")
        previous = group_splits.setdefault(group_id, split)
        if previous != split:
            raise SystemExit(f"Data leakage detected: group {group_id!r} appears in both {previous!r} and {split!r}.")
        previous_label = group_labels.setdefault(group_id, label)
        if previous_label != label:
            raise SystemExit(f"Conflicting labels detected within group {group_id!r}. Review the labels or assign separate object IDs.")

    root = Path("wastelens_prepared")
    for split in SPLITS:
        for label in CLASSES:
            (root / split / label).mkdir(parents=True, exist_ok=True)
    written = 0
    for sample in samples:
        label, split = sample.get("label"), sample.get("split")
        if label not in CLASSES or split not in SPLITS:
            continue
        image_bytes = decode_data_uri(sample.get("imageData"))
        filename = re.sub(r"[^a-zA-Z0-9_-]", "", str(sample.get("id", written))) or str(written)
        destination = root / split / label / (filename + ".jpg")
        try:
            with Image.open(io.BytesIO(image_bytes)) as source_image:
                source_image.verify()
            with Image.open(io.BytesIO(image_bytes)) as source_image:
                if source_image.width < 96 or source_image.height < 96:
                    raise ValueError(f"Image {filename} is smaller than 96 x 96 pixels.")
                source_image.convert("RGB").save(destination, format="JPEG", quality=95)
        except Exception as error:
            raise SystemExit(f"Invalid or unsupported image {filename}: {error}")
        written += 1
    print(f"Prepared {written} images under {root.resolve()}")
    counts = {split: Counter(p.parent.name for p in (root / split).glob("*/*") if p.is_file()) for split in SPLITS}
    for split in SPLITS:
        print(f"{split}: {dict(counts[split])}")
    split_files = {name: [p for p in (root / name).glob("*/*") if p.is_file()] for name in SPLITS}
    train_classes = {p.parent.name for p in split_files["train"]}
    missing_train_classes = [name for name in CLASSES if name not in train_classes]
    if missing_train_classes:
        raise SystemExit("The four-class model needs training examples for every class. Missing: " + ", ".join(missing_train_classes) + ". Add independently grouped examples and export a new training kit.")
    missing_splits = [name for name in SPLITS if not split_files[name]]
    if missing_splits:
        raise SystemExit("The " + ", ".join(missing_splits) + " split is empty. Add more independent object/session groups before training.")
    for split in ("validation", "test"):
        absent = [name for name in CLASSES if not any(path.parent.name == name for path in split_files[split])]
        if absent:
            print(f"WARNING: {split} has no examples for: {', '.join(absent)}. Per-class metrics for these categories will not be reliable.")
    print(f"Unique object/session groups: {len(group_splits)}")

    def load_split(name, shuffle):
        return keras.utils.image_dataset_from_directory(
            root / name, class_names=CLASSES, label_mode="int", image_size=(args.image_size, args.image_size),
            batch_size=args.batch_size, shuffle=shuffle, seed=42
        )
    train_ds = load_split("train", True)
    val_ds = load_split("validation", False)
    test_ds = load_split("test", False)
    autotune = tf.data.AUTOTUNE
    # image_dataset_from_directory yields pixel values in [0, 255]. Keep them raw
    # here because the model graph contains the single MobileNetV2 preprocessing layer.
    train_ds = train_ds.prefetch(autotune)
    val_ds = val_ds.prefetch(autotune)
    test_ds = test_ds.prefetch(autotune)

    base = keras.applications.MobileNetV2(input_shape=(args.image_size, args.image_size, 3), include_top=False, weights="imagenet")
    base.trainable = False
    inputs = keras.Input(shape=(args.image_size, args.image_size, 3))
    x = layers.RandomFlip("horizontal")(inputs)
    x = layers.RandomRotation(0.08)(x)
    x = layers.RandomContrast(0.15)(x)
    x = layers.RandomZoom(0.10)(x)
    x = layers.RandomTranslation(0.08, 0.08)(x)
    x = tf.keras.applications.mobilenet_v2.preprocess_input(x)
    x = base(x, training=False)
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.Dropout(0.25)(x)
    outputs = layers.Dense(len(CLASSES), activation="softmax")(x)
    model = keras.Model(inputs, outputs)
    model.compile(optimizer=keras.optimizers.Adam(1e-3), loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    train_counts = Counter(path.parent.name for path in split_files["train"])
    total_train = sum(train_counts.values())
    class_weights = {index: total_train / (len(CLASSES) * train_counts[name]) for index, name in enumerate(CLASSES) if train_counts.get(name, 0)}
    callbacks = [
        keras.callbacks.EarlyStopping(monitor="val_loss", patience=args.patience, restore_best_weights=True),
        keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=max(1, args.patience // 2), min_lr=1e-6)
    ]
    head_history = model.fit(train_ds, validation_data=val_ds, epochs=args.epochs, class_weight=class_weights, callbacks=callbacks)
    fine_tune_history = None
    if args.fine_tune_epochs > 0 and args.fine_tune_layers > 0:
        base.trainable = True
        fine_tune_at = max(0, len(base.layers) - args.fine_tune_layers)
        for layer in base.layers[:fine_tune_at]:
            layer.trainable = False
        for layer in base.layers:
            if isinstance(layer, layers.BatchNormalization):
                layer.trainable = False
        model.compile(optimizer=keras.optimizers.Adam(1e-5), loss="sparse_categorical_crossentropy", metrics=["accuracy"])
        fine_callbacks = [keras.callbacks.EarlyStopping(monitor="val_loss", patience=args.patience, restore_best_weights=True), keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=max(1, args.patience // 2), min_lr=1e-7)]
        fine_tune_history = model.fit(train_ds, validation_data=val_ds, epochs=args.fine_tune_epochs, class_weight=class_weights, callbacks=fine_callbacks)
    training_history = {"head_training": {key: [float(v) for v in values] for key, values in head_history.history.items()}, "fine_tuning": {key: [float(v) for v in values] for key, values in fine_tune_history.history.items()} if fine_tune_history else None}
    Path("wastelens_training_history.json").write_text(json.dumps(training_history, indent=2), encoding="utf-8")

    loss, accuracy = model.evaluate(test_ds, verbose=0)
    print(f"Held-out test loss: {loss:.4f}; accuracy: {accuracy:.4f}")
    y_true, y_pred = [], []
    for images, labels in test_ds:
        probabilities = model.predict(images, verbose=0)
        y_true.extend(labels.numpy().tolist())
        y_pred.extend(np.argmax(probabilities, axis=1).tolist())
    print(classification_report(y_true, y_pred, labels=list(range(len(CLASSES))), target_names=CLASSES, zero_division=0))
    ConfusionMatrixDisplay(confusion_matrix(y_true, y_pred, labels=list(range(len(CLASSES)))), display_labels=CLASSES).plot(xticks_rotation=35)
    plt.tight_layout()
    plt.savefig("wastelens_confusion_matrix.png", dpi=160)
    model.save("wastelens_mobilenetv2.keras")
    report = classification_report(y_true, y_pred, labels=list(range(len(CLASSES))), target_names=CLASSES, zero_division=0, output_dict=True)
    evaluation = {
        "schemaVersion": 1,
        "modelName": "WasteLens MobileNetV2 transfer-learning starter",
        "generatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "classes": CLASSES,
        "metrics": {
            "testLoss": float(loss),
            "testAccuracy": float(accuracy),
            "classificationReport": report,
            "confusionMatrix": confusion_matrix(y_true, y_pred, labels=list(range(len(CLASSES)))).tolist(),
            "testSampleCount": len(y_true),
            "trainSampleCount": len(split_files["train"]),
            "validationSampleCount": len(split_files["validation"]),
            "uniqueGroupCount": len(group_splits),
            "seed": args.seed,
            "fineTuneLayers": args.fine_tune_layers,
            "fineTuneEpochsRequested": args.fine_tune_epochs,
            "fineTuneEpochsCompleted": len(fine_tune_history.history.get("loss", [])) if fine_tune_history else 0,
            "headEpochsCompleted": len(head_history.history.get("loss", [])),
            "inputSize": [args.image_size, args.image_size, 3]
        },
        "splitStrategy": payload.get("splitStrategy", "group-aware manifest; group IDs validated by training script"),
        "limitations": ["Metrics apply only to this exported test split.", "Group isolation is only as reliable as the user-provided group IDs; visually similar items assigned different IDs may still leak.", "Human labels may contain errors and the dataset may not represent real-world waste.", "Classes absent from validation/test have unreliable per-class metrics.", "This model does not determine local recycling acceptance rules."]
    }
    Path("wastelens_evaluation.json").write_text(json.dumps(evaluation, indent=2), encoding="utf-8")
    print("Saved wastelens_mobilenetv2.keras, wastelens_confusion_matrix.png, wastelens_training_history.json, and wastelens_evaluation.json")
    print("Do not treat these metrics as reliable if labels are unreviewed, splits leak related photos, or classes are underrepresented.")

if __name__ == "__main__":
    main()
`;

  function verify(type) {
    if (!result) return
    const rule = CATEGORIES[type]
    const updated = { ...result, type, verified: true, category: rule }
    setResult(updated)
    setHistory(h => h.map(x => x.id === result.id ? { ...x, type, verified: true } : x))
    setFieldTrials(rows => rows.map(row => row.id === result.id ? { ...row, humanType: type, outcome: row.predictedType === type ? 'confirmed' : 'corrected', verifiedAt: new Date().toISOString() } : row))
    if (!result.verified) {
      setFeedback(rows => [{ id: crypto.randomUUID(), predictedLabel: result.label, predictedType: result.type, correctedType: type, confidence: result.confidence, source: 'human-correction', createdAt: new Date().toISOString() }, ...rows].slice(0, 500))
    }
    fetch('/api/classifications/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: result.id, type }) }).catch(() => {})
    if (!result.verified) setStats(s => ({ ...s, verified: s.verified + 1 }))
  }

  return <div className="app">
    <header className="topbar">
      <div className="brand"><div className="brandMark"><ScanSearch size={22}/></div><div><strong>WasteLens</strong><span>See it. Sort it. Waste less.</span></div></div>
      <div className="modelPill"><span className="dot"/> {modelStatus}</div>
    </header>

    <main>
      <section className="hero">
        <div className="heroCopy">
          <div className="eyebrow"><Sparkles size={15}/> Rethinking Waste</div>
          <h1>Know where it goes <span>before</span> it hits the bin.</h1>
          <p>WasteLens uses computer vision, material reasoning, and verification to help people make better waste-sorting decisions.</p>
          <div className="heroActions">
            <button className="primary" onClick={() => fileRef.current?.click()}><ImagePlus size={18}/> Analyze a photo</button>
            <button className="secondary" onClick={openCamera}><Camera size={18}/> Use camera</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile}/>
          </div>
          <div className="trust"><ShieldCheck size={16}/> Images are analyzed in your browser. Your selected model and image stay on this device during classification.</div>
        </div>
        <div className="heroVisual">
          <div className="scanCard">
            <div className="scanHeader"><span>LIVE SORT</span><span>AI + HUMAN CHECK</span></div>
            <div className="scanObject"><Recycle size={76}/><div className="scanRing"/></div>
            <div className="scanAnswer"><span>Likely recyclable</span><strong>92%</strong></div>
            <div className="meter"><div style={{width:'92%'}}/></div>
            <small>Confidence is a signal, not a guarantee.</small>
          </div>
        </div>
      </section>

      <section className="statsRow">
        <Stat label="Items analyzed" value={stats.total}/><Stat label="Recyclable results" value={stats.recyclable}/><Stat label="Human verified" value={stats.verified}/>
      </section>

      <section className="accountSection">
        <div className="sectionTitle"><div><div className="eyebrow"><Cloud size={15}/> V21 · OPTIONAL ACCOUNT & SYNC</div><h2>Keep your WasteLens settings across devices.</h2><p className="sectionIntro">Create a username and password to sync selected app records. No email, address, or photos are required.</p></div></div>
        <div className="accountPanel panel">
          {accountUser ? <>
            <div className="accountSignedIn"><User size={20}/><div><strong>{accountUser.username}</strong><span>Signed in · cloud revision {syncRevision}{syncUpdatedAt ? ` · updated ${new Date(syncUpdatedAt).toLocaleString()}` : ''}</span></div><button className="secondary" onClick={signOut} disabled={accountBusy}><LogOut size={16}/> Sign out</button></div>
            <div className="accountActions"><button className="secondary" onClick={loadCloudCopy} disabled={accountBusy}><Download size={16}/> Load cloud copy to this device</button><button className="primary" onClick={syncThisDevice} disabled={accountBusy}><Cloud size={16}/> Upload this device to cloud</button></div>
          </> : <>
            <div className="accountForm">
              <label>Username<input autoComplete="username" value={accountUsername} maxLength={24} onChange={e=>setAccountUsername(e.target.value)} placeholder="3–24 letters, numbers, _ or -"/></label>
              <label>Password<input type="password" autoComplete={accountMode==='register'?'new-password':'current-password'} value={accountPassword} maxLength={128} onChange={e=>setAccountPassword(e.target.value)} placeholder="At least 12 characters"/></label>
            </div>
            <div className="accountActions"><button className="primary" onClick={submitAccount} disabled={accountBusy || !accountUsername || !accountPassword}><LogIn size={16}/>{accountMode==='register'?'Create account':'Sign in'}</button><button className="textButton" onClick={()=>setAccountMode(mode=>mode==='register'?'login':'register')}>{accountMode==='register'?'Already have an account? Sign in':'New to WasteLens? Create an account'}</button></div>
          </>}
          <p className="accountStatus">{accountStatus}</p>
          <p className="accountPrivacy"><ShieldCheck size={15}/> Cloud sync includes history, settings, local source rules, field-test metadata, feedback, and model reports. It deliberately excludes dataset photos. Passwords are hashed on the server; sessions use HttpOnly cookies. Use a unique password and do not sync private or sensitive information. This is a self-hosted starter, not a deployed cloud service.</p>
        </div>
      </section>

      <section className="liveModelSection">
        <div className="sectionTitle"><div><div className="eyebrow"><Sparkles size={15}/> V13 · LIVE WASTELENS MODEL</div><h2>Use your trained model in the scanner.</h2><p className="sectionIntro">Load a TensorFlow.js LayersModel to replace the generic MobileNet guess with your own four-category waste classifier.</p></div></div>
        <div className="liveModelPanel panel">
          <div className="liveModelStatus"><span className={customModel?'liveDot':'idleDot'}></span><div><strong>{customModel ? customModelName : 'General-purpose model active'}</strong><small>{customModelStatus}</small></div></div>
          <input ref={customModelFilesRef} type="file" accept="application/json,.json,.bin" multiple onChange={e=>loadCustomModel(e.target.files)} />
          <div className="liveModelActions"><button className="primary" onClick={()=>customModelFilesRef.current?.click()}><Upload size={17}/> Load model.json + weights</button>{customModel && <button className="secondary" onClick={unloadCustomModel}>Use general MobileNet</button>}</div>
          <div className="liveModelNote"><strong>Required model format</strong><p>TensorFlow.js LayersModel, input shape 224 × 224 × 3, four softmax outputs in this exact order: recycle, compost, trash, special. Select model.json and every referenced .bin weight shard together.</p><p>The custom model predicts a disposal category, not the item's exact material or your municipality's acceptance rules. Low confidence is marked for verification.</p></div>
        </div>
      </section>

      <section className="workspace">
        <div className="panel analyzer">
          <div className="panelTitle"><div><h2>Waste Analyzer</h2><p>Upload an item or use your camera.</p></div><button className="iconBtn" onClick={() => { setPreview(''); setResult(null) }} title="Reset"><RefreshCw size={18}/></button></div>
          {!preview ? <div className="dropzone" onClick={() => fileRef.current?.click()}><Upload size={30}/><h3>Drop an image here</h3><p>or click to browse your device</p><span>JPG, PNG, WEBP</span></div> : <div className="previewWrap"><img src={preview} alt="Waste item preview"/><div className="previewBadge">{busy ? 'Analyzing…' : 'Analyzed'}</div></div>}
          {result && <ResultCard result={result} onVerify={verify} />}
          {result && !result.verified && <div className="verifyBox"><div><strong>Can you improve the model?</strong><span>Choose the disposal stream you believe is correct.</span></div><div className="verifyButtons">{Object.entries(CATEGORIES).filter(([k]) => k !== 'unknown').map(([k,v]) => <button key={k} onClick={() => verify(k)}>{v.name}</button>)}</div></div>}
        </div>

        <div className="sideStack">
          <div className="panel rules"><div className="panelTitle"><div><h2>How WasteLens decides</h2><p>Three layers reduce overconfident answers.</p></div></div><Layer n="01" title="Vision" text="A browser-based image model identifies likely objects."/><Layer n="02" title="Material reasoning" text="Object labels are mapped to disposal categories and preparation guidance."/><Layer n="03" title="Verification" text="Low-confidence results are flagged and users can correct the recommendation."/></div>
          <div className="panel manual"><div className="panelTitle"><div><h2>Know the item already?</h2><p>Skip vision and verify it manually.</p></div></div><button className="wideBtn" onClick={() => setManualOpen(!manualOpen)}><CircleHelp size={18}/> Open manual sorter <ChevronRight size={18}/></button>{manualOpen && <div className="manualChoices">{Object.entries(CATEGORIES).filter(([k]) => k !== 'unknown').map(([k,v]) => <button key={k} onClick={() => { setManualChoice(k); setManualOpen(false); setResult({ id: crypto.randomUUID(), label: 'Manual selection', confidence: 100, type: k, material: 'User selected', preparation: v.note, verified: true, category: v, alternatives: [] }); }} className={manualChoice===k?'selected':''}>{v.name}</button>)}</div>}</div>
        </div>
      </section>

      <section className="datasetSection">
        <div className="sectionTitle"><div><div className="eyebrow"><Images size={15}/> V7 · CONSENT-BASED IMAGE DATASET</div><h2>Build a small, human-labeled waste image collection.</h2><p className="sectionIntro">Choose one image or add a batch of up to 20, assign a disposal category, and explicitly opt in to save the images on this device. Images are checked for basic format and resolution before collection. Nothing is uploaded to a server.</p></div></div>
        <div className="datasetPanel panel">
          <div className="datasetBuilder">
            <label className="datasetUpload"> <ImagePlus size={22}/><strong>{datasetImage ? 'Image ready to add' : 'Choose a waste item photo'}</strong><span>Image remains in this browser until you export or delete it.</span><input type="file" accept="image/*" onChange={onDatasetImage}/></label>
            {datasetImage && <img className="datasetPreview" src={datasetImage} alt="Selected dataset sample"/>}
            <label className="datasetLabel">Human-verified category<select value={datasetLabel} onChange={e=>setDatasetLabel(e.target.value)}>{Object.entries(CATEGORIES).filter(([key])=>key!=='unknown').map(([key,value])=><option key={key} value={key}>{value.name}</option>)}</select></label>
            <label className="datasetLabel">Object / capture-session group ID<input value={datasetGroup} maxLength={60} onChange={e=>setDatasetGroup(e.target.value)} placeholder="Example: bottle-set-01"/><small>Use the same ID for every photo of the same physical item or capture session. Leave blank to keep this photo as its own group.</small></label>
          </div>
          <div className="batchDatasetBox">
            <div><strong>Bulk image collection</strong><span>Add up to 10 images at once. Each image must be at least 96 × 96 pixels and no larger than 5 MB.</span></div>
            <label className="batchUpload"><Upload size={17}/> Choose multiple images<input type="file" accept="image/*" multiple onChange={onDatasetBatch}/></label>
            {datasetBatch.length > 0 && <div className="batchPreviewGrid">{datasetBatch.map((image,index)=><div key={`${image.fileName}-${index}`}><img src={image.imageData} alt={image.fileName}/><span>{image.fileName}</span><small>{image.width} × {image.height}</small></div>)}</div>}
            <button className="secondary" disabled={!datasetBatch.length || !datasetConsent} onClick={saveDatasetBatch}><Database size={17}/> Save {datasetBatch.length} batch images</button>
          </div>
          <label className="datasetConsent"><input type="checkbox" checked={datasetConsent} onChange={e=>setDatasetConsent(e.target.checked)}/> I have permission to use these image(s), they do not expose private information, and I agree to save them locally as labeled samples.</label>
          <div className="datasetActions"><button className="primary" disabled={!datasetImage || !datasetConsent} onClick={saveDatasetSample}><Database size={17}/> Save labeled sample</button><button className="secondary" disabled={!datasetSamples.length} onClick={exportDataset}><Download size={17}/> Export image dataset</button></div>
          <div className="datasetCount"><strong>{datasetSamples.length}</strong><span>locally saved image samples</span></div>
          {datasetSamples.length>0 && <div className="datasetSamples">{datasetSamples.slice(0,8).map(sample=><div className="datasetSample" key={sample.id}><img src={sample.imageData} alt="Saved sample"/><span>{CATEGORIES[sample.label]?.name || sample.label}</span><label className="sampleGroupEdit">Group ID<input aria-label={`Group ID for ${sample.id}`} defaultValue={sample.groupId || sample.id} maxLength={60} onBlur={e=>updateDatasetGroup(sample.id,e.target.value).catch(()=>alert('Could not update this sample group.'))}/></label><button className="textButton" onClick={()=>removeDatasetSample(sample.id)}>Delete</button></div>)}</div>}
          <p className="feedbackDisclaimer"><ShieldCheck size={15}/> Consent-based local storage only. Samples are not sent anywhere. Exported JSON contains the image data and labels, so keep the file private. User labels are not ground truth until independently reviewed. This tool does not train a model.</p>
        </div>
      </section>

      <section className="auditSection">
        <div className="sectionTitle"><div><div className="eyebrow"><Database size={15}/> V8 · DATASET QUALITY AUDIT</div><h2>Check dataset balance before model training.</h2><p className="sectionIntro">Review category coverage, repeated uploads, and basic labeling readiness. These checks help spot gaps, but they do not prove that labels are correct.</p></div></div>
        <div className="auditPanel panel">
          <div className="auditMetrics">
            <div><strong>{datasetSamples.length}</strong><span>Total labeled images</span></div>
            <div><strong>{lowResolutionSamples}</strong><span>Below 224 px</span></div>
            <div><strong>{representedClasses}/4</strong><span>Categories represented</span></div>
            <div><strong>{duplicateGroups.reduce((n,g)=>n+g.length-1,0)}</strong><span>Extra exact duplicates</span></div>
            <div><strong>{datasetSamples.length && representedClasses>1 ? `${Math.round(balanceRatio*100)}%` : '—'}</strong><span>Smallest / largest class</span></div>
          </div>
          <div className="auditBars"><strong>Category distribution</strong>{Object.entries(datasetCounts).map(([key,count])=><div className="auditBarRow" key={key}><span>{CATEGORIES[key].name}</span><div className="auditTrack"><i style={{width:`${datasetSamples.length ? count/datasetSamples.length*100 : 0}%`}}/></div><b>{count}</b></div>)}</div>
          <div className="auditChecks">
            <strong>Readiness checks</strong>
            <div className={datasetSamples.length>=20?'checkPass':'checkWarn'}><span>{datasetSamples.length>=20?'✓':'!'}</span><div><b>{datasetSamples.length>=20?'Initial sample volume reached':'Collect more examples'}</b><small>{datasetSamples.length>=20?'At least 20 samples are present. This is only an early collection milestone, not enough by itself for reliable training.':`You have ${datasetSamples.length} samples. Aim for a larger, diverse collection across real-world conditions.`}</small></div></div>
            <div className={representedClasses===4?'checkPass':'checkWarn'}><span>{representedClasses===4?'✓':'!'}</span><div><b>{representedClasses===4?'All disposal categories represented':'Category coverage is incomplete'}</b><small>{representedClasses===4?'Every supported category has at least one sample.':'Add samples for each category you intend the model to recognize.'}</small></div></div>
            <div className={lowResolutionSamples===0?'checkPass':'checkWarn'}><span>{lowResolutionSamples===0?'✓':'!'}</span><div><b>{lowResolutionSamples===0?'No known low-resolution samples':'Review low-resolution images'}</b><small>{lowResolutionSamples===0?'Saved image metadata shows no samples below 224 pixels on either side. Older records without dimensions are not included.':`${lowResolutionSamples} saved images have a dimension below 224 pixels and may lose detail when enlarged.`}</small></div></div>
            <div className={duplicateGroups.length===0?'checkPass':'checkWarn'}><span>{duplicateGroups.length===0?'✓':'!'}</span><div><b>{duplicateGroups.length===0?'No exact duplicate uploads found':'Review exact duplicate uploads'}</b><small>{duplicateGroups.length===0?'No byte-for-byte identical image records were found.':'Repeated identical files can bias a dataset. Review the sample list and remove redundant copies.'}</small></div></div>
            <div className={balanceRatio>=0.5?'checkPass':'checkWarn'}><span>{balanceRatio>=0.5?'✓':'!'}</span><div><b>{balanceRatio>=0.5?'Class counts are relatively balanced':'Class imbalance detected'}</b><small>{representedClasses<2?'Add at least two categories before comparing balance.':`The smallest category has ${Math.round(balanceRatio*100)}% as many samples as the largest category.`}</small></div></div>
          </div>
          <div className="auditActions"><button className="primary" onClick={exportDatasetAudit} disabled={!datasetSamples.length}><Download size={17}/> Export dataset audit</button></div>
          <p className="feedbackDisclaimer"><CircleHelp size={15}/> Duplicate detection checks exact stored image matches only, not visually similar photos. A strong dataset also needs independently checked labels, varied backgrounds and lighting, separate training/validation/test sets, and evaluation on images not used during training. This audit does not train a model.</p>
        </div>
      </section>

      <section className="splitSection">
        <div className="sectionTitle"><div><div className="eyebrow"><Database size={15}/> V9 · TRAINING PREPARATION</div><h2>Separate examples before model development.</h2><p className="sectionIntro">Create a repeatable training, validation, and test manifest. Photos sharing an object/session group ID are kept together so they cannot cross split boundaries.</p></div></div>
        <div className="splitPanel panel">
          <div className="splitMetrics">
            <div><strong>{uniqueCaptureGroups}</strong><span>Unique object/session groups</span></div>
            <div><strong>{conflictingGroupIds.size}</strong><span>Groups with conflicting labels</span></div>
            <div><strong>{splitCounts.train}</strong><span>Training · ~70%</span></div>
            <div><strong>{splitCounts.validation}</strong><span>Validation · ~15%</span></div>
            <div><strong>{splitCounts.test}</strong><span>Test · ~15%</span></div>
          </div>
          <div className="splitByClass"><strong>Split by category</strong>{Object.keys(CATEGORIES).filter(key=>key!=='unknown').map(label => <div className="splitClassRow" key={label}><span>{CATEGORIES[label].name} · {categoryGroupCounts[label]} groups</span><div>{['train','validation','test'].map(split => <small key={split}>{split}: {splitManifest.filter(row=>row.label===label && row.split===split).length} images</small>)}</div></div>)}</div>
          <div className="datasetActions"><button className="primary" disabled={!datasetSamples.length} onClick={exportSplitManifest}><Download size={17}/> Export split manifest</button></div>
          <p className="feedbackDisclaimer"><CircleHelp size={15}/> Important: all photos with the same group ID are assigned to the same split. Assign IDs consistently: the app cannot automatically recognize that two differently labeled uploads depict the same physical object. Group-level splitting may leave a class absent from validation or test when it has too few independent groups. Review labels and keep the test set untouched until final evaluation. This tool prepares metadata only; it does not train a model.</p>
        </div>
      </section>


      <section className="trainingKitSection">
        <div className="sectionTitle"><div><div className="eyebrow"><Database size={15}/> V18 · ROBUST MODEL TRAINING</div><h2>Export a local AI training kit.</h2><p className="sectionIntro">Package your labeled images, existing split assignments, and a Python transfer-learning script so you can train and evaluate a starter waste-category model on your own computer.</p></div></div>
        <div className="trainingKitPanel panel">
          <div className="trainingKitStats"><div><strong>{datasetSamples.length}</strong><span>Image samples</span></div><div><strong>{representedClasses}/4</strong><span>Categories represented</span></div><div><strong>{splitCounts.train}/{splitCounts.validation}/{splitCounts.test}</strong><span>Train / validation / test</span></div></div>
          <button className="primary" onClick={exportTrainingKit} disabled={!trainingReady}><Download size={17}/> Export training kit</button>
          {!trainingReady && <p className="trainingReadinessNote">To export the four-category training kit, add at least 3 independent object/session groups to each category and resolve all groups with conflicting labels. Current category group counts: {Object.entries(categoryGroupCounts).map(([key,count])=>`${key}: ${count}`).join(' · ')}.</p>}
          <div className="trainingKitSteps"><b>What the kit does</b><ol><li>Extracts your labeled images into separate training, validation, and test folders.</li><li>Uses TensorFlow/Keras and MobileNetV2 transfer learning as a baseline.</li><li>Reports test metrics and a confusion matrix, then saves the trained model.</li></ol></div>
          <p className="feedbackDisclaimer"><CircleHelp size={15}/> This creates a downloadable local training workflow; training does not run inside the website. It requires Python dependencies and may download pretrained ImageNet weights. The split is grouped by user-assigned object/session IDs. Ensure IDs are consistent and inspect per-class validation/test coverage before trusting evaluation results. A successful training run is not proof of real-world recycling accuracy.</p>
        </div>
      </section>

      <section className="evaluationSection">
        <div className="sectionTitle"><div><div className="eyebrow"><Database size={15}/> V11 · MODEL EVALUATION CENTER</div><h2>Measure how your trained model performs.</h2><p className="sectionIntro">Import the evaluation report generated by the V18 Python training script. Review held-out test accuracy, per-category precision and recall, and the confusion matrix.</p></div></div>
        <div className="evaluationPanel panel">
          <input ref={evaluationFileRef} type="file" accept="application/json,.json" hidden onChange={e=>importModelEvaluation(e.target.files?.[0])}/>
          <div className="evaluationActions"><button className="primary" onClick={()=>evaluationFileRef.current?.click()}><Upload size={17}/> Import evaluation JSON</button>{modelEvaluation && <button className="secondary" onClick={()=>setModelEvaluation(null)}>Clear report</button>}</div>
          {!modelEvaluation ? <div className="feedbackEmpty">No model report imported yet. Train a model using the V18 training kit, then import its wastelens_evaluation.json file here.</div> : <>
            <div className="evaluationHeading"><div><strong>{modelEvaluation.modelName || 'Imported WasteLens model'}</strong><small>Generated {modelEvaluation.generatedAt ? new Date(modelEvaluation.generatedAt).toLocaleString() : 'date unavailable'} · {modelEvaluation.metrics.testSampleCount ?? '—'} held-out test images</small></div><span className="evaluationAccuracy">{Number(modelEvaluation.metrics.testAccuracy * 100).toFixed(1)}%<small>test accuracy</small></span></div>
            <div className="evaluationMetrics"><div><strong>{Number(modelEvaluation.metrics.testLoss).toFixed(4)}</strong><span>Test loss</span></div><div><strong>{modelEvaluation.metrics.testSampleCount ?? '—'}</strong><span>Test samples</span></div><div><strong>{modelEvaluation.classes.length}</strong><span>Evaluated categories</span></div></div>
            <div className="evaluationTableWrap"><strong>Per-category performance</strong><table className="evaluationTable"><thead><tr><th>Category</th><th>Precision</th><th>Recall</th><th>F1 score</th><th>Samples</th></tr></thead><tbody>{modelEvaluation.classes.map(label=>{const row=modelEvaluation.metrics.classificationReport[label] || {};return <tr key={label}><td>{CATEGORIES[label]?.name || label}</td><td>{Number(row.precision||0).toFixed(3)}</td><td>{Number(row.recall||0).toFixed(3)}</td><td>{Number(row['f1-score']||0).toFixed(3)}</td><td>{row.support ?? 0}</td></tr>})}</tbody></table></div>
            <div className="evaluationTableWrap"><strong>Confusion matrix <small>Rows = actual category · Columns = predicted category</small></strong><table className="evaluationTable confusionTable"><thead><tr><th>Actual \ Predicted</th>{modelEvaluation.classes.map(label=><th key={label}>{CATEGORIES[label]?.name || label}</th>)}</tr></thead><tbody>{modelEvaluation.metrics.confusionMatrix.map((row,i)=><tr key={modelEvaluation.classes[i]}><th>{CATEGORIES[modelEvaluation.classes[i]]?.name || modelEvaluation.classes[i]}</th>{row.map((value,j)=><td className={i===j?'matrixCorrect':'matrixError'} key={j}>{value}</td>)}</tr>)}</tbody></table></div>
            <div className="evaluationLimitations"><strong>Interpret results carefully</strong><ul>{(modelEvaluation.limitations || []).map((item,i)=><li key={i}>{item}</li>)}</ul><p>Accuracy alone is not enough. Check per-category recall, the number of test examples, label quality, and whether related photos leaked between splits. Do not compare two models unless they were evaluated on the same untouched test set.</p></div>
          </>}
          <p className="feedbackDisclaimer"><CircleHelp size={15}/> The Evaluation Center displays metrics from the imported report. It does not independently verify the model, labels, test split, or reported scores.</p>
        </div>
      </section>

      <section className="comparisonSection">
        <div className="sectionTitle"><div><div className="eyebrow"><Database size={15}/> V12 · MODEL COMPARISON CENTER</div><h2>Compare multiple trained models side by side.</h2><p className="sectionIntro">Import two or more evaluation reports to compare accuracy, macro F1, test loss, and sample counts.</p></div></div>
        <div className="comparisonPanel panel">
          <input ref={comparisonFileRef} type="file" accept="application/json,.json" multiple hidden onChange={e=>importComparisonReports(e.target.files)}/>
          <div className="comparisonActions"><button className="primary" onClick={()=>comparisonFileRef.current?.click()}><Upload size={17}/> Import model reports</button><button className="secondary" onClick={exportComparison} disabled={!modelComparisons.length}><Download size={17}/> Export comparison</button><button className="textButton" onClick={()=>setModelComparisons([])} disabled={!modelComparisons.length}>Clear all</button></div>
          {!modelComparisons.length ? <div className="feedbackEmpty">No models added yet. Import multiple wastelens_evaluation.json files generated by separate training runs.</div> : <>
            <div className="comparisonCount">{modelComparisons.length} model report{modelComparisons.length===1?'':'s'} loaded · up to 8 reports can be compared</div>
            <div className="comparisonTableWrap"><table className="evaluationTable comparisonTable"><thead><tr><th>Model</th><th>Accuracy</th><th>Macro F1</th><th>Test loss</th><th>Test images</th><th></th></tr></thead><tbody>{modelComparisons.map(item=>{const m=comparisonSummary(item.report);return <tr key={item.key}><td><b>{item.report.modelName || item.fileName}</b><small>{item.report.generatedAt ? new Date(item.report.generatedAt).toLocaleDateString() : 'Date unavailable'}</small></td><td>{(m.accuracy*100).toFixed(1)}%</td><td>{m.f1.toFixed(3)}</td><td>{m.loss.toFixed(4)}</td><td>{m.samples || '—'}</td><td><button className="removeComparison" onClick={()=>setModelComparisons(rows=>rows.filter(row=>row.key!==item.key))} aria-label="Remove model report"><X size={15}/></button></td></tr>})}</tbody></table></div>
            {modelComparisons.length >= 2 && <div className="comparisonVerdict"><strong>Metric leader (descriptive only)</strong><p>{(() => { const best = [...modelComparisons].sort((a,b)=>comparisonSummary(b.report).f1-comparisonSummary(a.report).f1)[0]; return `${best.report.modelName || best.fileName} has the highest macro F1 (${comparisonSummary(best.report).f1.toFixed(3)}).` })()}</p><small>Do not treat this as a fair winner unless every model used the same untouched test images, identical category definitions, and the same evaluation procedure.</small></div>}
          </>}
          <p className="feedbackDisclaimer"><CircleHelp size={15}/> WasteLens cannot confirm that reports used the same test set. Different datasets, class mappings, sample sizes, or label quality can make comparisons misleading. The leader is selected by macro F1 only and is not automatically the best real-world model.</p>
        </div>
      </section>

      <section className="fieldTrialSection">
        <div className="sectionTitle"><div><div className="eyebrow"><Database size={15}/> V19 · REAL-WORLD PILOT ANALYSIS</div><h2>Measure predictions against human verification.</h2><p className="sectionIntro">Every model-based scan is logged locally. Confirm or correct the result to build a practical field-testing record.</p></div></div>
        <div className="fieldTrialPanel panel">
          <div className="pilotProtocol">
            <strong>Record the conditions for your next scan</strong>
            <p>Choose consistent conditions before scanning. These are self-reported test notes, not sensor measurements. For a fair comparison, test the same physical items with each model, change one condition at a time, and have a reviewer check the item category independently.</p>
            <div className="pilotConditionGrid">
              <label>Lighting<select value={fieldContext.lighting} onChange={e=>setFieldContext(v=>({...v,lighting:e.target.value}))}><option value="bright">Bright</option><option value="indoor">Indoor / moderate</option><option value="dim">Dim</option><option value="outdoor">Outdoor / variable</option></select></label>
              <label>Background<select value={fieldContext.background} onChange={e=>setFieldContext(v=>({...v,background:e.target.value}))}><option value="simple">Simple</option><option value="cluttered">Cluttered</option><option value="natural">Outdoor / natural</option></select></label>
              <label>View angle<select value={fieldContext.angle} onChange={e=>setFieldContext(v=>({...v,angle:e.target.value}))}><option value="front">Front</option><option value="top">Top-down</option><option value="side">Side</option><option value="angled">Angled</option></select></label>
              <label>Distance<select value={fieldContext.distance} onChange={e=>setFieldContext(v=>({...v,distance:e.target.value}))}><option value="close">Close</option><option value="medium">Medium</option><option value="far">Far</option></select></label>
            </div>
          </div>
          {(() => { const summary = summarizeFieldTrials(fieldTrials); return <>
            <div className="fieldTrialMetrics"><div><strong>{summary.total}</strong><span>Predictions logged</span></div><div><strong>{summary.verified}</strong><span>Human verified</span></div><div><strong>{summary.pending}</strong><span>Awaiting verification</span></div><div><strong>{summary.correctionRate === null ? '—' : `${(summary.correctionRate*100).toFixed(1)}%`}</strong><span>Correction rate</span></div></div>
            <div className="fieldTrialActions"><button className="primary" onClick={exportFieldTrials} disabled={!fieldTrials.length}><Download size={17}/> Export field report</button><button className="secondary" onClick={exportFieldTrialsCsv} disabled={!fieldTrials.length}><Download size={17}/> Export CSV</button><button className="textButton" onClick={() => { if (window.confirm('Delete all locally stored field-testing records?')) setFieldTrials([]) }} disabled={!fieldTrials.length}>Clear field records</button></div>
            {summary.byModel.length ? <div className="fieldTrialTableWrap"><strong>Performance by model (human-reviewed samples only)</strong><table className="evaluationTable"><thead><tr><th>Model</th><th>Verified</th><th>Confirmed</th><th>Corrected</th><th>Correction rate</th></tr></thead><tbody>{summary.byModel.map(group=><tr key={group.name}><td>{group.name}</td><td>{group.verified}</td><td>{group.confirmed}</td><td>{group.corrected}</td><td>{group.correctionRate===null?'—':`${(group.correctionRate*100).toFixed(1)}%`}</td></tr>)}</tbody></table></div> : <p className="feedbackEmpty">No field tests yet. Scan an item with a model, then verify the prediction in the analyzer to begin collecting results.</p>}
            <div className="fieldTrialTableWrap"><strong>Correction rate by test condition</strong><div className="pilotConditionTables">{Object.entries(summary.byCondition).map(([dimension,groups])=><div key={dimension}><b>{dimension}</b><table className="evaluationTable"><thead><tr><th>Condition</th><th>Reviewed</th><th>Corrected</th><th>Rate</th></tr></thead><tbody>{groups.map(group=><tr key={group.name}><td>{group.name}</td><td>{group.verified}</td><td>{group.corrected}</td><td>{group.correctionRate===null?'—':`${(group.correctionRate*100).toFixed(1)}%`}</td></tr>)}</tbody></table></div>)}</div></div>
            <div className="fieldTrialTableWrap"><strong>Reviewed outcomes by corrected category</strong><table className="evaluationTable"><thead><tr><th>Category</th><th>Reviewed</th><th>Confirmed</th><th>Corrected</th><th>Correction rate</th></tr></thead><tbody>{summary.byReviewedCategory.map(group=><tr key={group.name}><td>{CATEGORIES[group.name]?.name || group.name}</td><td>{group.verified}</td><td>{group.confirmed}</td><td>{group.corrected}</td><td>{group.correctionRate===null?'—':`${(group.correctionRate*100).toFixed(1)}%`}</td></tr>)}</tbody></table></div>
            <div className="fieldTrialTableWrap"><strong>Confidence bands (reviewed samples only)</strong><table className="evaluationTable"><thead><tr><th>Model confidence</th><th>Reviewed</th><th>Corrected</th><th>Correction rate</th></tr></thead><tbody>{summary.confidenceBands.map(band=><tr key={band.label}><td>{band.label}</td><td>{band.verified}</td><td>{band.corrected}</td><td>{band.correctionRate===null?'—':`${(band.correctionRate*100).toFixed(1)}%`}</td></tr>)}</tbody></table></div>
            {fieldTrials.length>0 && <div className="fieldTrialRecent"><strong>Recent field tests</strong>{fieldTrials.slice(0,6).map(row=><div className="fieldTrialRow" key={row.id}><span>{row.modelSource}</span><b>{CATEGORIES[row.predictedType]?.name || 'Needs verification'}{row.humanType ? ` → ${CATEGORIES[row.humanType]?.name}` : ' · awaiting review'}</b><small>{row.confidence}% confidence · {new Date(row.createdAt).toLocaleString()}</small></div>)}</div>}
          </> })()}
          <p className="feedbackDisclaimer"><CircleHelp size={15}/> This is an observational pilot, not a controlled accuracy benchmark. Lighting, background, angle, and distance are self-reported. Only manually reviewed scans count in correction rates. Condition groups with fewer than 10 reviewed examples are descriptive only and should not be treated as stable estimates. The sample may be biased, small, or mislabeled; do not treat it as proof of real-world performance. Records contain prediction metadata, not photos, and remain in this browser until exported.</p>
        </div>
      </section>

      <section className="feedbackSection">
        <div className="sectionTitle"><div><div className="eyebrow"><Database size={15}/> V6 · MODEL IMPROVEMENT DATA</div><h2>Turn corrections into a useful learning record.</h2><p className="sectionIntro">Human corrections are saved locally as structured label feedback. Export them to review common classification mistakes and plan a waste-specific dataset.</p></div></div>
        <div className="feedbackPanel panel">
          <div className="feedbackSummary"><div><strong>{feedback.length}</strong><span>Human correction records</span></div><div><strong>Local only</strong><span>Stored in this browser</span></div><div><strong>No photos</strong><span>Image files are not included</span></div></div>
          <div className="feedbackActions">
            <button className="primary" onClick={exportFeedback} disabled={!feedback.length}><Download size={17}/> Export feedback JSON</button>
            <button className="secondary" onClick={exportFeedbackCsv} disabled={!feedback.length}><Download size={17}/> Export CSV</button>
            <button className="textButton" onClick={() => { if (window.confirm('Clear all locally saved correction records?')) setFeedback([]) }} disabled={!feedback.length}>Clear records</button>
          </div>
          {feedback.length ? <div className="feedbackRecent"><strong>Recent corrections</strong>{feedback.slice(0,5).map(row => <div className="feedbackRow" key={row.id}><span>{row.predictedLabel}</span><b>{CATEGORIES[row.predictedType]?.name || 'Unknown'} → {CATEGORIES[row.correctedType]?.name || row.correctedType}</b><small>{row.confidence}% · {new Date(row.createdAt).toLocaleDateString()}</small></div>)}</div> : <p className="feedbackEmpty">No corrections collected yet. Analyze an item and use the verification buttons to create the first record.</p>}
          <p className="feedbackDisclaimer"><CircleHelp size={15}/> This is a correction log, not a trained model or a photo dataset. It records model labels and human-selected categories only. A future vision-training workflow would need consent-based image collection, labeling, and quality checks.</p>
        </div>
      </section>

      <section className="guideSection">
        <div className="sectionTitle">
          <div><div className="eyebrow"><Recycle size={15}/> Waste guide</div><h2>Look up an item without taking a photo.</h2></div>
        </div>
        <div className="localProgram panel">
          <div className="localProgramHead">
            <div><span className="eyebrow"><ShieldCheck size={14}/> LOCAL PROGRAM SETTINGS</span><h3>Match guidance to your recycling program.</h3><p>Choose a profile, then customize individual items. Changes stay in this browser.</p></div>
            <label className="profileSelect">Guidance profile<select value={region} onChange={e => setRegion(e.target.value)}><option value="general">General guidance</option><option value="virginia">Virginia demo profile</option><option value="county">Custom local profile</option></select></label>
          </div>
          {region === 'county' && <div className="customProgramTools"><label>Program name<input value={programName} onChange={e => setProgramName(e.target.value)} maxLength={60}/></label><button className="textButton" onClick={resetLocalRules}>Reset custom rules and sources</button></div>}
          {region === 'county' && <div className="sourceRulesPanel">
            <div><strong>Source-backed local rules</strong><p>Record what your municipality or hauler says for a specific material. WasteLens stores your citation and review date; it does not independently authenticate the source.</p></div>
            <div className="sourceRuleForm">
              <label>Guide item<select value={sourceRuleDraft.ruleKey} onChange={e=>setSourceRuleDraft(d=>({...d,ruleKey:e.target.value}))}>{RULES.map(rule=><option key={rule.keys[0]} value={rule.keys[0]}>{rule.keys[0]}</option>)}</select></label>
              <label>Disposal category<select value={sourceRuleDraft.type} onChange={e=>setSourceRuleDraft(d=>({...d,type:e.target.value}))}><option value="recycle">Recycle</option><option value="compost">Compost</option><option value="trash">Trash</option><option value="special">Special disposal</option><option value="unknown">Not sure / verify</option></select></label>
              <label>Source title<input value={sourceRuleDraft.sourceTitle} maxLength={120} onChange={e=>setSourceRuleDraft(d=>({...d,sourceTitle:e.target.value}))} placeholder="Municipal recycling guide"/></label>
              <label>Official source URL<input type="url" value={sourceRuleDraft.sourceUrl} onChange={e=>setSourceRuleDraft(d=>({...d,sourceUrl:e.target.value}))} placeholder="https://..."/></label>
              <label>Source authority<select value={sourceRuleDraft.authority} onChange={e=>setSourceRuleDraft(d=>({...d,authority:e.target.value}))}><option value="municipality">Municipality</option><option value="waste-hauler">Waste hauler</option><option value="state-agency">State agency</option><option value="regional-authority">Regional authority</option><option value="other">Other</option></select></label>
              <label>Date checked<input type="date" value={sourceRuleDraft.checkedDate} onChange={e=>setSourceRuleDraft(d=>({...d,checkedDate:e.target.value}))}/></label>
              <label className="sourceNotes">Notes<textarea value={sourceRuleDraft.notes} maxLength={300} onChange={e=>setSourceRuleDraft(d=>({...d,notes:e.target.value}))} placeholder="Summarize the specific acceptance/preparation rule."/></label>
            </div>
            <label className="sourceConfirm"><input type="checkbox" checked={sourceRuleDraft.confirmed} onChange={e=>setSourceRuleDraft(d=>({...d,confirmed:e.target.checked}))}/> I reviewed this source and confirmed that it applies to the selected local program.</label>
            <div className="sourceRuleActions"><button className="primary" onClick={addSourceRule} disabled={!sourceRuleDraft.confirmed}>Save source-backed rule</button><button className="secondary" onClick={exportLocalRulebook} disabled={!sourceRules.length}>Export local rulebook</button></div>
            {sourceRules.length>0 && <div className="sourceRuleList">{sourceRules.map(rule=><div key={rule.ruleKey}><div><strong>{rule.ruleKey} · {CATEGORIES[rule.type]?.name || rule.type}</strong><a href={rule.sourceUrl} target="_blank" rel="noreferrer">{rule.sourceTitle}</a><small>{rule.authority} · checked {rule.checkedDate} · {isSourceRuleStale(rule)?'Needs rechecking':'Review date current'}</small></div><button className="textButton" onClick={()=>removeSourceRule(rule.ruleKey)}>Remove</button></div>)}</div>}
          </div>}
          <div className="programNotice"><CircleHelp size={16}/><span>{region === 'county' ? 'Custom rules and source citations are user-entered. WasteLens records your review date but does not authenticate the website or independently confirm that a rule applies to your address.' : region === 'virginia' ? 'This is a demonstration profile, not an official statewide rule set. Local acceptance varies by city, county, and hauler.' : 'General guidance is not location-specific. Select Custom local profile to enter rules from your local waste provider.'}</span></div>
        </div>
        <div className="guideToolbar">
          <div className="guideSearch"><ScanSearch size={17}/><input value={guideQuery} onChange={e => setGuideQuery(e.target.value)} placeholder="Search bottles, cardboard, batteries…" aria-label="Search waste guide"/></div>
          <div className="guideFilters">
            {['all','recycle','compost','trash','special'].map(k => <button key={k} className={guideCategory===k?'active':''} onClick={() => setGuideCategory(k)}>{k==='all'?'All':CATEGORIES[k].name}</button>)}
          </div>
        </div>
        <div className="guideGrid">
          {guideItems.map(rule => { const info=CATEGORIES[rule.type]; const Icon=info.icon; return <div className="guideCard" key={rule.keys[0]}><div className={`guideIcon ${info.tone}`}><Icon size={19}/></div><div className="guideCardBody"><strong>{rule.keys[0]}</strong><span>{info.name} · {rule.material}</span><p>{rule.preparation}</p><small>{rule.local}</small>{rule.sourceRule && <div className="activeRuleSource"><a href={rule.sourceRule.sourceUrl} target="_blank" rel="noreferrer">Source: {rule.sourceRule.sourceTitle}</a><span className={rule.sourceStale?'staleSource':'freshSource'}>{rule.sourceStale?'Needs rechecking':'User reviewed'} · {rule.sourceRule.checkedDate}</span></div>}{region === 'county' && !rule.sourceRule && <label className="ruleEditor">Your program's rule<select value={customRules[rule.keys[0]] || rule.type} onChange={e => saveLocalRule(rule.keys[0], e.target.value)}><option value="recycle">Recycle</option><option value="compost">Compost</option><option value="trash">Trash</option><option value="special">Special disposal</option><option value="unknown">Not sure / verify</option></select></label>}</div></div> })}
          {guideItems.length===0 && <div className="empty guideEmpty">No matching items yet. Try a broader search.</div>}
        </div>
        <p className="guideNote"><CircleHelp size={14}/> {region === 'county' ? `${programName}: custom entries are saved locally and should be checked against official guidance.` : 'The included profiles are demonstrations, not verified municipal databases. Always confirm with your local government or waste hauler.'}</p>
      </section>

      <section className="contaminationSection">
        <div className="sectionTitle"><div><div className="eyebrow"><ShieldCheck size={15}/> V5 · CONTAMINATION INTELLIGENCE</div><h2>Check whether an item is ready for recycling.</h2><p className="sectionIntro">Describe the item's condition to get preparation guidance. This is a user-guided check, not automatic camera detection.</p></div></div>
        <div className="contaminationPanel panel">
          <div className="contaminationGrid">
            <Question label="Food residue" value={contamination.food} onChange={v => {setContamination(c => ({...c,food:v}));setContaminationChecked(false)}} options={[["none","None visible"],["light","A little residue"],["heavy","Significant food remains"]]}/>
            <Question label="Liquid inside" value={contamination.liquid} onChange={v => {setContamination(c => ({...c,liquid:v}));setContaminationChecked(false)}} options={[["none","Empty / dry"],["some","Some liquid"],["full","Contains liquid"]]}/>
            <Question label="Grease or oil" value={contamination.grease} onChange={v => {setContamination(c => ({...c,grease:v}));setContaminationChecked(false)}} options={[["none","No grease"],["light","Light grease"],["heavy","Heavy grease / oil"]]}/>
            <Question label="Mixed materials" value={contamination.mixed} onChange={v => {setContamination(c => ({...c,mixed:v}));setContaminationChecked(false)}} options={[["no","No, one material"],["yes","Yes, multiple materials"],["unsure","Not sure"]]}/>
            <Question label="Can it be cleaned or separated?" value={contamination.cleanable} onChange={v => {setContamination(c => ({...c,cleanable:v}));setContaminationChecked(false)}} options={[["yes","Yes"],["no","No"],["unsure","Not sure"]]}/>
          </div>
          <div className="contaminationActions"><button className="primary" onClick={() => setContaminationChecked(true)}><ScanSearch size={17}/> Assess item condition</button><button className="secondary" onClick={() => {setContamination({food:'none',liquid:'none',grease:'none',mixed:'no',cleanable:'yes'});setContaminationChecked(false)}}>Reset answers</button></div>
          {contaminationChecked && <ContaminationResult answers={contamination}/>}
          <p className="contaminationDisclaimer"><CircleHelp size={15}/> This assessment explains common contamination concerns. It does not identify material composition, guarantee acceptance, or replace your local recycling program's rules.</p>
        </div>
      </section>

      <section className="historySection"><div className="sectionTitle"><div><div className="eyebrow"><History size={15}/> Your local history</div><h2>Recent decisions</h2></div></div>{history.length === 0 ? <div className="empty">Your analyzed items will appear here.</div> : <div className="historyGrid">{history.slice(0,8).map(item => <div className="historyCard" key={item.id}><div className="historyIcon"><Recycle size={18}/></div><div><strong>{item.label}</strong><span>{CATEGORIES[item.type]?.name || 'Needs verification'} · {item.confidence}% confidence</span></div><CheckCircle2 size={17} className={item.verified?'verified':''}/></div>)}</div>}</section>

      <section className="demoSection">
        <div className="sectionTitle"><div><div className="eyebrow"><Sparkles size={15}/> V23 · COMPETITION DEMO PREPARATION</div><h2>Prepare a clear, honest WasteLens demonstration.</h2><p className="sectionIntro">Use this checklist to keep the demo focused and distinguish implemented features from work that still needs real-world validation.</p></div></div>
        <div className="demoPanel panel">
          <div className="demoProgressHead"><div><strong>{demoProgress.completed} of {demoProgress.total} steps ready</strong><span>Demo preparation progress · {demoProgress.percent}%</span></div><button className="textButton" onClick={()=>setDemoCompleted([])} disabled={!demoCompleted.length}>Reset checklist</button></div>
          <div className="demoProgressTrack"><div style={{width:`${demoProgress.percent}%`}}/></div>
          <div className="demoChecklist">{DEMO_STEPS.map(step=><button key={step.id} className={`demoStep ${demoCompleted.includes(step.id)?'done':''}`} onClick={()=>setDemoCompleted(rows=>rows.includes(step.id)?rows.filter(id=>id!==step.id):[...rows,step.id])}><span className="demoCheck"><CheckCircle2 size={18}/></span><span className="demoStepCopy"><strong>{step.title}</strong><small>{step.detail}</small></span></button>)}</div>
          <p className="feedbackDisclaimer"><ShieldCheck size={15}/> This checklist is for presentation preparation only. It does not verify that the feature has been tested or that model performance is accurate. Only mark a step ready after you have personally tested it.</p>
        </div>
      </section>

      <section className="nextSection"><div><div className="eyebrow"><Leaf size={15}/> Built for the waste problem</div><h2>Classification is only the beginning.</h2><p>The next layer is understanding what people get wrong, where confusion happens, and which materials create the most contamination.</p></div><div className="nextCards"><Mini title="Contamination map" text="Find categories that are frequently mis-sorted."/><Mini title="Local rules" text="Adapt recommendations to the user's recycling program."/><Mini title="Waste insights" text="Turn anonymous corrections into better guidance."/></div></section>
    </main>

    {cameraOpen && <div className="modal"><div className="cameraCard"><button className="close" onClick={closeCamera}><X/></button><video ref={videoRef} autoPlay playsInline/><button className="capture" onClick={capture}><Camera size={20}/> Capture item</button></div></div>}
    <footer><span>WasteLens • Arbiter Hacks V1</span><span>Designed around responsible uncertainty and user verification.</span></footer>
  </div>
}

function Question({label,value,onChange,options}) { return <label className="contaminationQuestion"><span>{label}</span><select value={value} onChange={e=>onChange(e.target.value)}>{options.map(([v,t])=><option value={v} key={v}>{t}</option>)}</select></label> }
function ContaminationResult({answers}) {
  const flags = []
  if (answers.food === 'heavy') flags.push('Significant food residue may make paper or packaging unsuitable for recycling.')
  if (answers.food === 'light') flags.push('Remove loose food. Check whether your local program requires containers to be rinsed.')
  if (answers.liquid !== 'none') flags.push('Empty the container before placing it in a recycling stream.')
  if (answers.grease === 'heavy') flags.push('Heavy grease can contaminate paper fibers and may prevent recycling.')
  if (answers.grease === 'light') flags.push('Even light grease may matter for paper and cardboard. Follow local guidance.')
  if (answers.mixed === 'yes') flags.push('Separate components when possible. Different materials may belong in different streams.')
  if (answers.mixed === 'unsure') flags.push('Check the packaging label or manufacturer information to identify its materials.')
  if (answers.cleanable === 'no' && (answers.food !== 'none' || answers.grease !== 'none')) flags.push('Because residue cannot be removed, do not assume the item is recyclable. Check local trash or special-disposal guidance.')
  if (answers.cleanable === 'unsure') flags.push('Check whether the parts can be safely separated or cleaned.')
  const clear = flags.length === 0
  return <div className={`contaminationOutcome ${clear?'clear':'cautionOutcome'}`}><div className="outcomeHeading"><strong>{clear?'No obvious contamination reported':'Potential contamination concerns'}</strong><span>{clear?'The item appears clean based on your answers.':'Review these preparation steps before sorting.'}</span></div>{clear?<p>Keep the item empty, dry, and separated from non-recyclable components. Confirm the material is accepted locally.</p>:<ul>{flags.map((f,i)=><li key={i}>{f}</li>)}</ul>}<small>Based on user-entered observations, not image recognition.</small></div>
}

function Stat({label,value}) { return <div className="stat"><strong>{value}</strong><span>{label}</span></div> }
function Layer({n,title,text}) { return <div className="layer"><b>{n}</b><div><strong>{title}</strong><span>{text}</span></div></div> }
function Mini({title,text}) { return <div className="mini"><strong>{title}</strong><span>{text}</span></div> }
function ResultCard({result,onVerify}) { const Icon=result.category.icon; return <div className={`result ${result.category.tone}`}><div className="resultTop"><div className="resultIcon"><Icon size={25}/></div><div><span>RECOMMENDATION</span><h3>{result.category.name}</h3></div><div className="confidence"><strong>{result.confidence}%</strong><span>confidence</span></div></div><div className="resultBody"><div><span>Detected</span><strong>{result.label}</strong></div><div><span>Material</span><strong>{result.material}</strong></div><div><span>Preparation</span><strong>{result.preparation}</strong></div></div>{result.alternatives?.length>0 && <details><summary>See alternative model guesses</summary>{result.alternatives.map((a,i)=><div className="alt" key={i}><span>{a.className}</span><b>{Math.round(a.probability*100)}%</b></div>)}</details>}<p className="caution"><CircleHelp size={15}/> Always check local waste rules. Packaging and municipal programs differ.</p></div> }

class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) { console.error('WasteLens interface error:', error) }
  render() {
    if (this.state.failed) return <div className="appError"><h1>WasteLens could not load this screen.</h1><p>Your locally saved data has not intentionally been cleared. Reload the page, or clear this site's cache only if the problem continues.</p><button className="primary" onClick={() => window.location.reload()}>Reload WasteLens</button></div>
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(<AppErrorBoundary><App /></AppErrorBoundary>)
