import type {
  ActionResponse,
  ActionStatusResponse,
  AudioSpeakResponse,
  AudioSttLeaseResponse,
  AudioTranscriptionResponse,
  AudioTtsLeaseResponse,
  BackendUpdateCheckResponse,
  CuratorStatusResponse,
  DebugShareResponse,
  ElevenLabsVoicesResponse,
  LmStudioModelsResponse,
  MemoryProviderConfig,
  MemoryProviderOAuthStatus,
  MemoryStatusResponse,
  StudioSkinSyncRequest,
  StudioSkinSyncResponse,
  ThemeFromImageRequest,
  ThemeFromImageResponse,
  UserSkinsResponse,
  VoiceCloneAudioResponse,
  VoiceCloneCreateResponse,
  VoiceCloneListResponse,
  VoiceEngineInstallResponse
} from '@/types/hermes'

import {
  capabilityScoped,
  hermesApi,
  hermesApiAs,
  type OwnerScope,
  ownerScoped,
  type ProfileScope,
  profileScoped,
  type ResolvedOwner
} from './client'

export const AUDIO_SPEAK_MIN_REQUEST_TIMEOUT_MS = 180_000
export const AUDIO_SPEAK_MAX_REQUEST_TIMEOUT_MS = 600_000
const AUDIO_SPEAK_TIMEOUT_MS_PER_CHAR = 35

export function audioSpeakRequestTimeoutMs(text: string): number {
  const estimated = Math.max(
    AUDIO_SPEAK_MIN_REQUEST_TIMEOUT_MS,
    Math.ceil(String(text || '').length * AUDIO_SPEAK_TIMEOUT_MS_PER_CHAR)
  )

  return Math.min(AUDIO_SPEAK_MAX_REQUEST_TIMEOUT_MS, estimated)
}

export const AUDIO_TRANSCRIBE_MIN_REQUEST_TIMEOUT_MS = 180_000
export const AUDIO_TRANSCRIBE_MAX_REQUEST_TIMEOUT_MS = 600_000
// The transcribe payload is the base64 audio data URL itself, so its string
// length tracks clip size. ~0.1ms/char keeps short clips at the floor while
// letting multi-minute recordings scale toward the cap (a base64 char is
// ~0.75 bytes, so at 128kbps ≈ 21k chars/s of audio this budgets ~2s of
// timeout per 1s of audio before the cap clamps it).
const AUDIO_TRANSCRIBE_TIMEOUT_MS_PER_CHAR = 0.1

export function audioTranscribeRequestTimeoutMs(dataUrl: string): number {
  const estimated = Math.max(
    AUDIO_TRANSCRIBE_MIN_REQUEST_TIMEOUT_MS,
    Math.ceil(String(dataUrl || '').length * AUDIO_TRANSCRIBE_TIMEOUT_MS_PER_CHAR)
  )

  return Math.min(AUDIO_TRANSCRIBE_MAX_REQUEST_TIMEOUT_MS, estimated)
}

// surface=declared serves the curated desktop schema; the dashboard consumes the raw plugin schema.
export function getMemoryProviderConfig(provider: string, profile?: null | string): Promise<MemoryProviderConfig> {
  return hermesApi<MemoryProviderConfig>({
    ...profileScoped(profile),
    path: `/api/memory/providers/${encodeURIComponent(provider)}/config?surface=declared`
  })
}

export function saveMemoryProviderConfig(
  provider: string,
  values: Record<string, string>,
  profile?: null | string
): Promise<{ ok: boolean }> {
  return hermesApi<{ ok: boolean }>({
    ...profileScoped(profile),
    path: `/api/memory/providers/${encodeURIComponent(provider)}/config?surface=declared`,
    method: 'PUT',
    body: { values }
  })
}

// Memory-provider OAuth connect (provider-keyed; 404s for providers without an
// OAuth flow). Profile-scoped: the grant lands in the active profile's config.
export function startMemoryProviderOAuth(
  provider: string,
  profile?: null | string
): Promise<MemoryProviderOAuthStatus> {
  return hermesApi<MemoryProviderOAuthStatus>({
    ...profileScoped(profile),
    path: `/api/memory/providers/${encodeURIComponent(provider)}/oauth/start`,
    method: 'POST'
  })
}

export function getMemoryProviderOAuthStatus(
  provider: string,
  profile?: null | string
): Promise<MemoryProviderOAuthStatus> {
  return hermesApi<MemoryProviderOAuthStatus>({
    ...profileScoped(profile),
    path: `/api/memory/providers/${encodeURIComponent(provider)}/oauth/status`
  })
}

