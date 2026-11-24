import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

interface BaselineModule {
  compareScenario: (
    name: string,
    measured: Record<string, number>,
    baseline: { _meta?: Record<string, unknown>; scenarios?: Record<string, unknown> }
  ) => { regressed: boolean; rows: Array<{ metric: string; status: string }> }
  loadBaseline: (path: string) => { _meta?: Record<string, unknown>; scenarios: Record<string, unknown> }
  resolveBaselinePath: (
    dir: string,
    opts?: { arch?: string; explicitPath?: string; platform?: string; preferPlatformFile?: boolean }
  ) => string
  updateBaseline: (path: string, results: Array<{ metrics: Record<string, number>; name: string }>) => void
}

async function importBaselineModule(): Promise<BaselineModule> {
  const modPath = resolve(__dirname, '../../scripts/perf/lib/baseline.mjs')

  return (await import(/* @vite-ignore */ pathToFileURL(modPath).href)) as BaselineModule
}

describe('perf baseline resolution & comparison', () => {
  const tempDirs: string[] = []

  const makeTempDir = () => {
    const dir = mkdtempSync(join(tmpdir(), 'hermes-perf-baseline-'))
    tempDirs.push(dir)

    return dir
  }

  afterEach(() => {
    while (tempDirs.length) {
      rmSync(tempDirs.pop()!, { force: true, recursive: true })
    }
  })

  it('resolves explicit, platform-specific, and fallback baseline paths cleanly', async () => {
    const { resolveBaselinePath } = await importBaselineModule()
    const dir = makeTempDir()

    expect(
      resolveBaselinePath(dir, {
        arch: 'x64',
        explicitPath: 'D:\\custom\\baseline.json',
        platform: 'win32'
      })
    ).toBe('D:\\custom\\baseline.json')

    // Falls back to baseline.json when win32-x64 baseline does not yet exist
    expect(resolveBaselinePath(dir, { arch: 'x64', platform: 'win32' })).toBe(join(dir, 'baseline.json'))

    // Prefers platform-specific name when recording a platform baseline
    expect(resolveBaselinePath(dir, { arch: 'x64', platform: 'win32', preferPlatformFile: true })).toBe(
      join(dir, 'baseline.win32-x64.json')
    )

    // Automatically picks baseline.win32-x64.json once present on disk
    const winBaseline = join(dir, 'baseline.win32-x64.json')
    writeFileSync(winBaseline, '{"_meta":{},"scenarios":{}}\n')
    expect(resolveBaselinePath(dir, { arch: 'x64', platform: 'win32' })).toBe(winBaseline)
  })

  it('writes platform metadata on updateBaseline and detects regressions cleanly', async () => {
    const { compareScenario, loadBaseline, resolveBaselinePath, updateBaseline } = await importBaselineModule()
    const dir = makeTempDir()
    const target = resolveBaselinePath(dir, { preferPlatformFile: true })

    updateBaseline(target, [{ metrics: { frame_p95: 16.5, longtasks: 1 }, name: 'stream' }])

    const loaded = loadBaseline(target)
    expect(loaded._meta?.platform).toBe(`${process.platform}-${process.arch}`)

    const passCheck = compareScenario('stream', { frame_p95: 18, longtasks: 1 }, loaded)
    expect(passCheck.regressed).toBe(false)

    const failCheck = compareScenario('stream', { frame_p95: 45, longtasks: 1 }, loaded)
    expect(failCheck.regressed).toBe(true)
    expect(failCheck.rows.find(r => r.metric === 'frame_p95')?.status).toBe('REGRESSED')
  })
})
