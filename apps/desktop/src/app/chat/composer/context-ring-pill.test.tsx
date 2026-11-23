import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import { I18nProvider } from '@/i18n'
import { $activeSessionId, $currentUsage } from '@/store/session'
import { $sessionStates } from '@/store/session-states'

import { ContextRingPill } from './context-ring-pill'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  $activeSessionId.set('sess-ctx-1')
  $sessionStates.set({})
  $currentUsage.set({
    calls: 1,
    context_estimated: false,
    context_max: 32000,
    context_percent: 25,
    context_used: 8000,
    input: 6000,
    output: 2000,
    total: 8000
  })
})

describe('ContextRingPill', () => {
  it('renders used/max token readout and remaining count in aria-label', () => {
    const requestGateway = vi.fn().mockResolvedValue({
      categories: [
        { color: '#6366f1', id: 'system_prompt', label: 'System prompt', tokens: 2000 },
        { color: '#22c55e', id: 'conversation', label: 'Conversation', tokens: 6000 }
      ],
      context_estimated: false,
      context_max: 32000,
      context_percent: 25,
      context_used: 8000
    })

    render(
      <I18nProvider>
        <TooltipProvider>
          <ContextRingPill busy={false} requestGateway={requestGateway} sessionId="sess-ctx-1" />
        </TooltipProvider>
      </I18nProvider>
    )

    const button = screen.getByRole('button')
    expect(button.textContent).toContain('8k/32k')
    expect(button.getAttribute('aria-label')).toContain('24k left')
  })

  it('switches to amber and rose warning tones at high context usage', () => {
    $currentUsage.set({
      calls: 1,
      context_estimated: true,
      context_max: 10000,
      context_percent: 88,
      context_used: 8800,
      input: 7000,
      output: 1800,
      total: 8800
    })

    render(
      <I18nProvider>
        <TooltipProvider>
          <ContextRingPill busy={false} compact sessionId="sess-ctx-1" />
        </TooltipProvider>
      </I18nProvider>
    )

    const button = screen.getByRole('button')
    expect(button.textContent).toContain('88%')
    expect(button.className).toContain('text-rose-500')
  })

  it('shows Ctx instead of an ellipsis while context_max is unknown', () => {
    $currentUsage.set({ calls: 0, input: 0, output: 0, total: 0 })
    const requestGateway = vi.fn(() => new Promise<never>(() => {}))

    render(
      <I18nProvider>
        <TooltipProvider>
          <ContextRingPill busy={false} requestGateway={requestGateway} sessionId="sess-ctx-1" />
        </TooltipProvider>
      </I18nProvider>
    )

    const button = screen.getByRole('button')
    expect(button.textContent).toContain('Ctx')
    expect(button.textContent).not.toContain('…')
  })
})
