// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { Profiler } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { group } from '@/components/pane-shell/tree/model'
import { $layoutTree, noteActiveTreeGroup } from '@/components/pane-shell/tree/store'
import { SidebarProvider } from '@/components/ui/sidebar'
import { $sidebarPrFilter, $sidebarRowMeta, $sidebarStatusFilter } from '@/store/layout'
import { $prBranchBySession, $pullRequestsByBranch } from '@/store/pull-requests'
import { $selectedStoredSessionId, $sessions } from '@/store/session'
import { $stalledSessionIds } from '@/store/session-states'
import { makeSessionInfo } from '@/test/session-info'

import { ChatSidebar } from './index'

const noop = () => {}

const noopAsync = async () => {}

const sessions = [
  makeSessionInfo({ id: 's-alpha', last_active: 10, profile: 'default', started_at: 1, title: 'Alpha session' }),
  makeSessionInfo({ id: 's-beta', last_active: 5, profile: 'default', started_at: 1, title: 'Beta session' })
]

describe('ChatSidebar render-churn narrowing', () => {
  beforeEach(() => {
    $sidebarStatusFilter.set([])
    $sidebarPrFilter.set([])
    $sidebarRowMeta.set([])
    $pullRequestsByBranch.set({})
    $prBranchBySession.set({})
    $stalledSessionIds.set([])
    $selectedStoredSessionId.set('s-alpha')
    $sessions.set(sessions)
    $layoutTree.set(group(['session-tile:s-alpha'], { active: 'session-tile:s-alpha', id: 'g-1' }))
    noteActiveTreeGroup('g-1')
  })

  afterEach(() => {
    cleanup()
    $sidebarStatusFilter.set([])
    $sidebarPrFilter.set([])
    $sidebarRowMeta.set([])
    $pullRequestsByBranch.set({})
    $prBranchBySession.set({})
    $stalledSessionIds.set([])
    $selectedStoredSessionId.set(null)
    $sessions.set([])
    $layoutTree.set(null)
    noteActiveTreeGroup(null)
  })

  it('skips re-renders on dot-state and PR map churn when filters and PR metadata are off', () => {
    const onRender = vi.fn()

    render(
      <MemoryRouter initialEntries={['/']}>
        <SidebarProvider>
          <Profiler id="chat-sidebar" onRender={onRender}>
            <ChatSidebar
              currentView="chat"
              onArchiveSession={noop}
              onBranchSession={noop}
              onDeleteSession={noop}
              onLoadMoreSessions={noop}
              onManageCronJob={noop}
              onNavigate={noop}
              onNewSessionInWorkspace={noop}
              onNewSessionSplit={noop}
              onResumeSession={noop}
              onRetrySessions={noopAsync}
              onTriggerCronJob={noopAsync}
            />
          </Profiler>
        </SidebarProvider>
      </MemoryRouter>
    )

    expect(screen.getByText('Alpha session')).toBeTruthy()
    const initialRenders = onRender.mock.calls.length

    act(() => {
      $pullRequestsByBranch.set({
        '/repo/other\nfeat/x': {
          branch: 'feat/x',
          merged: false,
          number: 42,
          state: 'OPEN',
          title: 'Other PR',
          url: 'https://github.com/example/repo/pull/42'
        } as never
      })
      $prBranchBySession.set({ 's-offscreen': '/repo/other\nfeat/x' })
      $stalledSessionIds.set(['s-offscreen'])
    })

    expect(onRender.mock.calls.length).toBe(initialRenders)

    // Enabling a status filter immediately reacts to stalled dot state
    act(() => {
      $stalledSessionIds.set(['s-alpha'])
      $sidebarStatusFilter.set(['working'])
    })

    expect(onRender.mock.calls.length).toBeGreaterThan(initialRenders)
  })
})
