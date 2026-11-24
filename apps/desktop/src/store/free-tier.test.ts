import { beforeEach, describe, expect, it, vi } from 'vitest'

import { $onboardingDecided, markOnboardingDecided, setOnboardingSurfaceActive } from '@/store/onboarding-presence'
import type { FreeTierStatus } from '@/types/hermes'

import {
  $freeTierRoute,
  $freeTierSignInOpen,
  $freeTierStatus,
  ackFreeTierNotice,
  claimFreeTierNotice,
  freeTierNoticeClaim,
  freeTierNoticePending,
  freeTierReadyPending,
  type FreeTierRequester,
  freeTierSetupFailure,
  freeTierStripPending,
  friendlyWait,
  provisionFreeTier,
  refreshFreeTierStatus,
  releaseFreeTierNotice,
  setFreeTierRoute
} from './free-tier'

const BASE_STATUS: FreeTierStatus = {
  available: true,
  challenge: null,
  enabled: true,
  error: undefined,
  error_code: undefined,
  has_guest: true,
  label: 'Free trial',
  model: 'nous/welcome',
  notice_pending: true,
  retry_after: 0,
  retryable: false
}

describe('store/free-tier invariants', () => {
  beforeEach(() => {
    $freeTierStatus.set(null)
    $freeTierRoute.set(null)
    $onboardingDecided.set(true)
    setOnboardingSurfaceActive('onboarding', false)
    setOnboardingSurfaceActive('intro', false)
    const owner = freeTierNoticeClaim().get()

    if (owner) {
      releaseFreeTierNotice(owner)
    }
  })

  it('tracks refreshFreeTierStatus updates and drops stale out-of-scope responses', async () => {
    const staleGate = () => false
    const respondOk: FreeTierRequester = (async () => BASE_STATUS) as FreeTierRequester
    await refreshFreeTierStatus(respondOk, staleGate)
    expect($freeTierStatus.get()).toBeNull()

    await refreshFreeTierStatus(respondOk, () => true)
    expect($freeTierStatus.get()).toEqual(BASE_STATUS)
    expect($freeTierSignInOpen.get()).toBe(true)

    // Keeps sign-in closed while onboarding decision is still pending
    $onboardingDecided.set(false)
    expect($freeTierSignInOpen.get()).toBe(false)
    markOnboardingDecided()
    expect($freeTierSignInOpen.get()).toBe(true)

    // Gateway flap must preserve last known status rather than blanking
    await refreshFreeTierStatus(async () => {
      throw new Error('network down')
    })
    expect($freeTierStatus.get()).toEqual(BASE_STATUS)
  })

  it('classifies setup failures and chooses retry vs sign_in doors', () => {
    expect(freeTierSetupFailure(null)).toBeNull()
    expect(freeTierSetupFailure({ ...BASE_STATUS, has_guest: true, error_code: 'anon_unreachable' })).toBeNull()
    expect(
      freeTierSetupFailure({
        ...BASE_STATUS,
        has_guest: false,
        error_code: 'anon_unreachable',
        error: 'offline',
        retry_after: 42.6,
        retryable: true
      })
    ).toEqual({
      code: 'anon_unreachable',
      door: 'retry',
      message: 'offline',
      retryAfter: 43,
      retryable: true
    })
    expect(
      freeTierSetupFailure({
        ...BASE_STATUS,
        has_guest: false,
        error_code: 'anon_rate_limited',
        error: 'slow down'
      })?.door
    ).toBe('sign_in')
  })

  it('formats spoken durations cleanly with friendlyWait', () => {
    expect(friendlyWait(0)).toBe('a few seconds')
    expect(friendlyWait(15)).toBe('a few seconds')
    expect(friendlyWait(45)).toBe('about a minute')
    expect(friendlyWait(300)).toBe('about 5 minutes')
    expect(friendlyWait(3600)).toBe('about an hour')
    expect(friendlyWait(7200)).toBe('about 2 hours')
  })

  it('computes notice gates, first-claim mutex, provision and ack', async () => {
    setFreeTierRoute(true)
    expect(freeTierNoticePending(BASE_STATUS)).toBe(true)
    expect(freeTierReadyPending(BASE_STATUS, true)).toBe(true)
    expect(freeTierStripPending(BASE_STATUS, false)).toBe(true)

    setOnboardingSurfaceActive('onboarding', true)
    expect(freeTierStripPending(BASE_STATUS, false)).toBe(false)
    setOnboardingSurfaceActive('onboarding', false)

    claimFreeTierNotice('pane-a')
    claimFreeTierNotice('pane-b')
    expect(freeTierNoticeClaim().get()).toBe('pane-a')
    releaseFreeTierNotice('pane-b')
    expect(freeTierNoticeClaim().get()).toBe('pane-a')
    releaseFreeTierNotice('pane-a')
    expect(freeTierNoticeClaim().get()).toBeNull()

    const reqMock = vi.fn(async (method: string) => {
      if (method === 'free_tier.ack_notice') {
        return { acked: true }
      }

      return { ...BASE_STATUS, notice_pending: false }
    })

    const req = reqMock as unknown as FreeTierRequester

    await provisionFreeTier(req)
    expect(await ackFreeTierNotice(req)).toBe(true)
    expect($freeTierStatus.get()?.notice_pending).toBe(false)
  })
})
