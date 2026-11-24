import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MobileDevicesSettings } from './mobile-devices-settings'

const api = vi.hoisted(() => ({
  list: vi.fn(),
  revoke: vi.fn(),
  startPairing: vi.fn(),
  bridgeStatus: vi.fn()
}))

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,FAKE_QR')
  }
}))

vi.mock('@/api/mobile', () => ({
  listMobileDevices: api.list,
  revokeMobileDevice: api.revoke,
  startMobilePairing: api.startPairing,
  getMobileBridgeStatus: api.bridgeStatus
}))

vi.mock('@/store/notifications', () => ({ notifyError: vi.fn() }))

// The page's contract is the pairing registry, not the copy deck: a focused
// stub keeps these assertions about state and accessible names, which is what
// regressions actually break.
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

afterEach(cleanup)

beforeEach(() => {
  api.list.mockReset()
  api.revoke.mockReset()
  api.startPairing.mockReset()
  api.bridgeStatus.mockReset()
  api.bridgeStatus.mockRejectedValue(new Error('unavailable'))
})

const pixel = {
  device_id: 'pixel-9',
  device_name: 'Pixel 9',
  model: 'Pixel 9 Pro',
  paired_at: 1_760_000_000,
  capabilities: ['alarm', 'clipboard', 'screen'],
  online: true,
  telemetry: {},
  last_seen: null
}

describe('MobileDevicesSettings', () => {
  it('names the revoke control after the phone it revokes', async () => {
    api.list.mockResolvedValue([pixel])

    render(<MobileDevicesSettings />)

    expect(await screen.findByText('Pixel 9')).toBeTruthy()
    expect(screen.getByText('Online')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Revoke Pixel 9' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy()
  })

  it('shows an offline phone with its last-seen time', async () => {
    api.list.mockResolvedValue([{ ...pixel, online: false, last_seen: 1_760_003_600 }])

    render(<MobileDevicesSettings />)

    expect(await screen.findByText('Offline')).toBeTruthy()
    expect(screen.getByText(/Last seen/)).toBeTruthy()
  })

  it('teaches the pairing step instead of showing an empty shell', async () => {
    api.list.mockResolvedValue([])

    render(<MobileDevicesSettings />)

    expect(await screen.findByText('No paired phones')).toBeTruthy()
    expect(screen.getByText('Pair a phone from Foolmoon Mobile.')).toBeTruthy()
  })

  it('surfaces a gateway that cannot answer the registry, and retries', async () => {
    api.list.mockRejectedValueOnce(new Error('404')).mockResolvedValueOnce([pixel])

    render(<MobileDevicesSettings />)

    expect(await screen.findByText('Could not load paired phones')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(await screen.findByText('Pixel 9')).toBeTruthy()
    expect(api.list).toHaveBeenCalledTimes(2)
  })

  it('revokes through the confirmation dialog and drops the row without a reload', async () => {
    api.list.mockResolvedValue([pixel])
    api.revoke.mockResolvedValue(true)

    render(<MobileDevicesSettings />)

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Pixel 9' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('Revoke Pixel 9?')

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))

    await waitFor(() => expect(api.revoke).toHaveBeenCalledWith('pixel-9'))
    await waitFor(() => expect(screen.queryByText('Pixel 9')).toBeNull())
    expect(api.list).toHaveBeenCalledTimes(1)
  })

  it('generates a scannable pairing QR and 6-digit code and shows PC bridge status', async () => {
    api.list.mockResolvedValue([])
    api.bridgeStatus.mockResolvedValue({
      ok: true,
      pcName: 'SERHAN-PC',
      lanIp: '192.168.1.42',
      activeModel: 'google/gemma-4-e4b-it',
      activeVoiceName: 'Serhan Cloned',
      cudaAvailable: true
    })
    api.startPairing.mockResolvedValue({
      ok: true,
      code: '482910',
      host: '192.168.1.42',
      port: 8080,
      expiresInSec: 300,
      pairUri: 'foolmoon://pair?host=192.168.1.42&port=8080&code=482910'
    })

    render(<MobileDevicesSettings />)

    expect(await screen.findByText('Computer bridge status')).toBeTruthy()
    expect(screen.getByText('google/gemma-4-e4b-it')).toBeTruthy()
    expect(screen.getByText('GPU acceleration ready')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Generate pairing QR' }))

    expect(await screen.findByText('482910')).toBeTruthy()
    const qrImg = screen.getByAltText('Foolmoon Mobile pairing QR code') as HTMLImageElement
    expect(qrImg.src).toContain('data:image/png;base64,FAKE_QR')
    expect(api.startPairing).toHaveBeenCalledTimes(1)
  })
})
