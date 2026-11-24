import { describe, expect, it } from 'vitest'

import { normalizeFilePreviewMath, preprocessMarkdown } from './markdown-preprocess'

describe('lib/markdown-preprocess end-to-end invariants', () => {
  it('strips reasoning blocks while preserving code fences, currency dollars, and autolinks', () => {
    const input = [
      '<thinking>',
      'Internal scratchpad reasoning.',
      '</thinking>',
      '',
      'Budget is $5 to $10. See https://example.com/docs for details.',
      '',
      '```python',
      'price = "$5 + \\(x\\)"',
      '```',
      '',
      'Math equation: \\(a^2 + b^2 = c^2\\)'
    ].join('\n')

    const out = preprocessMarkdown(input)

    expect(out).not.toContain('Internal scratchpad reasoning.')
    expect(out).toContain('\\$5')
    expect(out).toContain('<https://example.com/docs>')
    expect(out).toContain('price = "$5 + \\(x\\)"')
    expect(out).toContain('$a^2 + b^2 = c^2$')
  })

  it('preserves bare URLs inside code fences and existing markdown links', () => {
    const input = [
      'Already linked: [Docs](https://example.com/a).',
      '',
      '```bash',
      'curl https://example.com/raw',
      '```'
    ].join('\n')

    const out = preprocessMarkdown(input)

    expect(out).toContain('[Docs](https://example.com/a)')
    expect(out).toContain('curl https://example.com/raw')
    expect(out).not.toContain('[https://example.com/raw](https://example.com/raw)')
  })

  it('normalizes preview math without mutating inline code or URLs', () => {
    const src = 'Inline `\\(raw\\)` vs math \\(x + y\\) and link https://example.com/file'
    const preview = normalizeFilePreviewMath(src)

    expect(preview).toContain('`\\(raw\\)`')
    expect(preview).toContain('$x + y$')
    expect(preview).toContain('https://example.com/file')
    expect(preview).not.toContain('[https://example.com/file]')
  })
})
