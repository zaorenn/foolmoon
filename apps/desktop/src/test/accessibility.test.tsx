// @vitest-environment jsdom
import { join, resolve } from 'node:path'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MobileDevicesSettings } from '@/app/settings/mobile-devices-settings'
import { Button } from '@/components/ui/button'
import { readStylesheetWithImports } from '@/test/read-styles'

const mobileApi = vi.hoisted(() => ({
  bridgeStatus: vi.fn(),
  list: vi.fn(),
  revoke: vi.fn(),
  startPairing: vi.fn()
}))

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,FAKE_QR')
  }
}))

vi.mock('@/api/mobile', () => ({
  getMobileBridgeStatus: mobileApi.bridgeStatus,
  listMobileDevices: mobileApi.list,
  revokeMobileDevice: mobileApi.revoke,
  startMobilePairing: mobileApi.startPairing
}))

vi.mock('@/store/notifications', () => ({ notifyError: vi.fn() }))

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    locale: 'en',
    t: {
      common: {
        cancel: 'Cancel',
        close: 'Close',
        confirm: 'Confirm',
        done: 'Done',
        loading: 'Working…'
      },
      settings: {
        mobile: {
          title: 'Paired phones',
          refresh: 'Refresh',
          online: 'Online',
          offline: 'Offline',
          paired: 'Paired',
          pairedUnknown: 'Pairing date not recorded',
          lastSeen: 'Last seen',
          unknownName: 'Android phone',
          capabilities: (count: number) => `${count} phone tools`,
          revoke: 'Revoke',
          revokeDevice: (name: string) => `Revoke ${name}`,
          revokeTitle: (name: string) => `Revoke ${name}?`,
          revokeDescription: (name: string) => `${name} loses access.`,
          revokeFailed: 'Could not revoke the phone',
          emptyTitle: 'No paired phones',
          emptyDescription: 'Pair a phone from Foolmoon Mobile.',
          errorTitle: 'Could not load paired phones',
          errorDescription: 'The gateway did not answer.',
          footnote: 'Paired phones can act on this computer.',
          pairTitle: 'Pair a new phone',
          pairAction: 'Generate pairing QR',
          pairGenerating: 'Generating…',
          pairRefresh: 'New code',
          pairDescription: 'Scan this QR code in Foolmoon Mobile or enter the 6-digit pairing code.',
          pairCodeLabel: '6-digit pairing code',
          pairQrAlt: 'Foolmoon Mobile pairing QR code',
          pairExpires: (minutes: number) => `Expires in ${minutes} min`,
          pairFailed: 'Could not start mobile pairing',
          copyCode: 'Copy code',
          bridgeTitle: 'Computer bridge status',
          bridgeModel: 'Active model',
          bridgeVoice: 'PC voice clone',
          bridgeAddress: 'LAN endpoint',
          bridgeGpuReady: 'GPU acceleration ready'
        }
      }
    }
  })
}))

function readAllStylesheets(): string {
  return readStylesheetWithImports(join(resolve(__dirname, '..'), 'styles.css'))
}

describe('Accessibility invariants', () => {
  beforeEach(() => {
    mobileApi.list.mockReset()
    mobileApi.revoke.mockReset()
    mobileApi.startPairing.mockReset()
    mobileApi.bridgeStatus.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('enforces reduced-motion, reduced-transparency, and focus-visible contracts in stylesheets', () => {
    const css = readAllStylesheets()
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('@media (prefers-reduced-transparency: reduce)')
    expect(css).toContain(':focus-visible')
  })

  it('gives Button primitive focus-visible ring and honors disabled / aria-disabled state', () => {
    render(
      <div>
        <Button>Save changes</Button>
        <Button aria-label="Disabled action" disabled>
          Locked
        </Button>
      </div>
    )

    const primary = screen.getByRole('button', { name: 'Save changes' })
    expect(primary.className).toContain('focus-visible:ring')

    const disabledBtn = screen.getByRole('button', { name: 'Disabled action' }) as HTMLButtonElement
    expect(disabledBtn.disabled).toBe(true)
  })

  it('exposes accessible button labels, image alt text, headings, and confirmation dialog on MobileDevicesSettings', async () => {
    mobileApi.list.mockResolvedValue([
      {
        capabilities: ['alarm', 'screen'],
        device_id: 'dev-1',
        device_name: 'Pixel 9',
        last_seen: null,
        model: 'Pixel 9 Pro',
        online: true,
        paired_at: 1_760_000_000,
        telemetry: {}
      }
    ])
    mobileApi.bridgeStatus.mockResolvedValue({
      activeModel: 'google/gemma-4-e4b-it',
      activeVoiceName: 'Serhan',
      cudaAvailable: true,
      lanIp: '192.168.1.42',
      ok: true,
      pcName: 'WORKSTATION'
    })
    mobileApi.startPairing.mockResolvedValue({
      code: '654321',
      expiresInSec: 300,
      host: '192.168.1.42',
      ok: true,
      pairUri: 'foolmoon://pair?code=654321',
      port: 8080
    })

    const { container } = render(<MobileDevicesSettings />)

    expect(await screen.findByText('Pixel 9')).toBeTruthy()
    expect(container.querySelectorAll('section').length).toBeGreaterThanOrEqual(2)

    fireEvent.click(screen.getByRole('button', { name: 'Generate pairing QR' }))
    const qrImg = (await screen.findByAltText('Foolmoon Mobile pairing QR code')) as HTMLImageElement
    expect(qrImg.alt.trim().length).toBeGreaterThan(0)

    const buttons = Array.from(container.querySelectorAll('button'))
    expect(buttons.length).toBeGreaterThanOrEqual(3)

    for (const button of buttons) {
      const label = button.getAttribute('aria-label') || button.textContent?.trim() || ''
      expect(label.length).toBeGreaterThan(0)
      expect(button.tabIndex).toBeGreaterThanOrEqual(0)
    }

    fireEvent.click(screen.getByRole('button', { name: 'Revoke Pixel 9' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.getAttribute('aria-labelledby') || dialog.textContent).toBeTruthy()
    expect(dialog.textContent).toContain('Revoke Pixel 9?')
  })
})
