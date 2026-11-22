import { pathToFileURL } from 'node:url'

import { BrowserWindow, desktopCapturer, type GlobalShortcut, ipcMain, screen } from 'electron'

import { petOverlayClickThrough } from './pet-overlay'
import { attachRendererConsoleCapture } from './renderer-log'
import { createRightCtrlMonitor, type RightCtrlMonitor } from './right-ctrl-monitor'
import { installWindowRendererLifecycle } from './window-renderer-lifecycle'

export interface NotchRect {
  height: number
  width: number
  x: number
  y: number
}

export interface NotchWindowControllerOptions {
  devServer?: string
  getMainWindow: () => BrowserWindow | null
  globalShortcut: GlobalShortcut
  isMac: boolean
  loadWindowUrl: (window: BrowserWindow, url: string, label: string) => void
  log: (message: string) => void
  preloadPath: string
  rendererIndex: () => string
  wireWindow: (window: BrowserWindow) => void
}

export const NOTCH_DEFAULT_SHORTCUT = 'CommandOrControl+Shift+N'
export const NOTCH_WINDOW_HEIGHT = 300
export const NOTCH_MAX_WIDTH = 1320

export function notchWindowBounds(display: {
  bounds: { height: number; width: number; x: number; y: number }
}): NotchRect {
  const width = Math.min(Math.max(640, Math.round(display.bounds.width)), NOTCH_MAX_WIDTH)
  const x = Math.round(display.bounds.x + (display.bounds.width - width) / 2)
  const y = Math.round(display.bounds.y)

  return { height: NOTCH_WINDOW_HEIGHT, width, x, y }
}