// ---------------------------------------------------------------------------
// Memory data + curator (parity with `hermes memory` / `hermes curator`).
// ---------------------------------------------------------------------------

export interface MemoryFileState {
  chars: number
  content: string
  entries: string[]
  limit: number
}

export interface MemoryFilesResponse {
  compression: { enabled: boolean; threshold: number }
  delimiter: string
  memory: MemoryFileState
  memory_enabled: boolean
  user: MemoryFileState
  user_profile_enabled: boolean
}

export interface MemoryProfileSeedPayload {
  address_as: string
  apply_personality?: boolean
  language: string
  name: string
  role: string
  rules: string
  style: string
}

export interface FoolmoonManifest {
  core_hook_files: string[]
  foolmoon_branch: string
  foolmoon_repo: string
  product: string
  protected_paths: string[]
  upstream_branch: string
  upstream_repo: string
  version: string
}

export interface HermesCoreUpdateCheckResponse {
  behind: number
  branch: string
  conflicting_files: string[]
  current_sha: string
  error?: string
  latest_date?: string
  latest_subject?: string
  repo: string
  safe_merge_preview: boolean
  update_available: boolean
  upstream_sha: string
}

export interface HermesCoreUpdateApplyResponse {
  error?: string
  integrity_errors?: string[]
  needs_restart?: boolean
  ok: boolean
  post_sha?: string
  pre_sha?: string
  rollback_ref?: string
  rolled_back?: boolean
  updated?: boolean
}

export interface FoolmoonAppUpdateCheckResponse {
  branch?: string
  checksum_asset?: string
  current_sha?: string
  current_version: string
  error?: string
  git_behind: number
  installer_asset?: string
  latest_subject?: string
  latest_version: string
  release_available: boolean
  release_notes?: string
  release_url?: string
  remote_sha?: string
  repo: string
  update_available: boolean
}

export interface FoolmoonAppUpdateApplyResponse {
  desktop_rebuilt?: boolean
  downloaded_installer?: string
  error?: string
  integrity_errors?: string[]
  needs_restart?: boolean
  ok: boolean
  post_sha?: string
  pre_sha?: string
  rolled_back?: boolean
  sha256_verified?: boolean
  updated?: boolean
}

export function getMemoryStatus(profile?: null | string): Promise<MemoryStatusResponse> {
  return hermesApi<MemoryStatusResponse>({
    ...profileScoped(profile),
    path: '/api/memory'
  })
}

export function getMemoryFiles(profile?: null | string): Promise<MemoryFilesResponse> {
  return hermesApi<MemoryFilesResponse>({
    ...profileScoped(profile),
    path: '/api/memory/files'
  })
}

export function saveMemoryFile(
  target: 'memory' | 'user',
  content: string,
  profile?: null | string
): Promise<{ chars: number; entries: string[]; ok: boolean; target: 'memory' | 'user' }> {
  return hermesApi<{ chars: number; entries: string[]; ok: boolean; target: 'memory' | 'user' }>({
    ...profileScoped(profile),
    path: '/api/memory/files',
    method: 'PUT',
    body: { content, target }
  })
}

export function seedUserMemoryProfile(
  payload: MemoryProfileSeedPayload,
  profile?: null | string
): Promise<{ chars: number; entries: string[]; ok: boolean }> {
  return hermesApi<{ chars: number; entries: string[]; ok: boolean }>({
    ...profileScoped(profile),
    path: '/api/memory/profile-seed',
    method: 'POST',
    body: payload
  })
}

export function resetMemory(
  target: 'all' | 'memory' | 'user',
  profile?: null | string
): Promise<{ deleted: string[]; ok: boolean }> {
  return hermesApi<{ deleted: string[]; ok: boolean }>({
    ...profileScoped(profile),
    path: '/api/memory/reset',
    method: 'POST',
    body: { target }
  })
}

export function getCuratorStatus(): Promise<CuratorStatusResponse> {
  return hermesApi<CuratorStatusResponse>({
    ...profileScoped(),
    path: '/api/curator'
  })
}

export function setCuratorPaused(paused: boolean): Promise<{ ok: boolean; paused: boolean }> {
  return hermesApi<{ ok: boolean; paused: boolean }>({
    ...profileScoped(),
    path: '/api/curator/paused',
    method: 'PUT',
    body: { paused }
  })
}

export function runCurator(): Promise<ActionResponse> {
  return hermesApi<ActionResponse>({
    ...profileScoped(),
    path: '/api/curator/run',
    method: 'POST',
    body: {}
  })
}

