export default {
  rootDir: '..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.test.js'],
  setupFiles: ['<rootDir>/test/setup-env.js'],
  transform: {},
  verbose: true,
  testTimeout: 10000,
};
