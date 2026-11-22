import path from 'node:path'

import { resolveLocalReadPath } from './wsl-path-bridge'

// Path preparation shared by the file-read boundaries that hand a backend-
// reported target to the hardening resolvers. On a Windows host with a WSL
// backend the target is a WSL/POSIX path (`/home/...`, `/mnt/c/...`) the
// Windows fs can't open as-is, so each boundary must route the raw path
// through resolveLocalReadPath (a no-op off Windows / for already-Windows
// paths) before it reaches the resolver. Kept here — mirroring fs-read-dir —
// so the wiring is exercised in isolation instead of buried in main.ts.

/**
 * hermes-media:// stream handler's `resolveLocalFile` dependency: the protocol
 * handler already percent-decoded the request pathname into `filePath`
 * (`parseMediaProtocolTarget` in media-protocol.ts), so this boundary only
 * bridges. Decoding or stripping leading slashes again would turn an absolute
 * POSIX path (`/home/...`) into a cwd-relative one that ENOENTs into the
 * handler's silent 404, and a second `decodeURIComponent` throws on filenames
 * containing a literal `%`.
 */
export function resolveMediaStreamFile(filePath: unknown): string {
  return resolveLocalReadPath(String(filePath ?? ''))
}

/**
 * hermes:readFileDataUrl / hermes:readFileDataUrlForAttach / hermes:readFileText
 * IPC handlers: a renderer-supplied path → a bridged fs path.
 */
export function resolveIpcFileReadPath(filePath: unknown): string {
  return resolveLocalReadPath(String(filePath ?? ''))
}

/**
 * previewFileTarget: `file:` URLs pass through untouched, plain targets get `~`
 * expanded, and the result is bridged before it reaches resolveRequestedPathForIpc.
 */
export function resolvePreviewTargetPath(rawTarget: string, expandUserPath: (value: string) => string): string {
  return resolveLocalReadPath(/^file:/i.test(rawTarget) ? rawTarget : expandUserPath(rawTarget))
}

/**
 * Fallback candidates when a Windows model or `MEDIA:/filename` card supplies
 * a leading-slash path (`/portfolio_site.html`) or bare relative path that does
 * not exist at drive root `C:\portfolio_site.html`, checking candidate dirs
 * such as active cwd, home dir, and HERMES_HOME. Rejects traversal (`..`), UNC,
 * explicit Windows drive paths, and URLs.
 */
export function windowsFallbackPreviewCandidates(
  rawTarget: string,
  candidateDirs: readonly string[],
  platform: NodeJS.Platform = process.platform
): string[] {
  const trimmed = String(rawTarget || '').trim()

  if (
    !trimmed ||
    /^(?:file|https?):/i.test(trimmed) ||
    /^[A-Za-z]:[/\\]/.test(trimmed) ||
    trimmed.startsWith('\\\\') ||
    trimmed.startsWith('//')
  ) {
    return []
  }

  const pathApi = platform === 'win32' ? path.win32 : path.posix
  let rel = ''

  if (platform === 'win32' && trimmed.startsWith('/')) {
    rel = trimmed.replace(/^\/+/, '')
  } else if (!pathApi.isAbsolute(trimmed)) {
    rel = trimmed
  }

  if (!rel) {
    return []
  }

  const segments = rel.split(/[/\\]+/).filter(Boolean)

  if (segments.length === 0 || segments.includes('..')) {
    return []
  }

  const normalizedRel = segments.join(platform === 'win32' ? '\\' : '/')
  const seen = new Set<string>()
  const out: string[] = []

  for (const dir of candidateDirs) {
    const cleanDir = String(dir || '').trim()

    if (!cleanDir) {
      continue
    }

    const joined = pathApi.join(cleanDir, normalizedRel)

    if (!seen.has(joined)) {
      seen.add(joined)
      out.push(joined)
    }
  }

  return out
}
