import assert from 'node:assert/strict'

import { test } from 'vitest'

import { NOTCH_MAX_WIDTH, NOTCH_WINDOW_HEIGHT, notchWindowBounds } from './hermes-notch'
import { zoomWiringForWindowKind } from './zoom'

test('notchWindowBounds centers at top of display with capped width', () => {
  const b1 = notchWindowBounds({ bounds: { height: 1440, width: 2560, x: 0, y: 0 } })
  assert.equal(b1.width, NOTCH_MAX_WIDTH)
  assert.equal(b1.height, NOTCH_WINDOW_HEIGHT)
  assert.equal(b1.x, Math.round((2560 - NOTCH_MAX_WIDTH) / 2))
  assert.equal(b1.y, 0)

  const b2 = notchWindowBounds({ bounds: { height: 1080, width: 1024, x: 1920, y: 100 } })
  assert.equal(b2.width, 1024)
  assert.equal(b2.x, 1920)
  assert.equal(b2.y, 100)
})

test('notch opts out of global UI zoom scaling', () => {
  assert.deepEqual(zoomWiringForWindowKind('notch'), { zoom: false })
})