export function restartGateway(profile?: null | string): Promise<ActionResponse> {
  return hermesApi<ActionResponse>({
    ...profileScoped(profile),
    path: '/api/gateway/restart',
    method: 'POST'
  })
}

export function updateHermes(): Promise<ActionResponse> {
  return hermesApi<ActionResponse>({
    ...profileScoped(),
    path: '/api/hermes/update',
    method: 'POST'
  })
}

/** Query the connected backend's own update state. In remote mode this is the
 *  authoritative source for the backend's behind-count + "what's changed",
 *  distinct from the Electron client clone's git state. */
export function checkHermesUpdate(force = false): Promise<BackendUpdateCheckResponse> {
  return hermesApi<BackendUpdateCheckResponse>({
    ...profileScoped(),
    path: `/api/hermes/update/check${force ? '?force=true' : ''}`
  })
}

export function getActionStatus(name: string, lines = 200, profile?: ProfileScope): Promise<ActionStatusResponse> {
  return window.hermesDesktop.api<ActionStatusResponse>({
    ...capabilityScoped(profile),
    path: `/api/actions/${encodeURIComponent(name)}/status?lines=${Math.max(1, lines)}`
  })
}

/** `owner` = the recording's owner, resolved when the mic opened: the audio is
 *  decoded on the backend its STT warm-up targeted. Omitted → the active scope. */
export function transcribeAudio(
  dataUrl: string,
  mimeType?: string,
  owner?: ResolvedOwner
): Promise<AudioTranscriptionResponse> {
  const request = {
    path: '/api/audio/transcribe',
    method: 'POST',
    body: {
      data_url: dataUrl,
      mime_type: mimeType
    },
    // Transcription blocks until provider STT, file handling, and response
    // encoding finish. Remote providers and long clips regularly exceed the
    // default 15s Electron backend timeout.
    timeoutMs: audioTranscribeRequestTimeoutMs(dataUrl)
  }

  return owner
    ? hermesApiAs<AudioTranscriptionResponse>(owner, request)
    : hermesApi<AudioTranscriptionResponse>({ ...profileScoped(), ...request })
}

// `owner` = the speaking session's (connection, profile) — a Bot's own TTS
// voice on its own gateway; omitted halves → the active scope.
export function speakText(text: string, owner?: OwnerScope): Promise<AudioSpeakResponse> {
  return hermesApi<AudioSpeakResponse>({
    ...ownerScoped(owner),
    path: '/api/audio/speak',
    method: 'POST',
    body: { text },
    // TTS blocks until provider synthesis, file read, and base64 encoding
    // finish. Remote providers and large messages regularly exceed the
    // default 15s Electron backend timeout.
    timeoutMs: audioSpeakRequestTimeoutMs(text)
  })
}

// Acquiring a lease pre-loads the configured TTS engine. For local engines
// that is a model load and, on a fresh install, a voice download — well past
// the default 15s Electron backend timeout.
export const AUDIO_TTS_LEASE_REQUEST_TIMEOUT_MS = 180_000

/**
 * Tell the backend a speech-output toggle flipped so it can warm the TTS engine
 * (`active: true`) or release it once no surface needs it (`active: false`).
 * `lease` names the toggle — `desktop:read-aloud`, `desktop:conversation`.
 */
export function setTtsLease(lease: string, active: boolean): Promise<AudioTtsLeaseResponse> {
  return hermesApi<AudioTtsLeaseResponse>({
    ...profileScoped(),
    path: '/api/audio/tts-lease',
    method: 'POST',
    body: { active, lease },
    timeoutMs: AUDIO_TTS_LEASE_REQUEST_TIMEOUT_MS
  })
}

// Same cold-start class as TTS: acquiring a lease pre-loads the local STT
// model (first-use download + load), which on CPU-bound hosts can exceed the
// transcription floor on its own (issue #105955). The desktop acquires when
// the mic opens so the load happens while the user is still speaking.
export const AUDIO_STT_LEASE_REQUEST_TIMEOUT_MS = 180_000

/**
 * Tell the backend a voice-input session started (`active: true`) so it can
 * warm the STT engine, or ended (`active: false`), which the backend only
 * acknowledges: the model stays loaded.
 * `lease` names the session — `desktop:voice-input:<renderer>`. `owner` is
 * the voice operation's owner, resolved once when it started, so a queued call
 * is never re-routed by a later gateway/profile switch.
 */
