import { beforeEach, describe, expect, it } from 'vitest'

import {
  $pinnedSessionIds,
  $sessionsLimit,
  $sidebarSessionOrderIds,
  bumpSessionsLimit,
  pinSession,
  raiseSessionsLimit,
  resetSessionsLimit,
  setPinnedSessionOrder,
  setSidebarSessionOrderIds,
  SIDEBAR_SESSIONS_PAGE_SIZE,
  unpinSession
} from './layout'

describe('store/layout core invariants', () => {
  beforeEach(() => {
    $pinnedSessionIds.set([])
    $sidebarSessionOrderIds.set([])
    resetSessionsLimit()
  })

  it('pins, unpins, and reorders pinned subsets while preserving unloaded pins', () => {
    pinSession('s1')
    pinSession('s2')
    pinSession('unloaded')
    pinSession('s3')
    expect($pinnedSessionIds.get()).toEqual(['s1', 's2', 'unloaded', 's3'])

    // Reorder only loaded items: `unloaded` must stay at index 2
    setPinnedSessionOrder(['s3', 's1', 's2'])
    expect($pinnedSessionIds.get()).toEqual(['s3', 's1', 'unloaded', 's2'])

    unpinSession('s1')
    expect($pinnedSessionIds.get()).toEqual(['s3', 'unloaded', 's2'])
  })

  it('preserves array reference on identical session order writes to avoid subscriber churn', () => {
    setSidebarSessionOrderIds(['a', 'b', 'c'])
    const refBefore = $sidebarSessionOrderIds.get()

    setSidebarSessionOrderIds(['a', 'b', 'c'])
    expect($sidebarSessionOrderIds.get()).toBe(refBefore)

    setSidebarSessionOrderIds(['a', 'c', 'b'])
    expect($sidebarSessionOrderIds.get()).toEqual(['a', 'c', 'b'])
  })

  it('bumps, raises monotonically, and resets session paging window cleanly', () => {
    expect($sessionsLimit.get()).toBe(SIDEBAR_SESSIONS_PAGE_SIZE)
    expect(raiseSessionsLimit(SIDEBAR_SESSIONS_PAGE_SIZE - 10)).toBe(false)
    expect(raiseSessionsLimit(SIDEBAR_SESSIONS_PAGE_SIZE * 2)).toBe(true)
    expect($sessionsLimit.get()).toBe(SIDEBAR_SESSIONS_PAGE_SIZE * 2)

    bumpSessionsLimit(25)
    expect($sessionsLimit.get()).toBe(SIDEBAR_SESSIONS_PAGE_SIZE * 2 + 25)

    resetSessionsLimit()
    expect($sessionsLimit.get()).toBe(SIDEBAR_SESSIONS_PAGE_SIZE)
  })
})
