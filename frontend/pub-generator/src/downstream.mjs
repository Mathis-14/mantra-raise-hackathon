// ── Downstream modules driven by Nemotron's JSON ──
// Flux.1 (asset gen) and Kokoro TTS (voiceover) are STUBBED for the demo:
// they log what Nemotron asked them to produce. The point of the demo is that
// Nemotron's JSON *drives* them — swap these bodies for real API calls later.

// Flux.1 — generate UI assets (badges, buttons, popups) from Nemotron's list.
export async function fluxGenerateAssets(assets = []) {
  // Real impl: call Flux.1 (via NIM / fal) per asset, save PNGs.
  return assets.map(name => ({
    name,
    status: 'stubbed',
    prompt: `mobile game UI ${name.replace(/_/g, ' ')}, flat, high contrast, transparent bg`,
    file: `assets/${name}.png`,
  }))
}

// Voiceover TTS — RÉELLE en local via macOS `say` (aucune API) : synthétise le script
// écrit par Nemotron en AIFF, converti en M4A par ffmpeg pour le mixage. Fallback stub
// silencieux si `say` est indisponible (Linux/CI).
import ffmpegPath from 'ffmpeg-static'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

const run = promisify(execFile)
const TTS_VOICE = process.env.TTS_VOICE || 'Samantha' // voix en anglais (les scripts Nemotron le sont)
const TTS_RATE = process.env.TTS_RATE || '185'        // mots/min — rythme pub

export async function kokoroTts(voiceover = '', outDir = null) {
  if (!voiceover || !outDir) {
    return { status: 'stubbed', script: voiceover, voice: 'af_bella', file: null }
  }
  const aiff = join(outDir, 'voiceover.aiff')
  const m4a = join(outDir, 'voiceover.m4a')
  try {
    await run('say', ['-v', TTS_VOICE, '-r', TTS_RATE, '-o', aiff, voiceover])
    await run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-i', aiff, '-c:a', 'aac', '-b:a', '128k', '-y', m4a])
    if (!existsSync(m4a)) throw new Error('conversion m4a manquante')
    return { status: 'synthesized', engine: 'macos-say', script: voiceover, voice: TTS_VOICE, file: m4a }
  } catch (err) {
    return { status: 'stubbed', reason: String(err.message || err), script: voiceover, voice: TTS_VOICE, file: null }
  }
}