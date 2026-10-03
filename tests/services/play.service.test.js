const AdmZip = require('adm-zip')

jest.mock('../../src/services/storage.service', () => ({
  getObjectBuffer: jest.fn(),
}))

const { getObjectBuffer } = require('../../src/services/storage.service')
const play = require('../../src/services/play.service')

/** .zip en memoria con los archivos dados ({ ruta: contenido }). */
const makeZip = (files) => {
  const zip = new AdmZip()
  for (const [name, content] of Object.entries(files)) zip.addFile(name, Buffer.from(content))
  return zip.toBuffer()
}

const BUILD = {
  'index.html': '<html><head><title>Juego</title></head><body></body></html>',
  'Build/Juego.loader.js': 'loader',
  'Build/Juego.wasm': 'wasm',
  'TemplateData/style.css': 'css',
}

beforeEach(() => {
  play._resetForTests()
  delete process.env.PLAY_CACHE_MB
})

describe('findRoot', () => {
  it('usa la raíz cuando el index.html está en la raíz del .zip', () => {
    expect(play.findRoot(['index.html', 'Build/a.wasm'])).toBe('')
  })

  it('usa la carpeta del index.html menos anidado', () => {
    expect(play.findRoot(['Juego/index.html', 'Juego/TemplateData/index.html'])).toBe('Juego/')
  })
})

describe('loadBuild', () => {
  it('descarga el .zip una sola vez y sirve las siguientes peticiones desde la caché', async () => {
    getObjectBuffer.mockResolvedValue(makeZip(BUILD))

    await play.loadBuild('k/game.zip')
    const build = await play.loadBuild('k/game.zip')

    expect(getObjectBuffer).toHaveBeenCalledTimes(1)
    expect(play.findFile(build, 'Build/Juego.wasm').data.toString()).toBe('wasm')
  })

  it('comparte la descarga entre peticiones simultáneas', async () => {
    getObjectBuffer.mockResolvedValue(makeZip(BUILD))

    await Promise.all([
      play.loadBuild('k/game.zip'),
      play.loadBuild('k/game.zip'),
      play.loadBuild('k/game.zip'),
    ])

    expect(getObjectBuffer).toHaveBeenCalledTimes(1)
  })

  it('no guarda en caché una descarga fallida', async () => {
    getObjectBuffer.mockRejectedValueOnce(new Error('bucket caído'))
    await expect(play.loadBuild('k/game.zip')).rejects.toThrow('bucket caído')

    getObjectBuffer.mockResolvedValue(makeZip(BUILD))
    await expect(play.loadBuild('k/game.zip')).resolves.toBeTruthy()
    expect(getObjectBuffer).toHaveBeenCalledTimes(2)
  })

  it('descarta el build usado hace más tiempo al pasar el tope de la caché', async () => {
    // Tope de ~1 MB y builds de ~0,6 MB: caben de uno en uno.
    process.env.PLAY_CACHE_MB = '1'
    const big = { 'index.html': 'x'.repeat(600 * 1024) }
    getObjectBuffer.mockImplementation(async () => makeZip(big))

    await play.loadBuild('a.zip')
    await play.loadBuild('b.zip')
    await play.loadBuild('b.zip')
    await play.loadBuild('a.zip')

    expect(getObjectBuffer.mock.calls.map(c => c[0])).toEqual(['a.zip', 'b.zip', 'a.zip'])
  })

  it('vuelve a descargar un build olvidado', async () => {
    getObjectBuffer.mockResolvedValue(makeZip(BUILD))

    await play.loadBuild('k/game.zip')
    play.forgetBuild('k/game.zip')
    await play.loadBuild('k/game.zip')

    expect(getObjectBuffer).toHaveBeenCalledTimes(2)
  })
})

describe('findFile', () => {
  it('resuelve las rutas relativas a la carpeta del build', async () => {
    getObjectBuffer.mockResolvedValue(makeZip({
      'MiJuego/index.html': 'html',
      'MiJuego/Build/Juego.data': 'data',
    }))
    const build = await play.loadBuild('k/nested.zip')

    expect(play.findFile(build, 'Build/Juego.data').name).toBe('MiJuego/Build/Juego.data')
    expect(play.isEntryPage(build, 'MiJuego/index.html')).toBe(true)
  })

  it('ignora las entradas __MACOSX y devuelve null si el archivo no existe', async () => {
    getObjectBuffer.mockResolvedValue(makeZip({ ...BUILD, '__MACOSX/._index.html': 'meta' }))
    const build = await play.loadBuild('k/game.zip')

    expect(build.files.has('__MACOSX/._index.html')).toBe(false)
    expect(play.findFile(build, 'Build/no-existe.js')).toBeNull()
  })
})

describe('injectProgressReporter', () => {
  it('inserta el script al principio del <head>', () => {
    const html = play.injectProgressReporter('<html><head lang="es"><title>J</title></head></html>')

    expect(html).toMatch(/^<html><head lang="es"><script>/)
    expect(html).toContain("source = 'gameploy-player'")
    expect(html).toContain('<title>J</title>')
  })

  it('lo antepone al documento si no hay <head>', () => {
    expect(play.injectProgressReporter('<canvas></canvas>')).toMatch(/^<script>[\s\S]*<\/script><canvas>/)
  })
})

describe('contentTypeFor', () => {
  it('sirve el wasm y el manifest con su tipo', () => {
    expect(play.contentTypeFor('Build/a.wasm')).toBe('application/wasm')
    expect(play.contentTypeFor('manifest.webmanifest')).toBe('application/manifest+json')
    expect(play.contentTypeFor('raro.xyz')).toBe('application/octet-stream')
  })
})
