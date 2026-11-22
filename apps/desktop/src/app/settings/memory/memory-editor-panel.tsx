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
  language: 'English',
  name: '',
  role: '',
  rules: '',
  style: 'Concise, direct, and practical'
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
      notifyError(error, 'Failed to load memory files')
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
      notifyError(error, 'Could not save memory store')
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
    await persistTarget(activeTarget, entries.join(delimiter), `Updated ${activeTarget === 'user' ? 'USER.md' : 'MEMORY.md'}`)
  }

  const handleRemoveEntry = async (index: number) => {
    const entries = (activeState?.entries ?? []).filter((_, idx) => idx !== index)
    await persistTarget(activeTarget, entries.join(delimiter), 'Entry removed from memory')
  }

  const handleReset = async (target: 'memory' | 'user') => {
    const label = target === 'user' ? 'USER.md' : 'MEMORY.md'

    const ok = await confirm({
      confirmLabel: 'Reset',
      description: `All entries in ${label} will be permanently cleared. Continue?`,
      destructive: true,
      title: `Reset ${label}?`
    })

    if (!ok) {
      return
    }

    setSaving(true)

    try {
      await resetMemory(target, profile)
      await load()
      refreshMemoryStatus()
      notify({ kind: 'info', message: `${label} cleared` })
    } catch (error) {
      notifyError(error, `Could not reset ${label}`)
    } finally {
      setSaving(false)
    }
  }

  const handleApplyWizard = async () => {
    if (!wizard.name.trim() && !wizard.address_as.trim() && !wizard.rules.trim() && !wizard.role.trim()) {
      notify({ kind: 'warning', message: 'Please enter at least one name, address, role, or rule field' })

      return
    }

    setSaving(true)

    try {
      await seedUserMemoryProfile(wizard, profile)
      await load()
      refreshMemoryStatus()
      setTab('user')
      notify({ kind: 'success', message: 'Profile and address preferences saved to USER.md' })
    } catch (error) {
      notifyError(error, 'Could not write profile to USER.md')
    } finally {
      setSaving(false)
    }
  }

  const usageRatio =
    activeState && activeState.limit > 0 ? Math.min(100, Math.round((activeState.chars / activeState.limit) * 100)) : 0

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
              Memory Control Center
            </h3>
            <p className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
              Manage persistent agent notes (MEMORY.md), user profile preferences (USER.md), and standing instructions directly.
            </p>
          </div>
        </div>
        <Button disabled={loading || saving} onClick={() => void load()} size="xs" type="button" variant="outline">
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <div className="mb-3 grid gap-1 rounded-lg border border-(--ui-border-subtle) bg-(--ui-surface-base)/50 px-3 py-1">
        <ToggleRow
          checked={memoryEnabled}
          description="Include cross-session technical notes from MEMORY.md in the system context"
          label="Persistent Agent Memory (MEMORY.md)"
          onChange={onToggleMemoryEnabled}
        />
        <ToggleRow
          checked={userProfileEnabled}
          description="Apply preferred name, address, language, and workflow preferences from USER.md"
          label="User Profile (USER.md)"
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
          Profile &amp; Address Wizard
        </Button>
      </div>

      {tab === 'wizard' ? (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-(--ui-text-secondary)">Your Name</label>
              <Input
                onChange={e => setWizard(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Alex"
                value={wizard.name}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-(--ui-text-secondary)">Preferred Address</label>
              <Input
                onChange={e => setWizard(prev => ({ ...prev, address_as: e.target.value }))}
                placeholder="e.g. First name / Formal"
                value={wizard.address_as}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-(--ui-text-secondary)">Preferred Language</label>
              <Input
                onChange={e => setWizard(prev => ({ ...prev, language: e.target.value }))}
                placeholder="English / Deutsch / Español"
                value={wizard.language}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-(--ui-text-secondary)">Role / Domain</label>
              <Input
                onChange={e => setWizard(prev => ({ ...prev, role: e.target.value }))}
                placeholder="e.g. Systems Engineer, Researcher"
                value={wizard.role}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-(--ui-text-secondary)">Response &amp; Tone Style</label>
            <Input
              onChange={e => setWizard(prev => ({ ...prev, style: e.target.value }))}
              placeholder="e.g. Concise, direct, and technical"
              value={wizard.style}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-(--ui-text-secondary)">
              Persistent Rules (one entry per line)
            </label>
            <Textarea
              onChange={e => setWizard(prev => ({ ...prev, rules: e.target.value }))}
              placeholder={'e.g.\nUse TypeScript for web code examples\nBuild requested web artifacts directly without asking extra clarifying questions'}
              rows={3}
              value={wizard.rules}
            />
          </div>
          <ToggleRow
            checked={Boolean(wizard.apply_personality)}
            description="Also sync communication tone to display.personality inside config.yaml"
            label="Apply Tone to Agent Personality"
            onChange={checked => setWizard(prev => ({ ...prev, apply_personality: checked }))}
          />
          <div className="flex justify-end">
            <Button disabled={saving} onClick={() => void handleApplyWizard()} size="sm" type="button">
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              Apply to USER.md
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {activeState && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-(--ui-text-tertiary)">
              <div className="flex items-center gap-2">
                <span>
                  Usage: {activeState.chars.toLocaleString()} / {activeState.limit.toLocaleString()} chars ({usageRatio}%)
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
                  {rawMode ? 'Card View' : 'Raw Markdown'}
                </Button>
                <Button
                  disabled={saving || activeState.chars === 0}
                  onClick={() => void handleReset(activeTarget)}
                  size="xs"
                  type="button"
                  variant="outline"
                >
                  <Trash2 className="size-3.5" />
                  Reset
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
                      `Saved ${activeTarget === 'user' ? 'USER.md' : 'MEMORY.md'}`
                    )
                  }
                  size="sm"
                  type="button"
                >
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                  Save
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
                      ? 'Add user preference or address rule...'
                      : 'Add persistent project note to remember...'
                  }
                  value={newEntry}
                />
                <Button disabled={saving || !newEntry.trim()} onClick={() => void handleAddEntry()} size="sm" type="button">
                  <Plus className="size-3.5" />
                  Add
                </Button>
              </div>

              {loading && !data ? (
                <div className="flex items-center gap-2 py-4 text-xs text-(--ui-text-tertiary)">
                  <Loader2 className="size-3.5 animate-spin" />
                  Loading memory entries...
                </div>
              ) : (activeState?.entries.length ?? 0) === 0 ? (
                <p className="rounded-lg border border-dashed border-(--ui-border-subtle) px-3 py-4 text-center text-xs text-(--ui-text-tertiary)">
                  No entries yet. Add a note above or open the Profile &amp; Address Wizard tab.
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
                        aria-label="Delete memory entry"
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
