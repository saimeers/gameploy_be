// Enlaces firmados: /t/<exp>.<firma>/<prefijo>/<archivo>
//
// La API firma HMAC-SHA256(secreto, "<prefijo>|<exp>") con node:crypto
// (src/utils/cdnToken.js del backend); aquí se verifica con WebCrypto.
// El prefijo son las dos primeras partes de la ruta (builds/<id>/ o
// media/<id>/), así que un enlace solo abre los archivos de un juego o
// una imagen, nunca los de otro.

const encoder = new TextEncoder()
const ROOTS = new Set(['builds', 'media'])

function fromBase64Url(text) {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(binary, c => c.charCodeAt(0))
}

/**
 * Separa token, prefijo firmado y clave del objeto en R2.
 * @returns {{ exp: number, signature: string, prefix: string, key: string } | null}
 */
export function parsePath(pathname) {
  const parts = pathname.split('/').slice(1)
  if (parts.length < 5 || parts[0] !== 't') return null

  const match = /^(\d{1,12})\.([A-Za-z0-9_-]{20,})$/.exec(parts[1])
  if (!match) return null

  let segments
  try {
    segments = parts.slice(2).map(decodeURIComponent)
  } catch {
    return null
  }
  if (!ROOTS.has(segments[0]) || !segments[1]) return null
  if (segments.some(s => s === '' || s === '.' || s === '..')) return null

  return {
    exp: Number(match[1]),
    signature: match[2],
    prefix: `${segments[0]}/${segments[1]}/`,
    key: segments.join('/'),
  }
}

/** Firma válida y sin vencer. La comparación la hace WebCrypto en tiempo constante. */
export async function verifySignature(secret, { prefix, exp, signature }, nowMs = Date.now()) {
  if (!secret || exp * 1000 <= nowMs) return false
  let sig
  try {
    sig = fromBase64Url(signature)
  } catch {
    return false
  }
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
  )
  return crypto.subtle.verify('HMAC', key, sig, encoder.encode(`${prefix}|${exp}`))
}
