export interface RightCtrlGestureCallbacks {
  isNotchActive: () => boolean
  onActivateNotch: () => void
  onCloseNotch: () => void
  onPttStart: () => void
  onPttStop: () => void
}

export interface RightCtrlGestureOptions {
  doubleTapMs?: number
  holdMs?: number
}

export interface RightCtrlGestureMachine {
  dispose: () => void
  onKeyDown: (now?: number) => void
  onKeyUp: (now?: number) => void
  onOtherKeyDown: () => void
}

/**
 * Right Ctrl global gesture state machine for Foolmoon Notch:
 * - 1 quick press: activates / opens the Notch immediately.
 * - Holding Right Ctrl while Notch is active (>= holdMs): activates Push-to-Talk until release.
 * - 2 quick presses within doubleTapMs: closes / hides the Notch.
 * - Any chord with another key (e.g. RightCtrl+C) cancels the gesture cleanly.
 */
export function createRightCtrlGestureMachine(
  callbacks: RightCtrlGestureCallbacks,
  options: RightCtrlGestureOptions = {}
): RightCtrlGestureMachine {
  const holdMs = options.holdMs ?? 260
  const doubleTapMs = options.doubleTapMs ?? 360

  let isDown = false
  let comboUsed = false
  let pttActive = false
  let lastTapAt = 0
  let holdTimer: ReturnType<typeof setTimeout> | null = null

  const clearHoldTimer = () => {
    if (holdTimer !== null) {
      clearTimeout(holdTimer)
      holdTimer = null
    }
  }

  const onKeyDown = (_now = Date.now()) => {
    if (isDown) {
      return
    }

    isDown = true
    comboUsed = false
    pttActive = false
    clearHoldTimer()

    if (callbacks.isNotchActive()) {
      holdTimer = setTimeout(() => {
        holdTimer = null

        if (isDown && !comboUsed && callbacks.isNotchActive()) {
          pttActive = true
          lastTapAt = 0
          callbacks.onPttStart()
        }
      }, holdMs)
    }
  }

  const onOtherKeyDown = () => {
    if (!isDown) {
      return
    }

    comboUsed = true
    clearHoldTimer()

    if (pttActive) {
      pttActive = false
      callbacks.onPttStop()
    }
  }

  const onKeyUp = (now = Date.now()) => {
    if (!isDown) {
      return
    }

    isDown = false
    clearHoldTimer()

    if (comboUsed) {
      comboUsed = false

      return
    }

    if (pttActive) {
      pttActive = false
      lastTapAt = 0
      callbacks.onPttStop()

      return
    }

    // Quick tap (released before holdMs)
    if (lastTapAt > 0 && now - lastTapAt <= doubleTapMs) {
      lastTapAt = 0
      callbacks.onCloseNotch()

      return
    }

    lastTapAt = now

    if (!callbacks.isNotchActive()) {
      callbacks.onActivateNotch()
    } else {
      // Re-focus / expand if already visible on first tap, while keeping double-tap window open.
      callbacks.onActivateNotch()
    }
  }

  const dispose = () => {
    clearHoldTimer()
    isDown = false
    comboUsed = false

    if (pttActive) {
      pttActive = false
      callbacks.onPttStop()
    }
  }

  return { dispose, onKeyDown, onKeyUp, onOtherKeyDown }
}
