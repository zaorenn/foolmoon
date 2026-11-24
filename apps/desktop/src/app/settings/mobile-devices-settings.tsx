import QRCode from 'qrcode'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  getMobileBridgeStatus,
  listMobileDevices,
  type MobileBridgeStatus,
  type MobileDevice,
  type MobilePairStartResponse,
  revokeMobileDevice,
  startMobilePairing
} from '@/api/mobile'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { Check, Copy, Cpu, QrCode, RefreshCw, Smartphone, Trash2 } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { notifyError } from '@/store/notifications'

import { EmptyState, ListRow, Pill, SettingsContent, SettingsSection, SettingsSkeleton } from './primitives'

// Paired Android phones (Foolmoon Mobile) are a backend registry, not renderer
// state: the list is re-read on every open and after every revoke so two
// surfaces (this page, the phone) cannot disagree about what is paired.
// The copy names the phone the user knows, never the device id.
type LoadState = 'loading' | 'ready' | 'error'

function deviceLabel(device: MobileDevice, fallback: string): string {
  return device.device_name.trim() || device.model.trim() || fallback
}

function formatWhen(seconds: number | null | undefined, locale: string): string {
  if (!seconds) {
    return ''
  }

  // Backend stamps unix seconds; tolerate milliseconds from an older build.
  const millis = seconds > 1e12 ? seconds : seconds * 1000

  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(millis))
}

