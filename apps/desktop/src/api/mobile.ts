// Foolmoon Mobile pairing surface. The backend owns the paired-device registry
// (`hermes_cli/web_routers/mobile_bridge.py`); this module is only the typed
// client, so the Settings page never hand-builds a request path.
//
// Advisory contract: an older backend without the mobile router answers 404.
// `listMobileDevices` surfaces that as an error the page renders as "needs a
// newer backend", never as an empty device list.

import type { ProfileScope } from './client'
import { capabilityScoped, hermesApi } from './client'

export interface MobileDevice {
  device_id: string
  device_name: string
  model: string
  /** Unix seconds when the pair completed; absent for rows written by older builds. */
  paired_at?: number | null
  capabilities: string[]
  online: boolean
  telemetry: Record<string, unknown>
  last_seen?: number | null
}

interface MobileDevicesResponse {
  ok: boolean
  devices?: MobileDevice[]
}

export interface MobilePairStartResponse {
  ok: boolean
  code: string
  host: string
  port: number
  expiresInSec: number
  pairUri: string
}

export interface MobileBridgeStatus {
  ok: boolean
  pcName: string
  lanIp: string
  activeModel: string
  activeVoiceName?: string
  activeVoiceId?: string
  ttsEngine?: string
  cudaAvailable?: boolean
  connectedDevices?: MobileDevice[]
}

export async function listMobileDevices(profile?: ProfileScope): Promise<MobileDevice[]> {
  const response = await hermesApi<MobileDevicesResponse>({
    ...capabilityScoped(profile),
    path: '/api/mobile/devices'
  })

  return response.devices ?? []
}

export async function revokeMobileDevice(deviceId: string, profile?: ProfileScope): Promise<boolean> {
  const response = await hermesApi<{ ok: boolean; removed?: boolean }>({
    ...capabilityScoped(profile),
    path: `/api/mobile/devices/${encodeURIComponent(deviceId)}`,
    method: 'DELETE'
  })

  return response.removed !== false
}

export async function startMobilePairing(profile?: ProfileScope): Promise<MobilePairStartResponse> {
  return hermesApi<MobilePairStartResponse>({
    ...capabilityScoped(profile),
    path: '/api/mobile/pair/start',
    method: 'POST'
  })
}

export async function getMobileBridgeStatus(profile?: ProfileScope): Promise<MobileBridgeStatus> {
  return hermesApi<MobileBridgeStatus>({
    ...capabilityScoped(profile),
    path: '/api/mobile/status'
  })
}