export function createHermesNotchController({
  devServer,
  getMainWindow,
  globalShortcut,
  isMac,
  loadWindowUrl,
  log,
  preloadPath,
  rendererIndex,
  wireWindow
}: NotchWindowControllerOptions) {
  let notchWindow: BrowserWindow | null = null
  let visible = false
  let focusable = false
  let spotlightActive = false
  let ignoreMouse = true
  let hitRect: NotchRect | null = null
  let lastState: unknown = null
  let cursorTimer: NodeJS.Timeout | null = null
  let ipcRegistered = false
  let shortcutRegistered = false

  const url = () => {
    if (devServer) {
      return `${devServer.endsWith('/') ? devServer.slice(0, -1) : devServer}/?win=notch#/`
    }

    return `${pathToFileURL(rendererIndex()).toString()}?win=notch#/`
  }

  const targetDisplay = () => {
    const main = getMainWindow()

    try {
      if (main && !main.isDestroyed()) {
        return screen.getDisplayMatching(main.getBounds())
      }
    } catch {
      // Fallback to primary display below.
    }

    return screen.getPrimaryDisplay()
  }

  const reposition = () => {
    if (!notchWindow || notchWindow.isDestroyed()) {
      return
    }

    const display = targetDisplay()
    notchWindow.setBounds(spotlightActive ? display.bounds : notchWindowBounds(display))
  }

  const updateIgnoreMouse = (nextIgnore: boolean) => {
    if (!notchWindow || notchWindow.isDestroyed()) {
      return
    }

    const canClickThrough = petOverlayClickThrough()

    if (nextIgnore && !canClickThrough) {
      return
    }

    if (ignoreMouse === nextIgnore) {
      return
    }

    ignoreMouse = nextIgnore

    try {
      if (nextIgnore) {
        notchWindow.setIgnoreMouseEvents(true, { forward: true })
      } else {
        notchWindow.setIgnoreMouseEvents(false)
      }
    } catch {
      // Best effort across OS compositors.
    }
  }

  const stopCursorLoop = () => {
    if (cursorTimer) {
      clearInterval(cursorTimer)
      cursorTimer = null
    }
  }

  const startCursorLoop = () => {
    if (cursorTimer) {
      return
    }

    cursorTimer = setInterval(() => {
      if (!notchWindow || notchWindow.isDestroyed() || !visible) {
        return
      }

      try {
        const pt = screen.getCursorScreenPoint()
        const bounds = notchWindow.getBounds()
        const relX = pt.x - bounds.x
        const relY = pt.y - bounds.y

        if (hitRect && !focusable) {
          const inside =
            relX >= hitRect.x - 4 &&
            relX <= hitRect.x + hitRect.width + 4 &&
            relY >= hitRect.y - 4 &&
            relY <= hitRect.y + hitRect.height + 6

          updateIgnoreMouse(!inside)
        }

        // Broadcast global screen cursor coords normalized relative to top-center
        // so @bwnd/bbot eyes track the pointer anywhere across the monitor.
        const normX = Math.max(-1, Math.min(1, (pt.x - (bounds.x + bounds.width / 2)) / 520))
        const normY = Math.max(-1, Math.min(1, (pt.y - (bounds.y + 28)) / 420))

        notchWindow.webContents.send('hermes:notch:cursor', {
          inside: Boolean(
            hitRect &&
              relX >= hitRect.x &&
              relX <= hitRect.x + hitRect.width &&
              relY >= hitRect.y &&
              relY <= hitRect.y + hitRect.height
          ),
          normX,
          normY,
          screenX: pt.x,
          screenY: pt.y
        })
      } catch {
        // Ignore transient display read errors.
      }
    }, 33)
  }

  const notifyVisibility = () => {
    const state = { open: visible }

    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        try {
          win.webContents.send('hermes:notch:changed', state)
        } catch {
          // Ignore closing windows.
        }
      }
    }
  }

  const sendStateToNotch = () => {
    if (!notchWindow || notchWindow.isDestroyed() || !lastState) {
      return
    }

    notchWindow.webContents.send('hermes:notch:state', lastState)
  }

  const spawn = () => {
    const bounds = notchWindowBounds(targetDisplay())

    const win = new BrowserWindow({
      ...bounds,
      alwaysOnTop: true,
      backgroundColor: '#00000000',
      focusable: false,
      frame: false,
      fullscreenable: false,
      hasShadow: false,
      hiddenInMissionControl: isMac,
      maximizable: false,
      minimizable: false,
      movable: false,
      resizable: false,
      show: false,
      skipTaskbar: true,
      transparent: true,
      type: isMac ? 'panel' : undefined,
      webPreferences: {
        backgroundThrottling: false,
        contextIsolation: true,
        devTools: true,
        nodeIntegration: false,
        preload: preloadPath,
        sandbox: true
      }
    })

    win.setAlwaysOnTop(true, 'screen-saver')
    win.setHiddenInMissionControl?.(true)

    if (petOverlayClickThrough()) {
      win.setIgnoreMouseEvents(true, { forward: true })
    }

    try {
      win.setVisibleOnAllWorkspaces(true, {
        skipTransformProcessType: true,
        visibleOnFullScreen: true
      })
    } catch {
      // Best effort on Linux/older OS.
    }

    wireWindow(win)
    installWindowRendererLifecycle(win, { callbacks: { log }, kind: 'notch' })
    attachRendererConsoleCapture(win, 'notch', log)

    win.webContents.on('did-finish-load', () => {
      sendStateToNotch()

      if (!win.isDestroyed() && visible && !win.isVisible()) {
        win.showInactive()
        startCursorLoop()
      }
    })
    win.once('ready-to-show', () => {
      if (!win.isDestroyed() && visible) {
        win.showInactive()
        startCursorLoop()
      }
    })
    win.on('closed', () => {
      stopCursorLoop()

      if (notchWindow === win) {
        notchWindow = null
      }

      if (visible) {
        visible = false
        notifyVisibility()
      }
    })

    loadWindowUrl(win, url(), 'Foolmoon Notch')

    return win
  }

  const show = () => {
    visible = true

    if (!notchWindow || notchWindow.isDestroyed()) {
      notchWindow = spawn()
    } else {
      reposition()
      notchWindow.showInactive()
      startCursorLoop()
    }

    notifyVisibility()

    return { ok: true, open: true }
  }

  const hide = () => {
    visible = false
    focusable = false
    stopCursorLoop()

    if (notchWindow && !notchWindow.isDestroyed()) {
      try {
        notchWindow.setFocusable(false)
      } catch {
        // Ignore if closing.
      }

      notchWindow.hide()
    }

    notifyVisibility()

    return { ok: true, open: false }
  }

  const toggle = () => (visible ? hide() : show())

  const focusMainWindow = () => {
    const main = getMainWindow()

    if (!main || main.isDestroyed()) {
      return { ok: false }
    }

    if (main.isMinimized()) {
      main.restore()
    }

    main.show()
    main.focus()

    return { ok: true }
  }

  const registerIpc = () => {
    if (ipcRegistered) {
      return
    }

    ipcRegistered = true

    ipcMain.handle('hermes:notch:get-state', () => ({ open: visible }))
    ipcMain.handle('hermes:notch:open', () => show())
    ipcMain.handle('hermes:notch:close', () => hide())
    ipcMain.handle('hermes:notch:toggle', () => toggle())
    ipcMain.handle('hermes:notch:set-visible', (_event, nextVisible: boolean) =>
      nextVisible ? show() : hide()
    )
    ipcMain.handle('hermes:notch:focus-main', () => focusMainWindow())
    ipcMain.handle('hermes:notch:capture-screen', async () => {
      try {
        const display = screen.getPrimaryDisplay()
        const { height, width } = display.bounds
        const maxW = Math.min(1600, Math.max(640, width))
        const maxH = Math.min(900, Math.max(360, height))

        const sources = await desktopCapturer.getSources({
          thumbnailSize: { height: maxH, width: maxW },
          types: ['screen']
        })

        const primaryId = String(display.id)
        const source = sources.find(s => s.display_id === primaryId) ?? sources[0]

        if (!source) {
          return null
        }

        const thumb = source.thumbnail

        if (thumb.isEmpty()) {
          return null
        }

        const size = thumb.getSize()

        return {
          dataUrl: thumb.toDataURL(),
          height: size.height,
          name: `screen-${Date.now()}.png`,
          width: size.width
        }
      } catch (err) {
        log(`notch capture-screen failed: ${err instanceof Error ? err.message : String(err)}`)

        return null
      }
    })

    ipcMain.on('hermes:notch:set-hit-rect', (_event, rect: NotchRect | null) => {
      if (
        rect &&
        Number.isFinite(rect.x) &&
        Number.isFinite(rect.y) &&
        Number.isFinite(rect.width) &&
        Number.isFinite(rect.height)
      ) {
        hitRect = rect
      } else {
        hitRect = null
      }
    })

    ipcMain.on('hermes:notch:set-focusable', (_event, nextFocusable: boolean) => {
      focusable = Boolean(nextFocusable)

      if (!notchWindow || notchWindow.isDestroyed()) {
        return
      }

      try {
        notchWindow.setFocusable(focusable)

        if (focusable) {
          updateIgnoreMouse(false)
          notchWindow.focus()
        }
      } catch {
        // Ignore platform panel restrictions.
      }
    })

    ipcMain.on('hermes:notch:set-spotlight', (_event, active: boolean) => {
      const next = Boolean(active)

      if (spotlightActive === next) {
        return
      }

      spotlightActive = next
      reposition()

      if (spotlightActive) {
        updateIgnoreMouse(true)
      }
    })

    ipcMain.on('hermes:notch:push-state', (_event, payload: unknown) => {
      lastState = payload
      sendStateToNotch()
    })

    ipcMain.on('hermes:notch:command', (_event, command: unknown) => {
      const main = getMainWindow()

      if (main && !main.isDestroyed()) {
        main.webContents.send('hermes:notch:command', command)
      }
    })
  }

  let rightCtrlMonitor: RightCtrlMonitor | null = null

  const sendHotkeyAction = (action: 'activate' | 'close') => {
    if (notchWindow && !notchWindow.isDestroyed()) {
      notchWindow.webContents.send('hermes:notch:hotkey-action', { action })
    }
  }

  const sendCommandToMain = (command: unknown) => {
    const main = getMainWindow()

    if (main && !main.isDestroyed()) {
      main.webContents.send('hermes:notch:command', command)
    }
  }

  const registerShortcut = () => {
    if (shortcutRegistered) {
      return
    }

    try {
      shortcutRegistered = globalShortcut.register(NOTCH_DEFAULT_SHORTCUT, () => {
        toggle()
      })
    } catch {
      shortcutRegistered = false
    }

    if (!rightCtrlMonitor) {
      rightCtrlMonitor = createRightCtrlMonitor(
        {
          isNotchActive: () => visible,
          onActivateNotch: () => {
            show()
            sendHotkeyAction('activate')
          },
          onCloseNotch: () => {
            sendHotkeyAction('close')
            hide()
          },
          onPttStart: () => {
            sendCommandToMain({ type: 'ptt-start' })
          },
          onPttStop: () => {
            sendCommandToMain({ type: 'ptt-stop' })
          }
        },
        log
      )
      rightCtrlMonitor.start()
    }
  }

  const dispose = () => {
    stopCursorLoop()

    if (rightCtrlMonitor) {
      rightCtrlMonitor.dispose()
      rightCtrlMonitor = null
    }

    if (shortcutRegistered) {
      try {
        globalShortcut.unregister(NOTCH_DEFAULT_SHORTCUT)
      } catch {
        // Ignore during quit.
      }

      shortcutRegistered = false
    }

    if (notchWindow && !notchWindow.isDestroyed()) {
      notchWindow.removeAllListeners('closed')
      notchWindow.destroy()
      notchWindow = null
    }
  }

  return {
    close: hide,
    dispose,
    focusMainWindow,
    getState: () => ({ open: visible }),
    getWindow: () => notchWindow,
    open: show,
    registerIpc,
    registerShortcut,
    reposition,
    setVisible: (next: boolean) => (next ? show() : hide()),
    toggle
  }
}
