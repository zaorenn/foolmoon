import { useStore } from '@nanostores/react'
import { useEffect, useRef } from 'react'

import {
  requestComposerAttachImages,
  requestComposerFocus,
  requestComposerInsert,
  requestVoiceStopTurn,
  requestVoiceToggle
} from '@/app/chat/composer/focus'
import { getLmStudioModels, getLocalHardware, listVoiceClones, selectLmStudioModel, setActiveVoiceClone } from '@/hermes'
import { readClipboardText } from '@/lib/clipboard'
import { dataUrlToFile } from '@/lib/preview-annotate/pack'
import { stopVoicePlayback } from '@/lib/voice-playback'
import { $studioAppearance } from '@/store/appearance-studio'
import { $clarifyRequest, answerClarifyText, bareChoice, skipClarifyRequest } from '@/store/clarify'
import { requestVoiceConversationStart } from '@/store/composer'
import { $gateway } from '@/store/gateway'
import { $interfaceMode, setInterfaceMode } from '@/store/interface-mode'
import { setSidebarOpen } from '@/store/layout'
import {
  $bbotConfig,
  $bbotFxPreset,
  $bbotReactionNonce,
  $bbotSpotlight,
  $jarvisHandsFree,
  $notchConfig,
  $notchOpen,
  $notchPreviewOpen,
  $notchState,
  $notchVoiceRuntime,
  type BbotCustomConfig,
  formatHardwareSnapshot,
  fxKnobsForPreset,
  matchVoiceApprovalDecision,
  type NotchActivityEntry,
  type NotchActivityKind,
  type NotchAgentStatus,
  type NotchCustomConfig,
  type NotchPendingApproval,
  type NotchPendingClarify,
  publishNotchState,
  registerVoiceApprovalResolver,
  setNotchOpen,
  subscribeNotchCommands,
  triggerBbotSpotlight
} from '@/store/notch'
import { notify, notifyError } from '@/store/notifications'
import { $approvalRequest, answerApproval } from '@/store/prompts'
import {
  $activeSessionId,
  $currentModel,
  $messages,
  $selectedStoredSessionId,
  $sessions,
  setCurrentModel,
  setCurrentProvider
} from '@/store/session'
import { $workingSessionIds } from '@/store/session-states'
import { $voicePlayback } from '@/store/voice-playback'
import { setAutoSpeakReplies } from '@/store/voice-prefs'
import { isAuxiliaryWindow } from '@/store/windows'
import { applyStudioUniverse } from '@/themes/studio-presets'

interface NotchBridgeParams {
  onCancel: () => Promise<void> | void
  submitText: (text: string) => Promise<boolean> | boolean
}

function hasDesktopBridge(): boolean {
  return typeof window !== 'undefined' && typeof window.hermesDesktop?.api === 'function'
}

const CLIPBOARD_ACTION_VERBS: Record<'explain' | 'fix' | 'summarize' | 'translate', string> = {
  explain: 'Explain clearly what this is doing and call out key details',
  fix: 'Find any bugs or issues in this and provide a concise fix',
  summarize: 'Summarize the core points concisely',
  translate: 'Translate this naturally and accurately (English <-> Turkish or target language implied by the text)'
}

/**
 * Connects the Top Notch (`?win=notch` and in-app floating preview) cleanly
 * to the real Hermes desktop stores, voice engine, LM Studio discovery,
 * file shelf, clipboard actions, and gateway prompt pipeline.
 */
