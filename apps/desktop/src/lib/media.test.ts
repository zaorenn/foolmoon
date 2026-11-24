import { describe, expect, it } from 'vitest'

import {
  isArtifactFilePath,
  isFileMediaPath,
  isInlineMediaSrc,
  isMarkdownDocumentPath,
  mediaKind,
  mediaMarkdownHref,
  mediaMime,
  mediaName,
  pathToLocalFileUrl
} from './media'

describe('lib/media core invariants', () => {
  it('classifies extensions accurately including literal # in local file paths', () => {
    expect(mediaKind('C:\\Music\\track #07.mp3')).toBe('audio')
    expect(mediaMime('C:\\Music\\track #07.mp3')).toBe('audio/mpeg')
    expect(mediaKind('https://example.com/image.png?size=large#preview')).toBe('image')
    expect(mediaMime('https://example.com/clip.webm?token=1')).toBe('video/webm')
    expect(mediaKind('/tmp/archive.bin')).toBe('file')
    expect(mediaMime('/tmp/archive.bin')).toBe('application/octet-stream')
  })

  it('identifies markdown previews separately from opaque binary media', () => {
    expect(isMarkdownDocumentPath('/notes/spec.md')).toBe(true)
    expect(isMarkdownDocumentPath('README.MARKDOWN')).toBe(true)
    expect(isMarkdownDocumentPath('/notes/photo.png')).toBe(false)
    expect(mediaMarkdownHref('/tmp/out #1.png')).toBe('#media:%2Ftmp%2Fout%20%231.png')
  })

  it('preserves Windows drive letters and encodes %, #, ? in pathToLocalFileUrl', () => {
    expect(pathToLocalFileUrl('C:\\Users\\serha\\100% #1?.png')).toBe(
      'file://C:\\Users\\serha\\100%25 %231%3F.png'
    )
    expect(pathToLocalFileUrl('file:///already/set.png')).toBe('file:///already/set.png')
    expect(mediaName('C:\\Users\\serha\\song.mp3')).toBe('song.mp3')
    expect(mediaName('https://cdn.example.com/a/b/demo.mp4?x=1')).toBe('demo.mp4')
  })

  it('distinguishes inline data/http sources vs artifact and local file paths', () => {
    expect(isInlineMediaSrc('https://example.com/a.png')).toBe(true)
    expect(isInlineMediaSrc('data:image/png;base64,AAA')).toBe(true)
    expect(isInlineMediaSrc('/tmp/a.png')).toBe(false)

    expect(isFileMediaPath('C:\\tmp\\a.png')).toBe(true)
    expect(isFileMediaPath('~/Downloads/a.png')).toBe(true)
    expect(isFileMediaPath('./relative.png')).toBe(false)

    expect(isArtifactFilePath('./relative.png')).toBe(true)
    expect(isArtifactFilePath('C:\\tmp\\a.png')).toBe(true)
  })
})
