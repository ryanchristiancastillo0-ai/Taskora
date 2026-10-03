// Jest configuration for the Taskora backend.
//
// Scoped deliberately. `tests/*.test.js` (the flat files at the top of the
// folder) are the pre-existing node:assert scripts driven by tests/runAll.js —
// they are not Jest suites and Jest would fail every one of them with "Your test
// suite must contain at least one test". The pattern below therefore matches
// only test files inside a tests/<area>/ folder, which is where the new suites
// live. The old runner is still available as `npm run test:legacy`.

module.exports = {
  testEnvironment: "node",

  // `tests/<area>/**/*.test.js`
  testMatch: ["<rootDir>/tests/*/**/*.test.js"],

  setupFiles: [
    "<rootDir>/tests/jest/setup/testEnv.js",
    "<rootDir>/tests/jest/setup/mocks.js",
  ],

  // The double is shared per test file, so clearMocks would only clear the
  // mocks it happens to own. Each suite resets the store in beforeEach instead.
  clearMocks: false,

  // bcrypt at 12 rounds is deliberately slow, and these suites run through the
  // real password path. 20s per file is still far above what any of them needs.
  testTimeout: 20000,

  collectCoverageFrom: [
    "src/controllers/**/*.js",
    "src/middleware/**/*.js",
    "src/validators/**/*.js",
    "src/utils/**/*.js",
    "src/services/audit/**/*.js",
    "!src/**/node_modules/**",
  ],

  coveragePathIgnorePatterns: ["/node_modules/"],

  verbose: true,
};
