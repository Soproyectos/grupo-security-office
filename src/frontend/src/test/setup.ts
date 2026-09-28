import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Testing Library's auto-cleanup relies on detecting global test hooks
// (afterEach); explicit setup avoids relying on that detection and keeps
// each render test isolated (no leftover DOM from a previous test).
afterEach(() => {
  cleanup()
})
