declare module '@bwnd/bbot' {
  export interface BbotFaceOptions {
    blink?: boolean
    expression?: string
    idle?: boolean
    mouth?: boolean
    pupils?: boolean
    track?: boolean
  }

  export interface BbotTalkTone {
    round?: number
    wide?: number
  }

  export interface BbotFaceHandle {
    destroy: () => void
    el: SVGSVGElement
    look: (x: number, y: number, ms?: number) => BbotFaceHandle
    react: (name: string, options?: { force?: boolean }) => BbotFaceHandle
    set: (options: Partial<BbotFaceOptions>) => BbotFaceHandle
    setExpression: (name: string) => BbotFaceHandle
    talk: (level: number, tone?: BbotTalkTone) => BbotFaceHandle
  }

  export function createFace(host: HTMLElement, options?: BbotFaceOptions): BbotFaceHandle
}

declare module '@bwnd/bbot/fx' {
  import type { BbotFaceHandle } from '@bwnd/bbot'

  export interface BbotFxOptions {
    bloom?: number
    chrome?: number
    glass?: number
    gloss?: number
    halation?: number
    holo?: number
    hue?: number
    rim?: number
    scan?: number
    scratch?: number
  }

  export interface BbotFxController {
    destroy: () => void
    el: SVGSVGElement
    get: () => Required<BbotFxOptions>
    set: (options: Partial<BbotFxOptions>) => BbotFxController
  }

  export const FX_DEFAULTS: Required<BbotFxOptions>
  export function applyFx(target: BbotFaceHandle | HTMLElement, options?: Partial<BbotFxOptions>): BbotFxController
}

declare module '@bwnd/bbot/expressions' {
  export const EXPRESSION_NAMES: string[]
  export const EXPRESSIONS: Record<string, Record<string, number>>
  export const REACTIONS: Record<string, { dur: number; apply: (p: number, offsets: Record<string, number>) => void }>
}

declare module '@bwnd/bbot/talk' {
  import type { BbotFaceHandle } from '@bwnd/bbot'

  export function listen(
    source: HTMLMediaElement | MediaStream | AudioNode,
    face: Pick<BbotFaceHandle, 'talk'>,
    options?: {
      audioContext?: AudioContext
      curve?: number
      gain?: number
      gate?: number
      onLevel?: (level: number) => void
      output?: boolean
    }
  ): () => void
}

declare module '@bwnd/bbot/face.css' {}
