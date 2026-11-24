import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const RELATIVE_IMPORT_RE = /^\s*@import\s+['"](\.[^'"]+)['"]\s*;\s*$/gm

/**
 * Read a CSS entrypoint and recursively inline local relative `@import './...'`
 * directives so Node/jsdom tests inspect the full authored stylesheet even when
 * rules live in modular files under `src/styles/`.
 */
export function readStylesheetWithImports(entryPath: string, seen = new Set<string>()): string {
  const fullPath = resolve(entryPath)

  if (seen.has(fullPath)) {
    return ''
  }

  seen.add(fullPath)
  const dir = dirname(fullPath)
  const raw = readFileSync(fullPath, 'utf8')

  return raw.replace(RELATIVE_IMPORT_RE, (_match, relPath: string) =>
    readStylesheetWithImports(resolve(dir, relPath), seen)
  )
}