export function useNotchBridge({ onCancel, submitText }: NotchBridgeParams): void {
  const submitRef = useRef(submitText)
  submitRef.current = submitText
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel

  const workingIds = useStore($workingSessionIds)
  const messages = useStore($messages)
  const playback = useStore($voicePlayback)
  const studio = useStore($studioAppearance)
  const voiceRuntime = useStore($notchVoiceRuntime)
  const jarvisOn = useStore($jarvisHandsFree)
  const fxPreset = useStore($bbotFxPreset)
  const bbotConfig = useStore($bbotConfig)
  const bbotReaction = useStore($bbotReactionNonce)
  const bbotSpotlight = useStore($bbotSpotlight)
  const notchConfig = useStore($notchConfig)
  const approvalRequest = useStore($approvalRequest)
  const clarifyRequest = useStore($clarifyRequest)
  const interfaceMode = useStore($interfaceMode)
  const currentModel = useStore($currentModel)
  const sessions = useStore($sessions)
  const selectedStoredId = useStore($selectedStoredSessionId)

  // Auto-open Top Notch whenever a new agentic approval or clarify prompt arrives.
  useEffect(() => {
    if (isAuxiliaryWindow()) {
      return
    }

    let lastKey: string | null = null

    const checkAutoOpen = () => {
      const approval = $approvalRequest.get()
      const clarify = $clarifyRequest.get()

      const nextKey = approval
        ? `approval:${approval.requestId ?? approval.command}`
        : clarify
          ? `clarify:${clarify.requestId}:${clarify.questions[0]?.qid ?? ''}`
          : null

      if (nextKey && lastKey !== nextKey) {
        lastKey = nextKey

        if (!$notchOpen.get() && !$notchPreviewOpen.get()) {
          void setNotchOpen(true)
        }
      } else if (!nextKey) {
        lastKey = null
      }
    }

    const offApproval = $approvalRequest.listen(checkAutoOpen)
    const offClarify = $clarifyRequest.listen(checkAutoOpen)
    const seenSpotlights = new Set<string>()

    const offMessages = $messages.listen(list => {
      const last = list[list.length - 1]

      if (!last?.parts) {
        return
      }

      for (const part of last.parts) {
        if (part.type !== 'tool-call' || part.toolName !== 'point_bbot_at_screen') {
          continue
        }

        const partId = ('toolCallId' in part && typeof part.toolCallId === 'string' ? part.toolCallId : null) ?? `${last.id}-spot`

        if (seenSpotlights.has(partId)) {
          continue
        }

        const rawResult = 'result' in part && typeof part.result === 'string' ? part.result : null

        if (!rawResult) {
          continue
        }

        try {
          const parsed = JSON.parse(rawResult) as {
            bbot_spotlight?: {
              duration_ms?: number
              expression?: string
              label?: string
              x_norm?: number
              y_norm?: number
            }
          }

          if (parsed?.bbot_spotlight && typeof parsed.bbot_spotlight.x_norm === 'number') {
            seenSpotlights.add(partId)

            if (!$notchOpen.get() && !$notchPreviewOpen.get()) {
              void setNotchOpen(true)
            }

            triggerBbotSpotlight({
              durationMs: parsed.bbot_spotlight.duration_ms ?? 4000,
              expression: parsed.bbot_spotlight.expression ?? 'excited',
              label: parsed.bbot_spotlight.label ?? 'Look here!',
              xNorm: parsed.bbot_spotlight.x_norm,
              yNorm: parsed.bbot_spotlight.y_norm ?? 0.45
            })
          }
        } catch {
          // Ignore partial or non-JSON tool payloads.
        }
      }
    })

    const offVoiceResolver = registerVoiceApprovalResolver(clean => {
      const pending = $approvalRequest.get()

      if (!pending) {
        return false
      }

      const decision = matchVoiceApprovalDecision(clean)

      if (!decision) {
        return false
      }

      const choice = decision === 'approve' ? 'once' : 'deny'

      void answerApproval($gateway.get(), pending, choice)
        .then(() => {
          notify({
            icon: decision === 'approve' ? 'check' : 'x',
            id: 'notch-voice-approval',
            kind: decision === 'approve' ? 'success' : 'info',
            message:
              decision === 'approve'
                ? `Sesli onay verildi: "${clean}"`
                : `Sesli olarak reddedildi: "${clean}"`
          })
        })
        .catch(err => notifyError(err, 'Failed to resolve tool approval by voice'))

      return true
    })

    return () => {
      offApproval()
      offClarify()
      offMessages()
      offVoiceResolver()
    }
  }, [])

  // Refresh CUDA voice clones + LM Studio live model list with rapid retry on boot.
  useEffect(() => {
    if (isAuxiliaryWindow() || !hasDesktopBridge()) {
      return
    }

    let cancelled = false
    let retryHandle: number | null = null
    let syncedOnce = false

    const refresh = async () => {
      if (cancelled || !hasDesktopBridge()) {
        return
      }

      const [clonesRes, lmsRes] = await Promise.allSettled([listVoiceClones(), getLmStudioModels()])

      if (cancelled) {
        return
      }

      let gotAny = false

      if (clonesRes.status === 'fulfilled' && clonesRes.value?.ok) {
        gotAny = true
        publishNotchState({
          activeCloneId: clonesRes.value.activeCloneId ?? clonesRes.value.active_id ?? null,
          voiceClones: clonesRes.value.clones ?? []
        })
      }

      if (lmsRes.status === 'fulfilled' && lmsRes.value?.ok) {
        gotAny = true
        publishNotchState({
          lmstudioModels: lmsRes.value.models ?? [],
          lmstudioOnline: Boolean(lmsRes.value.online),
          ...(lmsRes.value.active_model ? { model: lmsRes.value.active_model } : {})
        })
      }

      if (gotAny) {
        syncedOnce = true
      } else if (!syncedOnce) {
        retryHandle = window.setTimeout(() => void refresh(), 1800)
      }
    }

    void refresh()
    const timer = window.setInterval(() => void refresh(), 15_000)

    return () => {
      cancelled = true
      window.clearInterval(timer)

      if (retryHandle !== null) {
        window.clearTimeout(retryHandle)
      }
    }
  }, [])

  // Handle commands sent from the Notch Dynamic Island (prompt, clipboard, shelf, LM Studio, voice, mode).
  useEffect(() => {
    if (isAuxiliaryWindow()) {
      return
    }

    return subscribeNotchCommands(cmd => {
      switch (cmd.type) {
        case 'request-sync':
          publishNotchState($notchState.get())

          if (hasDesktopBridge()) {
            void Promise.allSettled([listVoiceClones(), getLmStudioModels(), getLocalHardware()]).then(
              ([clonesRes, lmsRes, hwRes]) => {
                publishNotchState({
                  ...(clonesRes.status === 'fulfilled' && clonesRes.value?.ok
                    ? {
                        activeCloneId: clonesRes.value.activeCloneId ?? clonesRes.value.active_id ?? null,
                        voiceClones: clonesRes.value.clones ?? []
                      }
                    : {}),
                  ...(lmsRes.status === 'fulfilled' && lmsRes.value?.ok
                    ? {
                        lmstudioModels: lmsRes.value.models ?? [],
                        lmstudioOnline: Boolean(lmsRes.value.online)
                      }
                    : {}),
                  ...(hwRes.status === 'fulfilled' && hwRes.value
                    ? { hardwareTelemetry: formatHardwareSnapshot(hwRes.value) }
                    : {})
                })
              }
            )
          }

          break

        case 'refresh-lmstudio':
          if (!hasDesktopBridge()) {
            return
          }

          void Promise.allSettled([getLmStudioModels(), getLocalHardware()])
            .then(([lmsRes, hwRes]) => {
              publishNotchState({
                ...(lmsRes.status === 'fulfilled' && lmsRes.value?.ok
                  ? {
                      lmstudioModels: lmsRes.value.models ?? [],
                      lmstudioOnline: Boolean(lmsRes.value.online),
                      ...(lmsRes.value.active_model ? { model: lmsRes.value.active_model } : {})
                    }
                  : {}),
                ...(hwRes.status === 'fulfilled' && hwRes.value
                  ? { hardwareTelemetry: formatHardwareSnapshot(hwRes.value) }
                  : {})
              })
            })
            .catch(err => notifyError(err, 'Could not probe LM Studio models'))

          break

        case 'select-lmstudio-model':
          if (!cmd.model || !hasDesktopBridge()) {
            return
          }

          void selectLmStudioModel(cmd.model, { baseUrl: cmd.baseUrl })
            .then(res => {
              setCurrentProvider('lmstudio')
              setCurrentModel(res.model)
              publishNotchState({
                lmstudioOnline: true,
                model: res.model
              })
              notify({
                icon: 'sparkles',
                id: 'foolmoon-lmstudio-switch',
                kind: 'success',
                message: `Switched active LM Studio model to ${res.model}`
              })
            })
            .catch(err => notifyError(err, 'Failed to switch LM Studio model'))

          break
        case 'clipboard-action': {
          const runClipboardPrompt = async () => {
            const clipText = (await readClipboardText()).trim()

            if (!clipText) {
              notify({
                icon: 'info',
                id: 'foolmoon-clipboard-empty',
                kind: 'warning',
                message: 'Clipboard is empty or unreadable — copy text first to run a Notch action.'
              })

              return
            }

            const verb = CLIPBOARD_ACTION_VERBS[cmd.action] ?? CLIPBOARD_ACTION_VERBS.explain

            const prompt = `${verb}:\n\n\`\`\`\n${clipText.slice(0, 6000)}\n\`\`\``
            await submitRef.current(prompt)
          }

          void runClipboardPrompt()

          break
        }

        case 'attach-shelf': {
          const images = cmd.items
            .filter(item => item.isImage && item.dataUrl)
            .map(item => dataUrlToFile(item.dataUrl as string, item.name))

          if (images.length > 0) {
            requestComposerAttachImages(images, { target: 'main' })
          }

          const notes = cmd.items
            .filter(item => !item.isImage)
            .map(item =>
              item.textPreview
                ? `[Attached File: ${item.name} (${item.size} bytes)]\n\`\`\`\n${item.textPreview}\n\`\`\``
                : `[Attached File: ${item.name} (${item.size} bytes, ${item.mime})]`
            )
            .join('\n\n')

          const combinedText = [cmd.prompt?.trim() ?? '', notes].filter(Boolean).join('\n\n')

          if (cmd.submit && combinedText) {
            void submitRef.current(combinedText)
          } else {
            if (combinedText) {
              requestComposerInsert(combinedText, { mode: 'block', target: 'main' })
            }

            requestComposerFocus('main')
            window.hermesDesktop?.notch?.focusMainWindow?.()
          }

          break
        }

        case 'submit-text': {
          const clean = cmd.text.trim()

          if (!clean) {
            break
          }

          const activeApproval = $approvalRequest.get()

          if (activeApproval) {
            const decision = matchVoiceApprovalDecision(clean)

            if (decision) {
              void answerApproval($gateway.get(), activeApproval, decision === 'approve' ? 'once' : 'deny')
                .then(() => {
                  notify({
                    icon: decision === 'approve' ? 'check' : 'x',
                    id: 'notch-text-approval',
                    kind: decision === 'approve' ? 'success' : 'info',
                    message: decision === 'approve' ? `Onaylandı: "${clean}"` : `Reddedildi: "${clean}"`
                  })
                })
                .catch(err => notifyError(err, 'Failed to resolve tool approval'))

              break
            }
          }

          void submitRef.current(clean)

          break
        }

        case 'respond-approval': {
          const currentReq = $approvalRequest.get()

          const targetReq = currentReq ?? {
            requestId: cmd.requestId,
            serverRequestId: cmd.serverRequestId,
            sessionId: cmd.sessionId ?? $activeSessionId.get()
          }

          void answerApproval($gateway.get(), targetReq, cmd.choice).catch(err =>
            notifyError(err, 'Failed to resolve tool approval')
          )

          break
        }

        case 'respond-clarify': {
          const sid = cmd.sessionId ?? $activeSessionId.get() ?? ''
          const handled = answerClarifyText(sid, cmd.answer)

          if (!handled) {
            void submitRef.current(cmd.answer)
          } else {
            void handled.catch(err => notifyError(err, 'Failed to send clarify answer'))
          }

          break
        }

        case 'skip-clarify':
          void skipClarifyRequest(cmd.sessionId ?? $activeSessionId.get())

          break

        case 'stop-speaking':
          stopVoicePlayback()

          break

        case 'interrupt':
          stopVoicePlayback()
          void cancelRef.current()

          break

        case 'set-mode':
          setInterfaceMode(cmd.mode)
          setSidebarOpen(cmd.mode !== 'simple')

          break
        case 'set-fx-preset': {
          $bbotFxPreset.set(cmd.fxPreset)

          const updatedConfig: BbotCustomConfig = {
            ...$bbotConfig.get(),
            fxKnobs: fxKnobsForPreset(cmd.fxPreset)
          }

          $bbotConfig.set(updatedConfig)
          publishNotchState({ bbotConfig: updatedConfig, fxPreset: cmd.fxPreset })

          break
        }

        case 'set-bbot-config': {
          const cur = $bbotConfig.get()

          const merged: BbotCustomConfig = {
            ...cur,
            ...cmd.config,
            fxKnobs: cmd.config.fxKnobs ? { ...cur.fxKnobs, ...cmd.config.fxKnobs } : cur.fxKnobs
          }

          $bbotConfig.set(merged)
          publishNotchState({ bbotConfig: merged })

          break
        }

        case 'set-notch-config': {
          const mergedNotch: NotchCustomConfig = {
            ...$notchConfig.get(),
            ...cmd.config
          }

          $notchConfig.set(mergedNotch)
          publishNotchState({ notchConfig: mergedNotch })

          break
        }

        case 'set-bbot-spotlight':
          $bbotSpotlight.set(cmd.spotlight)
          publishNotchState({ bbotSpotlight: cmd.spotlight })

          break

        case 'open-notch-settings':
          if (typeof window !== 'undefined') {
            window.location.hash = '#/settings?tab=config:appearance&page=theme'
            window.hermesDesktop?.notch?.focusMainWindow?.()
          }

          break
        case 'trigger-bbot-reaction': {
          const cur = $bbotReactionNonce.get()
          const nextReaction = { name: cmd.reaction, seq: cur.seq + 1 }
          $bbotReactionNonce.set(nextReaction)
          publishNotchState({ bbotReaction: nextReaction })

          break
        }

        case 'set-universe': {
          const preset = applyStudioUniverse(cmd.universeId)

          if (preset) {
            const nextPreset = preset.studio.bbotFxPreset

            const updatedConfig: BbotCustomConfig = {
              ...$bbotConfig.get(),
              fxKnobs: fxKnobsForPreset(nextPreset)
            }

            $bbotFxPreset.set(nextPreset)
            $bbotConfig.set(updatedConfig)
            publishNotchState({
              activeUniverse: preset.id,
              bbotConfig: updatedConfig,
              fxPreset: nextPreset
            })
          }

          break
        }

        case 'set-clone':
          if (!hasDesktopBridge()) {
            return
          }

          void setActiveVoiceClone(cmd.cloneId)
            .then(res => {
              publishNotchState({ activeCloneId: res?.activeCloneId ?? res?.active_id ?? cmd.cloneId })
            })
            .catch(err => notifyError(err, 'Failed to switch voice clone'))

          break
        case 'toggle-jarvis': {
          const next = typeof cmd.enabled === 'boolean' ? cmd.enabled : !$jarvisHandsFree.get()
          $jarvisHandsFree.set(next)

          if (next) {
            void setAutoSpeakReplies(true).catch(() => undefined)

            if (!$notchVoiceRuntime.get().active) {
              requestVoiceConversationStart()
            }

            notify({
              icon: 'mic',
              id: 'jarvis-hands-free',
              kind: 'info',
              message: 'Foolmoon Hands-Free enabled — speak anytime (voice barge-in active).'
            })
          } else {
            stopVoicePlayback()

            if ($notchVoiceRuntime.get().active) {
              requestVoiceToggle('main')
            }
          }

          break
        }

        case 'ptt-start':
          if (!$notchVoiceRuntime.get().active) {
            requestVoiceToggle('main')
          }

          break
        case 'ptt-stop': {
          const voiceState = $notchVoiceRuntime.get()

          if (voiceState.active && voiceState.status === 'listening') {
            requestVoiceStopTurn('main')
          }

          break
        }

        case 'ptt-trigger':
          requestVoiceToggle('main')

          break

        default:
          break
      }
    })
  }, [])

  // Derive authoritative agent status and publish live snapshot to the Notch window.
  useEffect(() => {
    if (isAuxiliaryWindow()) {
      return
    }

    const lastMessage = messages[messages.length - 1]
    const lastError = Boolean(lastMessage?.error)

    const activeToolPart = lastMessage?.parts?.find(
      part => part.type === 'tool-call' && !('result' in part && part.result !== undefined)
    )

    const toolName =
      activeToolPart && 'toolName' in activeToolPart && typeof activeToolPart.toolName === 'string'
        ? activeToolPart.toolName
        : null

    let agentStatus: NotchAgentStatus = 'idle'

    if (playback.status === 'speaking') {
      agentStatus = 'speaking'
    } else if (voiceRuntime.status === 'listening') {
      agentStatus = 'listening'
    } else if (voiceRuntime.status === 'transcribing') {
      agentStatus = 'transcribing'
    } else if (toolName) {
      agentStatus = 'tool_running'
    } else if (workingIds.length > 0 || playback.status === 'preparing') {
      agentStatus = 'thinking'
    } else if (lastError) {
      agentStatus = 'error'
    }

    const sessionRow = selectedStoredId ? sessions.find(s => s.id === selectedStoredId) : sessions[0]
    const sessionTitle = sessionRow?.title?.trim() || sessionRow?.preview?.trim() || null

    const pendingApproval: NotchPendingApproval | null = approvalRequest
      ? {
          allowPermanent: approvalRequest.allowPermanent,
          command: approvalRequest.command,
          description: approvalRequest.description,
          requestId: approvalRequest.requestId,
          serverRequestId: approvalRequest.serverRequestId,
          sessionId: approvalRequest.sessionId
        }
      : null

    const unlockedIndex = clarifyRequest
      ? clarifyRequest.questions.findIndex(q => clarifyRequest.lockedAnswers?.[q.qid] === undefined)
      : -1

    const activeClarifyQuestion =
      clarifyRequest && unlockedIndex >= 0 ? clarifyRequest.questions[unlockedIndex] : null

    const pendingClarify: NotchPendingClarify | null =
      clarifyRequest && activeClarifyQuestion
        ? {
            choices: activeClarifyQuestion.choices ? activeClarifyQuestion.choices.map(bareChoice) : null,
            multiSelect: activeClarifyQuestion.multiSelect,
            qid: activeClarifyQuestion.qid,
            question: activeClarifyQuestion.question,
            questionIndex: unlockedIndex + 1,
            requestId: clarifyRequest.requestId,
            sessionId: clarifyRequest.sessionId,
            totalQuestions: clarifyRequest.questions.length
          }
        : null

    const classifyToolKind = (name: string): NotchActivityKind => {
      if (/terminal|shell|exec|bash|cmd|powershell|run_command/i.test(name)) {
        return 'terminal'
      }

      if (/search|web|fetch|browser|crawl|http|url/i.test(name)) {
        return 'search'
      }

      if (/read|write|edit|patch|file|grep|find|code/i.test(name)) {
        return 'code'
      }

      return 'tool'
    }

    const activityHistory: NotchActivityEntry[] = (lastMessage?.parts ?? [])
      .filter(
        (part): part is Extract<NonNullable<typeof lastMessage>['parts'][number], { type: 'tool-call' }> =>
          part.type === 'tool-call' && 'toolName' in part && typeof part.toolName === 'string'
      )
      .slice(-3)
      .map(part => ({
        detail: part.toolName,
        done: 'result' in part && part.result !== undefined,
        kind: classifyToolKind(part.toolName)
      }))

    let activityKind: NotchActivityKind = 'idle'
    let activityDetail: string | null = null

    if (pendingApproval) {
      activityKind = 'approval'
      activityDetail = pendingApproval.description || pendingApproval.command
    } else if (pendingClarify) {
      activityKind = 'clarify'
      activityDetail = pendingClarify.question
    } else if (playback.status === 'speaking') {
      activityKind = 'speaking'
      activityDetail = playback.sentence?.trim() || 'Speaking…'
    } else if (voiceRuntime.status === 'listening') {
      activityKind = 'listening'
      activityDetail = 'Listening to voice…'
    } else if (voiceRuntime.status === 'transcribing') {
      activityKind = 'listening'
      activityDetail = 'Transcribing voice…'
    } else if (toolName) {
      activityKind = classifyToolKind(toolName)
      activityDetail =
        activityKind === 'terminal'
          ? `Running ${toolName}…`
          : activityKind === 'search'
            ? `Searching · ${toolName}`
            : activityKind === 'code'
              ? `Editing · ${toolName}`
              : `Using ${toolName}…`
    } else if (workingIds.length > 0 || playback.status === 'preparing') {
      activityKind = 'thinking'
      activityDetail = 'Reasoning…'
    }

    publishNotchState({
      activeUniverse: studio.activeUniverse,
      activityDetail,
      activityHistory,
      activityKind,
      agentStatus,
      bbotConfig,
      bbotReaction,
      bbotSpotlight,
      fxPreset,
      interfaceMode,
      jarvisEnabled: jarvisOn,
      micLevel: voiceRuntime.level,
      model: currentModel || null,
      notchConfig,
      pendingApproval,
      pendingClarify,
      sessionTitle,
      toolName
    })
  }, [
    approvalRequest,
    bbotConfig,
    bbotReaction,
    bbotSpotlight,
    clarifyRequest,
    currentModel,
    fxPreset,
    interfaceMode,
    jarvisOn,
    messages,
    notchConfig,
    playback.sentence,
    playback.status,
    selectedStoredId,
    sessions,
    studio.activeUniverse,
    voiceRuntime.level,
    voiceRuntime.status,
    workingIds.length
  ])
}

export function NotchBridgeHost(props: NotchBridgeParams) {
  useNotchBridge(props)

  return null
}
