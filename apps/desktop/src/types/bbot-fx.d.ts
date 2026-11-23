import type { BbotFaceHandle } from './bbot-face'

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

export declare const FX_DEFAULTS: Required<BbotFxOptions>
export declare function applyFx(target: BbotFaceHandle | HTMLElement, options?: Partial<BbotFxOptions>): BbotFxController
