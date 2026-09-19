import '@testing-library/jest-dom/vitest'
import { MotionGlobalConfig } from 'framer-motion'

// jsdom doesn't implement ResizeObserver, which @xyflow/react relies on to
// measure the pane and nodes. A no-op stub is enough for render/interaction
// tests that don't assert on measured layout.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!('ResizeObserver' in globalThis)) {
  // test-only polyfill
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}

// jsdom doesn't implement IntersectionObserver either, and that one is not
// merely missing — it is actively destructive here. Floating UI's
// `autoUpdate` watches the reference element with an IntersectionObserver;
// with none available it falls back to re-measuring on every animation
// frame, and because jsdom reports every rect as 0×0 that fallback never
// converges. Opening the Add menu spun that loop for ~50 seconds per test,
// which is what made these specs look like they were "failing on
// animations". A stub that simply never reports a change ends it.
class IntersectionObserverStub {
  root = null
  rootMargin = ''
  thresholds: number[] = []
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

if (!('IntersectionObserver' in globalThis)) {
  globalThis.IntersectionObserver =
    IntersectionObserverStub as unknown as typeof IntersectionObserver
}

if (!('DOMMatrixReadOnly' in globalThis)) {
  // @xyflow/react also touches DOMMatrix during viewport transforms.
  // @ts-expect-error — test-only polyfill
  globalThis.DOMMatrixReadOnly = class {
    m22 = 1
  }
}

// Framer Motion drives every animation off requestAnimationFrame, which
// jsdom advances on a timer rather than a compositor. An AnimatePresence
// exit therefore never finishes and the element it is unmounting lingers in
// the DOM. Skipping animations makes every enter/exit resolve at once; the
// tests assert on state and markup, never on tweened values.
MotionGlobalConfig.skipAnimations = true
