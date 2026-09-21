module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/setup.js'],
  moduleNameMapper: {
    // nanoid 5 es ESM puro; ver tests/__mocks__/nanoid.js
    '^nanoid$': '<rootDir>/tests/__mocks__/nanoid.js',
  },
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/config/**',
  ],
  clearMocks: true,
}
