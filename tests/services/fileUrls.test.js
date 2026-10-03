jest.mock('../../src/services/storage.service', () => ({
  getPresignedUrl: jest.fn(async (key) => `https://bucket.test/${key}?firma`),
}))

const { withFileUrls } = require('../../src/services/fileUrls')

const BUILD = { id: 'a1', tipo: 'juego_webgl', ruta_storage: 'k/game.zip', ruta_publica: 'builds/b1/', manifiesto: { files: [] } }
const COVER = { id: 'a2', tipo: 'portada', ruta_storage: 'k/cover.png', ruta_publica: 'media/m1/cover.png' }
const LEGACY_IMAGE = { id: 'a3', tipo: 'captura', ruta_storage: 'k/old.png', ruta_publica: null }
const LEGACY_BUILD = { id: 'a4', tipo: 'juego_webgl', ruta_storage: 'k/old.zip', ruta_publica: null }

const project = () => ({
  id: 'p1',
  versiones: [{ id: 'v1', archivos: [{ ...BUILD }, { ...COVER }, { ...LEGACY_IMAGE }, { ...LEGACY_BUILD }] }],
})

beforeEach(() => {
  process.env.CDN_URL = 'https://cdn.test'
  process.env.CDN_SIGNING_SECRET = 's'
})

describe('withFileUrls', () => {
  it('añade play_url al juego y url a las imágenes publicadas, firmadas', async () => {
    const data = await withFileUrls(project())
    const [build, cover] = data.versiones[0].archivos

    expect(build.play_url).toMatch(/^https:\/\/cdn\.test\/t\/\d+\.[\w-]+\/builds\/b1\/index\.html$/)
    expect(cover.url).toMatch(/^https:\/\/cdn\.test\/t\/\d+\.[\w-]+\/media\/m1\/cover\.png$/)
  })

  it('a las imágenes sin publicar les da una URL firmada del bucket; a los juegos sin publicar, nada', async () => {
    const [, , legacyImage, legacyBuild] = (await withFileUrls(project())).versiones[0].archivos

    expect(legacyImage.url).toBe('https://bucket.test/k/old.png?firma')
    expect(legacyBuild.play_url).toBeUndefined()
  })

  it('no expone claves internas ni el manifiesto', async () => {
    const archivos = (await withFileUrls(project())).versiones[0].archivos

    for (const a of archivos) {
      expect(a).not.toHaveProperty('ruta_storage')
      expect(a).not.toHaveProperty('ruta_publica')
      expect(a).not.toHaveProperty('manifiesto')
    }
  })

  it('funciona con listas, archivos sueltos y respuestas sin archivos', async () => {
    const list = await withFileUrls([project(), project()])
    expect(list[1].versiones[0].archivos[0].play_url).toBeDefined()

    const single = await withFileUrls({ ...COVER })
    expect(single.url).toBeDefined()

    expect(await withFileUrls({ id: 'x', fecha: new Date(0) })).toEqual({ id: 'x', fecha: new Date(0) })
  })
})
