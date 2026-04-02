export default {
  displayName: 'trade-manager',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/trade-manager',
  coveragePathIgnorePatterns: ['/node_modules/', '/sentry\\.ts$'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  maxWorkers: 1, // Run tests sequentially to avoid Redis stream conflicts
};
