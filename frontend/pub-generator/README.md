# pub-generator — gameplay.mp4 → exploitable ad

Turns a raw gameplay clip into a ready-to-run vertical ad, with **NVIDIA
Nemotron 3 acting as the AI Creative Director** that drives every downstream
module via JSON.

```
Gameplay.mp4
  └─ Frame Extraction (FFmpeg)
      └─ Vision Agent (VLM · NVIDIA NIM)      → scene-timeline.json
          └─ Nemotron 3 (Creative Director)   → ad-plan.json  (hook · EDL · CTA · VO · assets)
              ├─ Asset Agent (Flux.1)  [stub, driven by plan.assets]
              ├─ Voice Script (Kokoro) [stub, driven by plan.voiceover]
              └─ Composition (FFmpeg)          → ad.mp4  (9:16, captions/zoom from the EDL)
```

**Nemotron's JSON is the hero:** the vision model perceives, Nemotron decides
the whole edit (which moments, hook, captions, CTA, effects, tone, assets, VO),
and FFmpeg/Flux/TTS merely execute that plan.

## Setup

```bash
cp .env.example .env      # fill NVIDIA_API_KEY (nvapi-... from build.nvidia.com)
```

Models (override in `.env`):
- VLM: `meta/llama-3.2-90b-vision-instruct`
- Brain: `nvidia/nemotron-3-super-120b-a12b`

## Run

```bash
node generate.mjs <gameplay.mp4> ["Game name"]
```

Outputs land in `output/<clip-name>/`:

| file | producer | what |
|---|---|---|
| `scene-timeline.json` | VLM | per-frame events, HUD OCR, emotion, visual_importance |
| `ad-plan.json` | Nemotron 3 | hook, tone, duration, CTA, voiceover, assets, EDL |
| `assets.json` | Flux.1 (stub) | UI assets Nemotron requested |
| `voiceover.json` | Kokoro (stub) | VO script + voice |
| `ad.mp4` | FFmpeg | final 720×1280 ad with the EDL applied |
| `manifest.json` | — | ties it all together for the frontend viewer |

## Notes

- `ffmpeg-static` (bundled) has no `drawtext`; captions are rendered to PNG via
  `@napi-rs/canvas` and overlaid — no system FFmpeg needed.
- Flux.1 and Kokoro are honest stubs: they emit the payload Nemotron asked for.
  Swap their bodies for real API calls; the plan already drives them.