export function MobileDevicesSettings() {
  const { t, locale } = useI18n()
  const s = t.settings.mobile
  const [state, setState] = useState<LoadState>('loading')
  const [devices, setDevices] = useState<MobileDevice[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<MobileDevice | null>(null)
  const [bridgeStatus, setBridgeStatus] = useState<MobileBridgeStatus | null>(null)
  const [pairing, setPairing] = useState<MobilePairStartResponse | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [pairingBusy, setPairingBusy] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)

    try {
      const [loadedDevices, status] = await Promise.all([
        listMobileDevices(),
        typeof getMobileBridgeStatus === 'function' ? getMobileBridgeStatus().catch(() => null) : Promise.resolve(null)
      ])

      setDevices(loadedDevices)
      setBridgeStatus(status)
      setState('ready')
    } catch {
      setState('error')
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const beginPairing = useCallback(async () => {
    if (typeof startMobilePairing !== 'function') {
      return
    }

    setPairingBusy(true)
    setCodeCopied(false)

    try {
      const next = await startMobilePairing()
      setPairing(next)

      const dataUrl = await QRCode.toDataURL(next.pairUri, {
        margin: 1,
        width: 176
      })

      setQrDataUrl(dataUrl)
    } catch (error) {
      notifyError(error, s.pairFailed ?? 'Could not start mobile pairing')
    } finally {
      setPairingBusy(false)
    }
  }, [s.pairFailed])

  const copyPairingCode = useCallback(async () => {
    if (!pairing?.code) {
      return
    }

    try {
      await navigator.clipboard?.writeText(pairing.code)
      setCodeCopied(true)
      window.setTimeout(() => setCodeCopied(false), 1800)
    } catch {
      // Clipboard may be unavailable in restricted contexts; ignore silently.
    }
  }, [pairing])

  const revoke = useCallback(async () => {
    if (!revokeTarget) {
      return
    }

    try {
      await revokeMobileDevice(revokeTarget.device_id)
      setDevices(current => current.filter(device => device.device_id !== revokeTarget.device_id))
    } catch (error) {
      notifyError(error, s.revokeFailed)
    }
  }, [revokeTarget, s.revokeFailed])

  const onlineCount = useMemo(() => devices.filter(device => device.online).length, [devices])
  const expiresMinutes = pairing ? Math.max(1, Math.round((pairing.expiresInSec || 300) / 60)) : 5

  return (
    <SettingsContent>
      <SettingsSection
        aside={
          <Button
            disabled={pairingBusy}
            onClick={() => void beginPairing()}
            size="sm"
            variant={pairing ? 'ghost' : 'default'}
          >
            <QrCode className="mr-1.5 size-3.5" />
            {pairingBusy ? (s.pairGenerating ?? 'Generating…') : pairing ? (s.pairRefresh ?? 'New code') : (s.pairAction ?? 'Generate pairing QR')}
          </Button>
        }
        icon={QrCode}
        title={s.pairTitle ?? 'Pair a new phone'}
      >
        {pairing ? (
          <div className="flex flex-col gap-4 py-2 sm:flex-row sm:items-center">
            {qrDataUrl ? (
              <div className="shrink-0 rounded-lg border border-(--ui-stroke-primary) bg-white p-2">
                <img
                  alt={s.pairQrAlt ?? 'Foolmoon Mobile pairing QR code'}
                  className="size-36"
                  src={qrDataUrl}
                />
              </div>
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="text-[length:var(--conversation-body-font-size)] text-(--ui-text-secondary)">
                {s.pairDescription ?? 'Scan this QR code in Foolmoon Mobile or enter the 6-digit pairing code.'}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
                  {s.pairCodeLabel ?? '6-digit pairing code'}:
                </span>
                <code className="rounded-md border border-(--ui-stroke-primary) bg-(--ui-bg-secondary) px-2.5 py-1 font-mono text-base font-semibold tracking-widest text-(--ui-text-primary)">
                  {pairing.code}
                </code>
                <Button
                  aria-label={s.copyCode ?? 'Copy code'}
                  onClick={() => void copyPairingCode()}
                  size="sm"
                  variant="ghost"
                >
                  {codeCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                </Button>
              </div>
              <p className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
                {`${pairing.host}:${pairing.port}`} · {s.pairExpires ? s.pairExpires(expiresMinutes) : `Expires in ${expiresMinutes} min`}
              </p>
            </div>
          </div>
        ) : (
          <p className="py-1 text-[length:var(--conversation-body-font-size)] text-(--ui-text-secondary)">
            {s.pairDescription ?? 'Scan this QR code in Foolmoon Mobile or enter the 6-digit pairing code.'}
          </p>
        )}
      </SettingsSection>

      {bridgeStatus ? (
        <SettingsSection
          aside={
            bridgeStatus.cudaAvailable ? (
              <Pill tone="success">{s.bridgeGpuReady ?? 'GPU acceleration ready'}</Pill>
            ) : undefined
          }
          icon={Cpu}
          meta={bridgeStatus.pcName || undefined}
          title={s.bridgeTitle ?? 'Computer bridge status'}
        >
          <div className="divide-y divide-(--ui-stroke-subtle)">
            {bridgeStatus.lanIp ? (
              <ListRow
                description={bridgeStatus.lanIp}
                title={s.bridgeAddress ?? 'LAN endpoint'}
              />
            ) : null}
            {bridgeStatus.activeModel ? (
              <ListRow
                description={bridgeStatus.activeModel}
                title={s.bridgeModel ?? 'Active model'}
              />
            ) : null}
            {bridgeStatus.activeVoiceName || bridgeStatus.ttsEngine ? (
              <ListRow
                description={bridgeStatus.activeVoiceName || bridgeStatus.ttsEngine || ''}
                title={s.bridgeVoice ?? 'PC voice clone'}
              />
            ) : null}
          </div>
        </SettingsSection>
      ) : null}

      <SettingsSection
        aside={
          <Tip label={s.refresh}>
            <Button
              aria-label={s.refresh}
              disabled={refreshing}
              onClick={() => void load()}
              size="sm"
              variant="ghost"
            >
              <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
            </Button>
          </Tip>
        }
        icon={Smartphone}
        meta={state === 'ready' && devices.length > 0 ? `${onlineCount}/${devices.length}` : undefined}
        title={s.title}
      >
        {state === 'loading' ? (
          <SettingsSkeleton sections={[{ rows: 2 }]} />
        ) : state === 'error' ? (
          <EmptyState description={s.errorDescription} title={s.errorTitle} />
        ) : devices.length === 0 ? (
          <EmptyState description={s.emptyDescription} title={s.emptyTitle} />
        ) : (
          <div>
            {devices.map(device => {
              const label = deviceLabel(device, s.unknownName)
              const paired = formatWhen(device.paired_at, locale)
              const lastSeen = formatWhen(device.last_seen, locale)

              return (
                <ListRow
                  action={
                    <span className="flex items-center gap-2">
                      <Pill tone={device.online ? 'success' : 'muted'}>
                        {device.online ? s.online : s.offline}
                      </Pill>
                      <Tip label={s.revoke}>
                        <Button
                          aria-label={s.revokeDevice(label)}
                          onClick={() => setRevokeTarget(device)}
                          size="sm"
                          variant="ghost"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </Tip>
                    </span>
                  }
                  description={
                    <span>
                      {device.model ? `${device.model} · ` : ''}
                      {paired ? `${s.paired} ${paired}` : s.pairedUnknown}
                      {!device.online && lastSeen ? ` · ${s.lastSeen} ${lastSeen}` : ''}
                    </span>
                  }
                  hint={
                    device.capabilities.length > 0
                      ? s.capabilities(device.capabilities.length)
                      : undefined
                  }
                  key={device.device_id}
                  title={label}
                />
              )
            })}
          </div>
        )}
      </SettingsSection>

      <p className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
        {s.footnote}
      </p>

      <ConfirmDialog
        confirmLabel={s.revoke}
        description={revokeTarget ? s.revokeDescription(deviceLabel(revokeTarget, s.unknownName)) : ''}
        destructive
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => revoke()}
        open={revokeTarget !== null}
        title={revokeTarget ? s.revokeTitle(deviceLabel(revokeTarget, s.unknownName)) : ''}
      />
    </SettingsContent>
  )
}
