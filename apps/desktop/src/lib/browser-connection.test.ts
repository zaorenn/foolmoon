import { LOCAL_CONNECTION_ID } from '@hermes/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createBrowserConnectionBridge, requireBrowserConnection } from './browser-connection'

describe('browser-connection', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('allows local/blank connection ids and rejects foreign ids', () => {
    expect(() => requireBrowserConnection(undefined)).not.toThrow()
    expect(() => requireBrowserConnection(null)).not.toThrow()
    expect(() => requireBrowserConnection('   ')).not.toThrow()
    expect(() => requireBrowserConnection(LOCAL_CONNECTION_ID)).not.toThrow()
    expect(() => requireBrowserConnection('remote-1')).toThrow('No connection with id "remote-1"')
  })

  it('builds local connection configs and deduplicates profile routes', async () => {
    const api = vi.fn(async ({ path }: { path: string }) => {
      if (path === '/api/profiles') {
        return { profiles: [{ name: 'default' }, { name: 'default' }, { name: 'research' }] }
      }

      return { ok: true }
    })

    const bridge = createBrowserConnectionBridge({
      api: api as <T>(req: { path: string }) => Promise<T>,
      bootstrap: {
        authRequired: false,
        basePath: '/hermes',
        privateSession: false,
        token: 'tok-123'
      }
    })

    const cfg = await bridge.getConnectionConfig(LOCAL_CONNECTION_ID)
    expect(cfg).toMatchObject({
      mode: 'remote',
      remoteTokenSet: true,
      remoteAuthMode: 'token',
      remoteUrl: `${window.location.origin}/hermes`
    })

    const routes = await bridge.getProfileRoutes(['default', 'default', 'unserved'])
    expect(routes).toEqual([
      {
        connectionId: LOCAL_CONNECTION_ID,
        mode: 'local',
        profile: 'default',
        targetProfile: 'default'
      }
    ])
  })

  it('evaluates testConnectionConfig against serving gateway origin and revalidates', async () => {
    const bridge = createBrowserConnectionBridge({
      api: (async () => ({})) as <T>(req: { path: string }) => Promise<T>,
      bootstrap: {
        authRequired: true,
        basePath: '/hermes',
        privateSession: false,
        token: ''
      }
    })

    await expect(bridge.revalidateConnection()).resolves.toEqual({ ok: true, rebuilt: false })
    await expect(bridge.testConnectionConfig({ mode: 'remote' })).resolves.toMatchObject({ ok: true, reachable: true })
    await expect(
      bridge.testConnectionConfig({ mode: 'remote', remoteUrl: `${window.location.origin}/hermes/` })
    ).resolves.toMatchObject({ ok: true, reachable: true })
    await expect(
      bridge.testConnectionConfig({ mode: 'remote', remoteUrl: 'https://other.example.com/hermes' })
    ).resolves.toMatchObject({ ok: false })
  })
})
