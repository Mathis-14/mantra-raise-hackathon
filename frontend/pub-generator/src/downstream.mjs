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

// Kokoro TTS — synthesize the voiceover script Nemotron wrote.
export async function kokoroTts(voiceover = '') {
  // Real impl: call Kokoro TTS, save wav.
  return {
    status: 'stubbed',
    script: voiceover,
    voice: 'af_bella',
    file: 'voiceover.wav',
  }
}