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

export declare function createFace(host: HTMLElement, options?: BbotFaceOptions): BbotFaceHandle
