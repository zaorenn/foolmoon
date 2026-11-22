import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  applyFoolmoonAppUpdate,
  applyHermesCoreUpdate,
  checkFoolmoonAppUpdate,
  checkHermesCoreUpdate,
  type FoolmoonAppUpdateCheckResponse,
  type FoolmoonManifest,
  getFoolmoonManifest,
  type HermesCoreUpdateCheckResponse
} from '@/hermes'
import { AlertTriangle, CheckCircle2, Download, ExternalLink, Loader2, RefreshCw, ShieldLock } from '@/lib/icons'
import { confirm } from '@/store/confirm'
import { notify, notifyError } from '@/store/notifications'

import { Pill } from './primitives'

export function FoolmoonDualUpdates() {
  const [manifest, setManifest] = useState<FoolmoonManifest | null>(null)
  const [appStatus, setAppStatus] = useState<FoolmoonAppUpdateCheckResponse | null>(null)
  const [coreStatus, setCoreStatus] = useState<HermesCoreUpdateCheckResponse | null>(null)
  const [checkingApp, setCheckingApp] = useState(false)
  const [checkingCore, setCheckingCore] = useState(false)
  const [applyingApp, setApplyingApp] = useState(false)
  const [applyingCore, setApplyingCore] = useState(false)

  useEffect(() => {
    let cancelled = false

    try {
      getFoolmoonManifest()
        .then(data => {
          if (!cancelled) {
            setManifest(data)
          }
        })
        .catch(() => {
          // Non-Foolmoon backend or unit test environment.
        })
    } catch {
      // Unit test environment without window.hermesDesktop bridge.
    }

    return () => {
      cancelled = true
    }
  }, [])

  const handleCheckApp = useCallback(async () => {
    setCheckingApp(true)

    try {
      const next = await checkFoolmoonAppUpdate()
      setAppStatus(next)

      if (!next.update_available) {
        notify({ kind: 'info', message: 'Foolmoon Desktop, Notch, and TTS components are up to date.' })
      }
    } catch (error) {
      notifyError(error, 'Failed to check Foolmoon release updates')
    } finally {
      setCheckingApp(false)
    }
  }, [])

  const handleApplyApp = useCallback(async () => {
    setApplyingApp(true)

    try {
      const res = await applyFoolmoonAppUpdate('auto')

      if (!res.ok) {
        notify({
          kind: 'warning',
          message: res.rolled_back
            ? `Update failed and was automatically rolled back: ${res.error ?? ''}`
            : (res.error ?? 'Could not apply Foolmoon update')
        })

        return
      }

      if (res.downloaded_installer) {
        notify({
          kind: 'success',
          message: `Setup package downloaded (${res.sha256_verified ? 'SHA-256 verified' : 'verified'}): ${res.downloaded_installer}`
        })
      } else if (res.updated) {
        notify({
          kind: 'success',
          message: 'Foolmoon UI and TTS updated. Restart the application to load the new build.'
        })
      } else {
        notify({ kind: 'info', message: 'Foolmoon is already on the latest release.' })
      }

      void handleCheckApp()
    } catch (error) {
      notifyError(error, 'Foolmoon update failed')
    } finally {
      setApplyingApp(false)
    }
  }, [handleCheckApp])

  const handleCheckCore = useCallback(async () => {
    setCheckingCore(true)

    try {
      const next = await checkHermesCoreUpdate()
      setCoreStatus(next)

      if (next.error) {
        notify({ kind: 'warning', message: next.error })
      } else if (!next.update_available) {
        notify({ kind: 'info', message: 'Original Hermes Core is already up to date.' })
      }
    } catch (error) {
      notifyError(error, 'Hermes Core update check failed')
    } finally {
      setCheckingCore(false)
    }
  }, [])

  const handleApplyCore = useCallback(async () => {
    const ok = await confirm({
      confirmLabel: 'Safe Sync Core',
      description:
        'Upstream updates from NousResearch/hermes-agent will merge into core while keeping Foolmoon UI, Notch, bbot, TTS, and MCP layers protected. Any failed integrity check rolls back automatically.',
      title: 'Sync Original Hermes Core?'
    })

    if (!ok) {
      return
    }

    setApplyingCore(true)

    try {
      const res = await applyHermesCoreUpdate()

      if (!res.ok) {
        notify({
          kind: 'warning',
          message: res.rolled_back
            ? `Hermes Core sync was safely rolled back: ${res.error ?? ''}`
            : (res.error ?? 'Could not sync Hermes Core')
        })

        return
      }

      if (res.updated) {
        notify({
          kind: 'success',
          message: 'Original Hermes Core updated without breaking Foolmoon. Restart recommended.'
        })
      } else {
        notify({ kind: 'info', message: 'Hermes Core is already up to date.' })
      }

      void handleCheckCore()
    } catch (error) {
      notifyError(error, 'Hermes Core sync failed')
    } finally {
      setApplyingCore(false)
    }
  }, [handleCheckCore])

  if (!manifest) {
    return null
  }

  return (
    <div className="mb-6 grid gap-3" data-testid="foolmoon-dual-updates">
      <div className="rounded-xl border border-(--ui-border-subtle) bg-(--ui-surface-subtle)/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-(--ui-text-primary)">
                Foolmoon Application (UI &amp; TTS)
              </span>
              <Pill tone={appStatus?.update_available ? 'primary' : 'success'}>
                v{appStatus?.latest_version || manifest.version}
              </Pill>
            </div>
            <p className="mt-1 text-xs text-(--ui-text-tertiary)">
              Repo: <span className="font-mono">{manifest.foolmoon_repo}</span> · Installed v{manifest.version}
              {appStatus?.git_behind ? ` · ${appStatus.git_behind} new commit(s)` : ''}
            </p>
            {appStatus?.latest_subject ? (
              <p className="mt-1 text-xs text-(--ui-text-secondary)">Latest change: {appStatus.latest_subject}</p>
            ) : null}
            {appStatus?.release_notes ? (
              <p className="mt-1 whitespace-pre-line text-xs text-(--ui-text-tertiary)">{appStatus.release_notes}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {appStatus?.release_url ? (
              <a
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-(--ui-text-secondary) hover:bg-(--ui-surface-muted)"
                href={appStatus.release_url}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink className="size-3.5" />
                Release Notes
              </a>
            ) : null}
            <Button
              disabled={checkingApp || applyingApp}
              onClick={() => void handleCheckApp()}
              size="sm"
              type="button"
              variant="outline"
            >
              {checkingApp ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Check Foolmoon
            </Button>
            {appStatus?.update_available ? (
              <Button disabled={applyingApp} onClick={() => void handleApplyApp()} size="sm" type="button">
                {applyingApp ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                Update Foolmoon
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-(--ui-border-subtle) bg-(--ui-surface-subtle)/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-(--ui-text-primary)">
                Original Hermes Core (Safe Sync)
              </span>
              {coreStatus ? (
                coreStatus.error ? (
                  <Pill tone="warn">Check Warning</Pill>
                ) : coreStatus.safe_merge_preview ? (
                  <Pill tone="success">
                    <CheckCircle2 className="mr-1 inline size-3" />
                    Non-Breaking / Clean
                  </Pill>
                ) : (
                  <Pill tone="warn">
                    <AlertTriangle className="mr-1 inline size-3" />
                    {coreStatus.conflicting_files.length} Protected Conflict(s)
                  </Pill>
                )
              ) : (
                <Pill tone="muted">
                  <ShieldLock className="mr-1 inline size-3" />
                  Protected
                </Pill>
              )}
            </div>
            <p className="mt-1 text-xs text-(--ui-text-tertiary)">
              Source: <span className="font-mono">{manifest.upstream_repo}</span> · Protected Notch, Studio, TTS &amp;
              MCP layers stay intact; automatic rollback triggers if integrity checks fail.
            </p>
            {coreStatus?.update_available ? (
              <p className="mt-1 text-xs text-(--ui-text-secondary)">
                {coreStatus.behind} upstream core update(s) ready
                {coreStatus.latest_subject ? ` · ${coreStatus.latest_subject}` : ''}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={checkingCore || applyingCore}
              onClick={() => void handleCheckCore()}
              size="sm"
              type="button"
              variant="outline"
            >
              {checkingCore ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Check Hermes Core
            </Button>
            {coreStatus?.update_available ? (
              <Button disabled={applyingCore} onClick={() => void handleApplyCore()} size="sm" type="button">
                {applyingCore ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldLock className="size-3.5" />}
                Safe Sync Hermes
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
