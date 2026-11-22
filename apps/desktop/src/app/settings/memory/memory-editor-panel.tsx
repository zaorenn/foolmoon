import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  getMemoryFiles,
  type MemoryFilesResponse,
  type MemoryProfileSeedPayload,
  resetMemory,
  saveMemoryFile,
  seedUserMemoryProfile
} from '@/hermes'
import { Brain, CheckCircle2, Loader2, Plus, RefreshCw, Save, Trash2, Users, X } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { confirm } from '@/store/confirm'
import { refreshMemoryStatus } from '@/store/memory-status'
import { notify, notifyError } from '@/store/notifications'

import { ToggleRow } from '../primitives'

interface MemoryEditorPanelProps {
  memoryEnabled: boolean
  onToggleMemoryEnabled: (value: boolean) => void
  onToggleUserProfileEnabled: (value: boolean) => void
  profile?: string
  userProfileEnabled: boolean
}

type MemoryTab = 'memory' | 'user' | 'wizard'

const INITIAL_WIZARD: MemoryProfileSeedPayload = {
  address_as: '',
  apply_personality: false,
  language: 'Türkçe',
  name: '',
  role: '',
  rules: '',
  style: 'Samimi, doğrudan ve pratik'
}

export function MemoryEditorPanel({
  memoryEnabled,
  onToggleMemoryEnabled,
  onToggleUserProfileEnabled,
  profile,
  userProfileEnabled
}: MemoryEditorPanelProps) {
  const [data, setData] = useState<MemoryFilesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<MemoryTab>('memory')
  const [rawMode, setRawMode] = useState(false)
  const [memoryDraft, setMemoryDraft] = useState('')
  const [userDraft, setUserDraft] = useState('')
  const [newEntry, setNewEntry] = useState('')
  const [wizard, setWizard] = useState<MemoryProfileSeedPayload>(INITIAL_WIZARD)

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const next = await getMemoryFiles(profile)
      setData(next)
      setMemoryDraft(next.memory.content)
      setUserDraft(next.user.content)
    } catch (error) {
      notifyError(error, 'Hafıza dosyaları yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => {
    void load()
  }, [load])

  const activeTarget = tab === 'user' ? 'user' : 'memory'
  const activeState = activeTarget === 'user' ? data?.user : data?.memory
  const activeDraft = activeTarget === 'user' ? userDraft : memoryDraft
  const delimiter = data?.delimiter || '\n§\n'

  const setActiveDraft = (value: string) => {
    if (activeTarget === 'user') {
      setUserDraft(value)
    } else {
      setMemoryDraft(value)
    }
  }

  const persistTarget = async (target: 'memory' | 'user', content: string, message: string) => {
    setSaving(true)

    try {
      await saveMemoryFile(target, content, profile)
      await load()
      refreshMemoryStatus()
      notify({ kind: 'success', message })
    } catch (error) {
      notifyError(error, 'Hafıza kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  const handleAddEntry = async () => {
    const trimmed = newEntry.trim()

    if (!trimmed) {
      return
    }

    const entries = [...(activeState?.entries ?? []), trimmed]
    setNewEntry('')
    await persistTarget(activeTarget, entries.join(delimiter), `${activeTarget === 'user' ? 'USER.md' : 'MEMORY.md'} güncellendi`)
  }

  const handleRemoveEntry = async (index: number) => {
    const entries = (activeState?.entries ?? []).filter((_, idx) => idx !== index)
    await persistTarget(activeTarget, entries.join(delimiter), 'Kayıt hafızadan silindi')
  }

  const handleReset = async (target: 'memory' | 'user') => {
    const label = target === 'user' ? 'USER.md' : 'MEMORY.md'

    const ok = await confirm({
      confirmLabel: 'Sıfırla',
      description: `${label} içeriği kalıcı olarak temizlenecek. Devam edilsin mi?`,
      destructive: true,
      title: `${label} Sıfırlansın mı?`
    })

    if (!ok) {
      return
    }

    setSaving(true)

    try {
      await resetMemory(target, profile)
      await load()
      refreshMemoryStatus()
      notify({ kind: 'info', message: `${label} sıfırlandı` })
    } catch (error) {
      notifyError(error, `${label} sıfırlanamadı`)
    } finally {
      setSaving(false)
    }
  }

  const handleApplyWizard = async () => {
    if (!wizard.name.trim() && !wizard.address_as.trim() && !wizard.rules.trim() && !wizard.role.trim()) {
      notify({ kind: 'warning', message: 'Lütfen en az bir profil veya hitap alanı doldurun' })

      return
    }

    setSaving(true)

    try {
      await seedUserMemoryProfile(wizard, profile)
      await load()
      refreshMemoryStatus()
      setTab('user')
      notify({ kind: 'success', message: 'Hitap ve profil tercihleri USER.md içine işlendi' })
    } catch (error) {
      notifyError(error, 'Profil hafızaya yazılamadı')
    } finally {
      setSaving(false)
    }
  }

  const usageRatio = activeState && activeState.limit > 0 ? Math.min(100, Math.round((activeState.chars / activeState.limit) * 100)) : 0

  return (
    <div
      className="my-4 rounded-xl border border-(--ui-border-subtle) bg-(--ui-surface-subtle)/40 p-4"
      data-testid="memory-editor-panel"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Brain className="size-4 text-(--ui-accent)" />
          <div>
            <h3 className="text-[length:var(--conversation-title-font-size)] font-semibold text-(--ui-text-primary)">
              Hafıza Kontrol Merkezi
            </h3>
            <p className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
              Ajanın kalıcı notlarını (MEMORY.md), hitap/profil bilgini (USER.md) ve hızlı kuralları buradan doğrudan yönetin.
            </p>
          </div>
        </div>
        <Button disabled={loading || saving} onClick={() => void load()} size="xs" type="button" variant="outline">
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          Yenile
        </Button>
      </div>

      <div className="mb-3 grid gap-1 rounded-lg border border-(--ui-border-subtle) bg-(--ui-surface-base)/50 px-3 py-1">
        <ToggleRow
          checked={memoryEnabled}
          description="Ajanın oturumlar arası teknik notlarını (MEMORY.md) sistem istemine dahil et"
          label="Kalıcı Ajan Hafızası (MEMORY.md)"
          onChange={onToggleMemoryEnabled}
        />
        <ToggleRow
          checked={userProfileEnabled}
          description="Hitap şekli, dil ve kişisel tercihlerini (USER.md) her yanıtta uygula"
          label="Kullanıcı Profili (USER.md)"
          onChange={onToggleUserProfileEnabled}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5 border-b border-(--ui-border-subtle) pb-2">
        <Button
          onClick={() => setTab('memory')}
          size="xs"
          type="button"
          variant={tab === 'memory' ? 'default' : 'ghost'}
        >
          <Brain className="size-3.5" />
          MEMORY.md ({data?.memory.entries.length ?? 0})
        </Button>
        <Button
          onClick={() => setTab('user')}
          size="xs"
          type="button"
          variant={tab === 'user' ? 'default' : 'ghost'}
        >
          <Users className="size-3.5" />
          USER.md ({data?.user.entries.length ?? 0})
        </Button>
        <Button
          onClick={() => setTab('wizard')}
          size="xs"
          type="button"
          variant={tab === 'wizard' ? 'default' : 'ghost'}
        >
          <CheckCircle2 className="size-3.5" />
          Hitap &amp; Profil Sihirbazı
        </Button>
      </div>

      {tab === 'wizard' ? (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-(--ui-text-secondary)">Adın</label>
              <Input
                onChange={e => setWizard(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Örn. Deniz"
                value={wizard.name}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-(--ui-text-secondary)">
                Sana Nasıl Hitap Etsin?
              </label>
              <Input
                onChange={e => setWizard(prev => ({ ...prev, address_as: e.target.value }))}
                placeholder="Örn. Adımla / Dostum / Bey"
                value={wizard.address_as}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-(--ui-text-secondary)">Tercih Edilen Dil</label>
              <Input
                onChange={e => setWizard(prev => ({ ...prev, language: e.target.value }))}
                placeholder="Türkçe / English"
                value={wizard.language}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-(--ui-text-secondary)">Çalışma Alanı / Rol</label>
              <Input
                onChange={e => setWizard(prev => ({ ...prev, role: e.target.value }))}
                placeholder="Örn. Yazılım, Tasarım, Araştırma"
                value={wizard.role}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-(--ui-text-secondary)">Yanıt &amp; İletişim Tarzı</label>
            <Input
              onChange={e => setWizard(prev => ({ ...prev, style: e.target.value }))}
              placeholder="Örn. Kısa, net, soru sormadan çözüm odaklı"
              value={wizard.style}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-(--ui-text-secondary)">
              Kalıcı Kurallar (her satır ayrı hafıza kaydı olur)
            </label>
            <Textarea
              onChange={e => setWizard(prev => ({ ...prev, rules: e.target.value }))}
              placeholder={'Örn.\nKod örneklerini TypeScript ile ver\nWeb sitesi istersem soru sormadan doğrudan oluştur'}
              rows={3}
              value={wizard.rules}
            />
          </div>
          <ToggleRow
            checked={Boolean(wizard.apply_personality)}
            description="İletişim tarzını aynı zamanda config.yaml içindeki display.personality ayarına uygular"
            label="Ajan Kişiliğine de Uygula"
            onChange={checked => setWizard(prev => ({ ...prev, apply_personality: checked }))}
          />
          <div className="flex justify-end">
            <Button disabled={saving} onClick={() => void handleApplyWizard()} size="sm" type="button">
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              USER.md İçine Uygula
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {activeState && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-(--ui-text-tertiary)">
              <div className="flex items-center gap-2">
                <span>
                  Doluluk: {activeState.chars.toLocaleString()} / {activeState.limit.toLocaleString()} karakter ({usageRatio}%)
                </span>
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-(--ui-surface-muted)">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      usageRatio > 90 ? 'bg-destructive' : 'bg-(--ui-accent)'
                    )}
                    style={{ width: `${usageRatio}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button onClick={() => setRawMode(v => !v)} size="xs" type="button" variant="ghost">
                  {rawMode ? 'Kart Görünümü' : 'Ham Markdown'}
                </Button>
                <Button
                  disabled={saving || activeState.chars === 0}
                  onClick={() => void handleReset(activeTarget)}
                  size="xs"
                  type="button"
                  variant="outline"
                >
                  <Trash2 className="size-3.5" />
                  Sıfırla
                </Button>
              </div>
            </div>
          )}

          {rawMode ? (
            <div className="grid gap-2">
              <Textarea
                className="font-mono text-xs"
                onChange={e => setActiveDraft(e.target.value)}
                rows={8}
                value={activeDraft}
              />
              <div className="flex justify-end">
                <Button
                  disabled={saving}
                  onClick={() =>
                    void persistTarget(
                      activeTarget,
                      activeDraft,
                      `${activeTarget === 'user' ? 'USER.md' : 'MEMORY.md'} kaydedildi`
                    )
                  }
                  size="sm"
                  type="button"
                >
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                  Kaydet
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  onChange={e => setNewEntry(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void handleAddEntry()
                    }
                  }}
                  placeholder={
                    activeTarget === 'user'
                      ? 'Yeni kullanıcı tercihi / hitap ekle...'
                      : 'Ajanın aklında tutması gereken yeni bilgi ekle...'
                  }
                  value={newEntry}
                />
                <Button disabled={saving || !newEntry.trim()} onClick={() => void handleAddEntry()} size="sm" type="button">
                  <Plus className="size-3.5" />
                  Ekle
                </Button>
              </div>

              {loading && !data ? (
                <div className="flex items-center gap-2 py-4 text-xs text-(--ui-text-tertiary)">
                  <Loader2 className="size-3.5 animate-spin" />
                  Hafıza kayıtları yükleniyor...
                </div>
              ) : (activeState?.entries.length ?? 0) === 0 ? (
                <p className="rounded-lg border border-dashed border-(--ui-border-subtle) px-3 py-4 text-center text-xs text-(--ui-text-tertiary)">
                  Henüz kayıt yok. Yukarıdan yeni bir bilgi ekleyin veya Sihirbaz sekmesini kullanın.
                </p>
              ) : (
                <div className="grid max-h-64 gap-1.5 overflow-y-auto pr-1">
                  {activeState?.entries.map((entry, idx) => (
                    <div
                      className="flex items-start justify-between gap-2 rounded-lg border border-(--ui-border-subtle) bg-(--ui-surface-base)/60 px-3 py-2 text-xs text-(--ui-text-primary)"
                      key={`${idx}-${entry.slice(0, 24)}`}
                    >
                      <span className="whitespace-pre-wrap break-words">{entry}</span>
                      <button
                        aria-label="Hafıza kaydını sil"
                        className="shrink-0 rounded p-0.5 text-(--ui-text-tertiary) hover:bg-(--ui-surface-muted) hover:text-destructive"
                        disabled={saving}
                        onClick={() => void handleRemoveEntry(idx)}
                        type="button"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
