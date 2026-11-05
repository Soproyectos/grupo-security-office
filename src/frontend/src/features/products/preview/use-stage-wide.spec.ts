import { describe, expect, it } from 'vitest'
import { createElement, useRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { STAGE_WIDE_MIN, isWideStage, useStageWide } from './use-stage-wide'

describe('isWideStage', () => {
  it('is wide from 1240px on and narrow below it', () => {
    expect(STAGE_WIDE_MIN).toBe(1240)
    expect(isWideStage(1239)).toBe(false)
    expect(isWideStage(1240)).toBe(true)
    expect(isWideStage(1241)).toBe(true)
  })

  it('compares against the minimum it is given', () => {
    expect(isWideStage(999, 1000)).toBe(false)
    expect(isWideStage(1000, 1000)).toBe(true)
    expect(isWideStage(1239, 1000)).toBe(true)
  })
})

/** Renders a stage that reports the hook's answer as its data attribute. */
function Probe() {
  const ref = useRef<HTMLDivElement>(null)
  const wide = useStageWide(ref)
  return createElement('div', { ref, 'data-wide': wide ? 'true' : 'false' })
}

describe('useStageWide', () => {
  it('renders narrow on the server without throwing, since effects never run there', () => {
    expect(renderToStaticMarkup(createElement(Probe))).toBe('<div data-wide="false"></div>')
  })
})
