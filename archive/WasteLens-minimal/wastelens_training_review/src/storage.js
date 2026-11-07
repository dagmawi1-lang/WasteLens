/** Parse browser-stored JSON without allowing damaged data to crash app startup. */
export function parseStoredJSON(raw, fallback) {
  if (typeof raw !== 'string' || raw.length === 0) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

/** Read JSON from a Storage-compatible object. Storage access itself can throw. */
export function safeGetJSON(key, fallback, storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage
    return parseStoredJSON(target?.getItem(key), fallback)
  } catch {
    return fallback
  }
}

/** Write JSON to a Storage-compatible object and report whether it succeeded. */
export function safeSetJSON(key, value, storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage
    target?.setItem(key, JSON.stringify(value))
    return Boolean(target)
  } catch {
    return false
  }
}

export function safeGetText(key, fallback, storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage
    return target?.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function safeSetText(key, value, storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage
    target?.setItem(key, String(value))
    return Boolean(target)
  } catch {
    return false
  }
}
