import { parsePath, verifySignature } from './token.js'

const text = (status, body) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })

/**
 * Sirve un objeto de R2 si la URL lleva una firma válida para su prefijo.
 *
 * La caché de Cloudflare se consulta con la clave del objeto, sin el token:
 * todos los que tienen permiso comparten la misma copia en el borde, y el
 * token se comprueba siempre antes de tocar la caché.
 */
export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return text(405, 'Method not allowed')

    const url = new URL(request.url)
    const target = parsePath(url.pathname)
    if (!target) return text(404, 'Not found')

    const allowed = await verifySignature(env.CDN_SIGNING_SECRET, target)
    if (!allowed) return text(403, 'Forbidden')

    const cacheKey = new Request(`${url.origin}/__objects/${encodeURI(target.key)}`)
    const cache = caches.default
    let response = await cache.match(cacheKey)
    const hit = Boolean(response)

    if (!response) {
      const object = await env.BUCKET.get(target.key)
      if (!object) return text(404, 'Not found')

      const metadata = new Headers()
      object.writeHttpMetadata(metadata)
      metadata.set('etag', object.httpEtag)
      metadata.set('x-content-type-options', 'nosniff')
      metadata.set('cross-origin-resource-policy', 'cross-origin')
      response = new Response(object.body, { headers: metadata })
      ctx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => {}))
    }

    // x-cache dice si salió de la caché del borde (Cloudflare no añade
    // cf-cache-status a lo que un Worker sirve con la Cache API).
    const headers = new Headers(response.headers)
    headers.set('x-cache', hit ? 'HIT' : 'MISS')

    if (request.headers.get('if-none-match') === headers.get('etag')) {
      return new Response(null, { status: 304, headers })
    }
    if (request.method === 'HEAD') return new Response(null, { headers })
    return new Response(response.body, { status: response.status, headers })
  },
}
