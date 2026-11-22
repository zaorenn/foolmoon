import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createRightCtrlGestureMachine } from './right-ctrl-gesture'

describe('Right Ctrl Notch gesture state machine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('activates Notch on 1 press, starts/stops PTT on hold when active, and closes on 2 quick presses', () => {
    let active = false

    const onActivateNotch = vi.fn(() => {
      active = true
    })

    const onCloseNotch = vi.fn(() => {
      active = false
    })

    const onPttStart = vi.fn()
    const onPttStop = vi.fn()

    const machine = createRightCtrlGestureMachine(
      {
        isNotchActive: () => active,
        onActivateNotch,
        onCloseNotch,
        onPttStart,
        onPttStop
      },
      { doubleTapMs: 360, holdMs: 260 }
    )

    // 1 press activates Notch
    machine.onKeyDown(1000)
    machine.onKeyUp(1080)
    expect(onActivateNotch).toHaveBeenCalledTimes(1)
    expect(active).toBe(true)

    // Wait past double-tap window, then hold Right Ctrl -> Push-to-Talk
    vi.advanceTimersByTime(500)
    machine.onKeyDown(1600)
    vi.advanceTimersByTime(260)
    expect(onPttStart).toHaveBeenCalledTimes(1)
    machine.onKeyUp(2100)
    expect(onPttStop).toHaveBeenCalledTimes(1)
    expect(onCloseNotch).not.toHaveBeenCalled()

    // 2 quick presses close the Notch
    machine.onKeyDown(3000)
    machine.onKeyUp(3060)
    machine.onKeyDown(3140)
    machine.onKeyUp(3200)
    expect(onCloseNotch).toHaveBeenCalledTimes(1)
    expect(active).toBe(false)

    machine.dispose()
  })

  it('ignores chords like RightCtrl+C so normal OS shortcuts never trigger Notch or PTT', () => {
    let active = false

    const onActivateNotch = vi.fn(() => {
      active = true
    })

    const onCloseNotch = vi.fn()
    const onPttStart = vi.fn()
    const onPttStop = vi.fn()

    const machine = createRightCtrlGestureMachine({
      isNotchActive: () => active,
      onActivateNotch,
      onCloseNotch,
      onPttStart,
      onPttStop
    })

    machine.onKeyDown(1000)
    machine.onOtherKeyDown()
    machine.onKeyUp(1090)

    expect(onActivateNotch).not.toHaveBeenCalled()
    expect(onCloseNotch).not.toHaveBeenCalled()
    expect(onPttStart).not.toHaveBeenCalled()
    expect(onPttStop).not.toHaveBeenCalled()

    machine.dispose()
  })
})
