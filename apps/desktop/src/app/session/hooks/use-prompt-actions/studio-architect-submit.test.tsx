import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { en } from '@/i18n/en'
import { createClientSessionState } from '@/lib/chat-runtime'
import { $composerPersona, setComposerPersona } from '@/store/composer-persona'
import { $activeGatewayProfile } from '@/store/profile'
import { $connection, $sessions } from '@/store/session'
import { $sessionStates } from '@/store/session-states'

import { useSubmitPrompt } from './submit'
import type { GatewayRequest } from './utils'

vi.mock('@/store/gateway', async original => ({
  ...(await original<Record<string, unknown>>()),
  retainGatewayForSessionTurn: vi.fn(async () => () => undefined)
}))

beforeEach(() => {
  window.localStorage.clear()
  $sessions.set([])
  $sessionStates.set({})
  $connection.set(null)
  $activeGatewayProfile.set('default')
  setComposerPersona('standard')
})

afterEach(() => {
  setComposerPersona('standard')
  cleanup()
  vi.restoreAllMocks()
})

type ClientSessionState = ReturnType<typeof createClientSessionState>

it('Studio Architect mode sends canonical api_text without uncontracted persona key', async () => {
  setComposerPersona('architect')
  expect($composerPersona.get()).toBe('architect')

  let state: ClientSessionState = createClientSessionState()
  const submitted: Array<Record<string, unknown>> = []

  const requestGateway = vi.fn(async (method: string, params?: Record<string, unknown>) => {
    if (method === 'prompt.submit' && params) {
      submitted.push(params)
    }

    return {
      status: 'queued',
      session_id: 'runtime-arch',
      submission_id: params?.submission_id
    } as never
  })

  const deps = {
    activeSessionIdRef: { current: 'runtime-arch' as string | null },
    selectedStoredSessionIdRef: { current: 'stored-arch' as string | null },
    busyRef: { current: false },
    copy: en.desktop,
    createBackendSessionForSend: vi.fn(async () => null),
    getRoutedStoredSessionId: () => null,
    getRuntimeIdForStoredSession: () => 'runtime-arch',
    getRouteToken: () => 'same-route',
    requestGateway: requestGateway as GatewayRequest,
    runtimeIdByStoredSessionIdRef: { current: new Map([['stored-arch', 'runtime-arch']]) },
    resumeStoredSession: vi.fn(),
    syncAttachmentsForSubmit: vi.fn(async (sessionId: string) => ({ sessionId, attachments: [] })),
    updateSessionState: vi.fn((_sid: string, updater: (s: ClientSessionState) => ClientSessionState) => {
      state = updater(state)

      return state
    })
  }

  const { result } = renderHook(() => useSubmitPrompt(deps as never))
  await act(async () => {
    const ok = await result.current('black paper texture with neon red accent')
    expect(ok).toBe(true)
  })

  expect(submitted).toHaveLength(1)
  expect(submitted[0]).not.toHaveProperty('persona')
  expect(submitted[0].text).toBe('black paper texture with neon red accent')
  expect(String(submitted[0].api_text ?? '')).toContain('customize_foolmoon_studio')
  expect(String(submitted[0].api_text ?? '')).toContain('black paper texture with neon red accent')
})
