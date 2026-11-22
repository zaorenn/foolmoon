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
        notify({ kind: 'info', message: 'Foolmoon arayüz ve TTS bileşenleri güncel.' })
      }
    } catch (error) {
      notifyError(error, 'Foolmoon sürüm kontrolü başarısız oldu')
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
            ? `Güncelleme başarısız oldu ve otomatik geri alındı: ${res.error ?? ''}`
            : (res.error ?? 'Foolmoon güncellemesi uygulanamadı')
        })

        return
      }

      if (res.downloaded_installer) {
        notify({
          kind: 'success',
          message: `Setup paketi indirildi (${res.sha256_verified ? 'SHA-256 doğrulandı' : 'doğrulandı'}): ${res.downloaded_installer}`
        })
      } else if (res.updated) {
        notify({
          kind: 'success',
          message: 'Foolmoon arayüz ve TTS güncellendi. Yeni sürüm için uygulamayı yeniden başlatın.'
        })
      } else {
        notify({ kind: 'info', message: 'Foolmoon zaten en güncel sürümde.' })
      }

      void handleCheckApp()
    } catch (error) {
      notifyError(error, 'Foolmoon güncellemesi başarısız')
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
        notify({ kind: 'info', message: 'Orijinal Hermes çekirdeği zaten güncel.' })
      }
    } catch (error) {
      notifyError(error, 'Hermes çekirdek kontrolü başarısız')
    } finally {
      setCheckingCore(false)
    }
  }, [])

  const handleApplyCore = useCallback(async () => {
    const ok = await confirm({
      confirmLabel: 'Güvenli Güncelle',
      description:
        'NousResearch/hermes-agent güncellemeleri çekirdeğe uygulanacak; Foolmoon arayüzü, Notch, bbot, TTS ve MCP dosyaları korunacak. Sorun çıkarsa otomatik geri alma yapılır.',
      title: 'Hermes Çekirdeği Güncellensin mi?'
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
            ? `Hermes çekirdek birleştirmesi güvenli biçimde geri alındı: ${res.error ?? ''}`
            : (res.error ?? 'Hermes çekirdeği güncellenemedi')
        })

        return
      }

      if (res.updated) {
        notify({
          kind: 'success',
          message: 'Orijinal Hermes çekirdeği bozulmadan güncellendi. Yeniden başlatma önerilir.'
        })
      } else {
        notify({ kind: 'info', message: 'Hermes çekirdeği zaten güncel.' })
      }

      void handleCheckCore()
    } catch (error) {
      notifyError(error, 'Hermes çekirdek güncellemesi başarısız')
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
                Foolmoon Uygulama Sürümü (Arayüz &amp; TTS)
              </span>
              <Pill tone={appStatus?.update_available ? 'primary' : 'success'}>
                v{appStatus?.latest_version || manifest.version}
              </Pill>
            </div>
            <p className="mt-1 text-xs text-(--ui-text-tertiary)">
              Repo: <span className="font-mono">{manifest.foolmoon_repo}</span> · Kurulu v{manifest.version}
              {appStatus?.git_behind ? ` · ${appStatus.git_behind} yeni commit` : ''}
            </p>
            {appStatus?.latest_subject ? (
              <p className="mt-1 text-xs text-(--ui-text-secondary)">Son değişiklik: {appStatus.latest_subject}</p>
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
                Sürüm Sayfası
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
              Foolmoon&apos;u Kontrol Et
            </Button>
            {appStatus?.update_available ? (
              <Button disabled={applyingApp} onClick={() => void handleApplyApp()} size="sm" type="button">
                {applyingApp ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                Foolmoon&apos;u Güncelle
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
                Orijinal Hermes Çekirdeği (Güvenli Sync)
              </span>
              {coreStatus ? (
                coreStatus.error ? (
                  <Pill tone="warn">Kontrol Uyarısı</Pill>
                ) : coreStatus.safe_merge_preview ? (
                  <Pill tone="success">
                    <CheckCircle2 className="mr-1 inline size-3" />
                    Bozulmaz / Temiz
                  </Pill>
                ) : (
                  <Pill tone="warn">
                    <AlertTriangle className="mr-1 inline size-3" />
                    {coreStatus.conflicting_files.length} Çakışma Koruması
                  </Pill>
                )
              ) : (
                <Pill tone="muted">
                  <ShieldLock className="mr-1 inline size-3" />
                  Korumalı
                </Pill>
              )}
            </div>
            <p className="mt-1 text-xs text-(--ui-text-tertiary)">
              Kaynak: <span className="font-mono">{manifest.upstream_repo}</span> · Foolmoon Notch, bbot, TTS &amp;
              MCP katmanları otomatik korunur; bütünlük testi başarısız olursa otomatik geri alınır.
            </p>
            {coreStatus?.update_available ? (
              <p className="mt-1 text-xs text-(--ui-text-secondary)">
                {coreStatus.behind} yeni çekirdek güncellemesi hazır
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
              Hermes Çekirdeğini Kontrol Et
            </Button>
            {coreStatus?.update_available ? (
              <Button disabled={applyingCore} onClick={() => void handleApplyCore()} size="sm" type="button">
                {applyingCore ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldLock className="size-3.5" />}
                Hermes&apos;i Güvenle Güncelle
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
