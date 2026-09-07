// Jest setup file for global test configuration

// Set NODE_ENV to test
process.env.NODE_ENV = 'test';

// Suppress console logs during tests (optional - comment out to see logs)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// Set default test timeout
jest.setTimeout(10000);