export function setSttLease(lease: string, active: boolean, owner: ResolvedOwner): Promise<AudioSttLeaseResponse> {
  return hermesApiAs<AudioSttLeaseResponse>(owner, {
    path: '/api/audio/stt-lease',
    method: 'POST',
    body: { active, lease },
    timeoutMs: AUDIO_STT_LEASE_REQUEST_TIMEOUT_MS
  })
}

export function getElevenLabsVoices(profile?: null | string): Promise<ElevenLabsVoicesResponse> {
  return hermesApi<ElevenLabsVoicesResponse>({
    path: '/api/audio/elevenlabs/voices',
    ...profileScoped(profile)
  })
}

export function listVoiceClones(profile?: null | string): Promise<VoiceCloneListResponse> {
  return hermesApi<VoiceCloneListResponse>({
    path: '/api/audio/clones',
    ...profileScoped(profile)
  })
}

export function installVoiceEngine(
  payload: {
    activate?: boolean
    target_id: string
    target_type: 'tts' | 'stt'
  },
  profile?: null | string
): Promise<VoiceEngineInstallResponse> {
  return hermesApi<VoiceEngineInstallResponse>({
    ...profileScoped(profile),
    body: {
      activate: payload.activate ?? true,
      target_id: payload.target_id,
      target_type: payload.target_type
    },
    method: 'POST',
    path: '/api/audio/engines/install',
    timeoutMs: 60_000
  })
}

export function activateVoiceEngine(
  payload: {
    target_id: string
    target_type: 'tts' | 'stt'
  },
  profile?: null | string
): Promise<VoiceCloneListResponse> {
  return hermesApi<VoiceCloneListResponse>({
    ...profileScoped(profile),
    body: {
      activate: true,
      target_id: payload.target_id,
      target_type: payload.target_type
    },
    method: 'POST',
    path: '/api/audio/engines/activate',
    timeoutMs: 30_000
  })
}

export function createVoiceClone(
  payload: {
    data_url: string
    filename?: string
    name: string
    ref_text?: string
    activate?: boolean
  },
  profile?: null | string
): Promise<VoiceCloneCreateResponse> {
  return hermesApi<VoiceCloneCreateResponse>({
    ...profileScoped(profile),
    body: {
      activate: payload.activate ?? true,
      data_url: payload.data_url,
      filename: payload.filename,
      name: payload.name,
      ref_text: payload.ref_text
    },
    method: 'POST',
    path: '/api/audio/clones',
    timeoutMs: 120_000
  })
}

export function setActiveVoiceClone(
  cloneId: string | null,
  profile?: null | string,
  opts?: { engine?: string; warm?: boolean }
): Promise<VoiceCloneListResponse> {
  return hermesApi<VoiceCloneListResponse>({
    ...profileScoped(profile),
    body: {
      clone_id: cloneId ?? '',
      ...(opts?.engine ? { engine: opts.engine } : {}),
      warm: opts?.warm ?? true
    },
    method: 'POST',
    path: '/api/audio/clones/activate',
    timeoutMs: 120_000
  })
}

export function deleteVoiceClone(cloneId: string, profile?: null | string): Promise<{ ok: boolean }> {
  return hermesApi<{ ok: boolean }>({
    ...profileScoped(profile),
    method: 'DELETE',
    path: `/api/audio/clones/${encodeURIComponent(cloneId)}`
  })
}

export function getVoiceCloneAudio(
  cloneId: string,
  profile?: null | string
): Promise<VoiceCloneAudioResponse> {
  return hermesApi<VoiceCloneAudioResponse>({
    ...profileScoped(profile),
    path: `/api/audio/clones/${encodeURIComponent(cloneId)}/audio`
  })
}

export function generateThemeFromImage(
  payload: ThemeFromImageRequest,
  profile?: null | string
): Promise<ThemeFromImageResponse> {
  return hermesApi<ThemeFromImageResponse>({
    ...profileScoped(profile),
    body: payload,
    method: 'POST',
    path: '/api/themes/from-image',
    timeoutMs: 60_000
  })
}

export function syncStudioSkinToTui(
  payload: StudioSkinSyncRequest,
  profile?: null | string
): Promise<StudioSkinSyncResponse> {
  return hermesApi<StudioSkinSyncResponse>({
    ...profileScoped(profile),
    body: payload,
    method: 'POST',
    path: '/api/themes/studio-skin',
    timeoutMs: 30_000
  })
}

export function listUserSkins(profile?: null | string): Promise<UserSkinsResponse> {
  return hermesApi<UserSkinsResponse>({
    ...profileScoped(profile),
    path: '/api/themes/user-skins'
  })
}

