/**
 * nanoid 5 solo se publica como ESM y Jest carga el proyecto como CommonJS.
 * Este doble genera identificadores con la misma forma, suficiente para probar
 * la lógica de los slugs, que es lo nuestro.
 */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_'

const nanoid = (size = 21) =>
  Array.from({ length: size }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')

module.exports = { nanoid }
