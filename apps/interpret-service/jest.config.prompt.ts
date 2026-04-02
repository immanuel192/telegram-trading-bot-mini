/**
 * Jest configuration for prompt testing
 * Only runs tests in test/prompts/ directory
 * Requires AI_GEMINI_API_KEY environment variable
 */
export default {
  displayName: 'interpret-service-prompts',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/interpret-service/prompts',
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  testMatch: ['<rootDir>/test/prompts/**/*.spec.ts'],
};
