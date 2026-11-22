import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { CONTEXT_KIT } from '@/components/ui/actions-menu'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu'
import { $jarvisHandsFree, $notchPreviewOpen } from '@/store/notch'

import { ShellMenuItems } from './shell-menu-items'

describe('ShellMenuItems Foolmoon actions', () => {
  afterEach(() => {
    cleanup()
    $jarvisHandsFree.set(false)
    $notchPreviewOpen.set(false)
  })

  it('exposes Hardware Notch, Hands-Free Voice & Visual Studio in chrome context menu', () => {
    render(
      <MemoryRouter>
        <ContextMenu>
          <ContextMenuTrigger>
            <div>Canvas</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ShellMenuItems kit={CONTEXT_KIT} />
          </ContextMenuContent>
        </ContextMenu>
      </MemoryRouter>
    )

    fireEvent.contextMenu(screen.getByText('Canvas'))
    const notchItem = screen.getByText('Toggle Hardware Notch')
    const voiceItem = screen.getByText('Toggle Hands-Free Voice')
    const studioItem = screen.getByText('Visual & Material Studio')

    expect(notchItem).toBeTruthy()
    expect(voiceItem).toBeTruthy()
    expect(studioItem).toBeTruthy()

    fireEvent.click(voiceItem)
    expect($jarvisHandsFree.get()).toBe(true)

    fireEvent.contextMenu(screen.getByText('Canvas'))
    fireEvent.click(screen.getByText('Toggle Hardware Notch'))
    expect($notchPreviewOpen.get()).toBe(true)
  })
})
