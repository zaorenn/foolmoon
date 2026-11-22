import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { $jarvisHandsFree } from '@/store/notch'

import { StudioQuickLaunch } from './studio-quick-launch'

describe('StudioQuickLaunch', () => {
  afterEach(() => {
    cleanup()
    $jarvisHandsFree.set(false)
    window.location.hash = ''
  })

  it('renders Foolmoon quick launch actions and toggles hands-free voice + routes to studios', () => {
    render(<StudioQuickLaunch />)

    const voiceBtn = screen.getByRole('button', { name: 'Hands-Free Voice' })
    expect(voiceBtn).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hardware Notch' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'CUDA Voice Studio' })).toBeTruthy()

    fireEvent.click(voiceBtn)
    expect($jarvisHandsFree.get()).toBe(true)
    expect(screen.getByRole('button', { name: 'Voice Live' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '1-Image Studio' }))
    expect(window.location.hash).toBe('#/settings?tab=config:appearance&page=theme')

    fireEvent.click(screen.getByRole('button', { name: 'CUDA Voice Studio' }))
    expect(window.location.hash).toBe('#/settings?tab=config:voice')
  })
})
