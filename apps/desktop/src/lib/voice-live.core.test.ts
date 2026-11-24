import { afterEach, describe, expect, it, vi } from 'vitest'

import { chunkForCommentary, fetchVoiceLiveStatus, toLiveHistory } from './voice-live'

describe('lib/voice-live core invariants', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('chunks long commentary cleanly on sentence boundaries within budget', () => {
    expect(chunkForCommentary('   \n  ')).toEqual([])
    expect(chunkForCommentary('Short sentence.')).toEqual(['Short sentence.'])

    const s1 = 'First sentence is concise.'
    const s2 = 'Second sentence carries another clear point.'
    const s3 = 'Third final sentence.'
    const chunks = chunkForCommentary(`${s1} ${s2} ${s3}`, 50)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every(chunk => chunk.length <= 50)).toBe(true)
    expect(chunks.join(' ')).toBe(`${s1} ${s2} ${s3}`)
  })

  it('builds seed history preserving newest messages within maxMessages and maxChars', () => {
    const history = toLiveHistory(
      [
        { role: 'user', text: '   ' },
        { role: 'user', text: 'older message that does not fit budget' },
        { role: 'assistant', text: 'Recent answer.' },
        { role: 'user', text: 'Follow up?' }
      ],
      10,
      30
    )

    expect(history).toEqual([
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Recent answer.' }] },
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Follow up?' }] }
    ])
  })

  it('handles unavailable voice-live endpoints without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline')
    }))

    await expect(fetchVoiceLiveStatus()).resolves.toBeNull()
  })
})