export function deleteUserSkin(slug: string, profile?: null | string): Promise<{ deleted: string; ok: boolean }> {
  return hermesApi<{ deleted: string; ok: boolean }>({
    ...profileScoped(profile),
    method: 'DELETE',
    path: `/api/themes/user-skins/${encodeURIComponent(slug)}`
  })
}

export function getLmStudioModels(profile?: null | string): Promise<LmStudioModelsResponse> {
  return hermesApi<LmStudioModelsResponse>({
    ...profileScoped(profile),
    path: '/api/models/lmstudio'
  })
}

export function selectLmStudioModel(
  model: string,
  opts?: { baseUrl?: string; profile?: null | string }
): Promise<{ base_url: string; model: string; ok: boolean; provider: string }> {
  return hermesApi<{ base_url: string; model: string; ok: boolean; provider: string }>({
    ...profileScoped(opts?.profile),
    body: {
      model,
      ...(opts?.baseUrl ? { base_url: opts.baseUrl } : {})
    },
    method: 'POST',
    path: '/api/models/lmstudio/select'
  })
}

// ---------------------------------------------------------------------------
// Maintenance operations (parity with `hermes doctor` / `hermes security
// audit` / `hermes backup` / `hermes debug share` and the dashboard System
// page). All except debug share are spawn-based background actions tailed via
// getActionStatus().
//
// Every one carries the ambient profile: Electron pins the whole /api/ops
// family to the shared primary backend (connection-config's
// LOCAL_PRIMARY_SCOPED_ROUTES), so an unprofiled call acts on that backend's
// LAUNCH profile — and debug share uploads a home's logs and config.
// ---------------------------------------------------------------------------

export function runDoctor(): Promise<ActionResponse> {
  return hermesApi<ActionResponse>({ ...profileScoped(), path: '/api/ops/doctor', method: 'POST', body: {} })
}

export function runSecurityAudit(): Promise<ActionResponse> {
  return hermesApi<ActionResponse>({
    ...profileScoped(),
    path: '/api/ops/security-audit',
    method: 'POST',
    body: {}
  })
}

export function runBackup(): Promise<ActionResponse & { archive?: string }> {
  return hermesApi<ActionResponse & { archive?: string }>({
    ...profileScoped(),
    path: '/api/ops/backup',
    method: 'POST',
    body: {}
  })
}

// `owner` is resolved before the consent dialog opens: profile shortcuts stay
// live behind it, so the ambient scope at upload time may be another profile.
export function runDebugShare(owner: ResolvedOwner): Promise<DebugShareResponse> {
  return hermesApiAs<DebugShareResponse>(owner, {
    path: '/api/ops/debug-share',
    method: 'POST',
    // Only called after the user confirmed the upload; the backend refuses a missing consent.
    body: { consent: true },
    // Synchronous upload of the allowlisted summary to the public paste service.
    timeoutMs: 120_000
  })
}

export function getFoolmoonManifest(): Promise<FoolmoonManifest> {
  return hermesApi<FoolmoonManifest>({
    ...profileScoped(),
    path: '/api/foolmoon/updates/manifest'
  })
}

export function checkHermesCoreUpdate(): Promise<HermesCoreUpdateCheckResponse> {
  return hermesApi<HermesCoreUpdateCheckResponse>({
    ...profileScoped(),
    path: '/api/foolmoon/updates/hermes/check',
    method: 'POST',
    timeoutMs: 60_000
  })
}

export function applyHermesCoreUpdate(): Promise<HermesCoreUpdateApplyResponse> {
  return hermesApi<HermesCoreUpdateApplyResponse>({
    ...profileScoped(),
    path: '/api/foolmoon/updates/hermes/apply',
    method: 'POST',
    timeoutMs: 180_000
  })
}

export function checkFoolmoonAppUpdate(): Promise<FoolmoonAppUpdateCheckResponse> {
  return hermesApi<FoolmoonAppUpdateCheckResponse>({
    ...profileScoped(),
    path: '/api/foolmoon/updates/app/check',
    method: 'POST',
    timeoutMs: 60_000
  })
}

export function applyFoolmoonAppUpdate(
  mode: 'auto' | 'git' | 'installer' = 'auto'
): Promise<FoolmoonAppUpdateApplyResponse> {
  return hermesApi<FoolmoonAppUpdateApplyResponse>({
    ...profileScoped(),
    path: '/api/foolmoon/updates/app/apply',
    method: 'POST',
    body: { mode },
    timeoutMs: 300_000
  })
}
