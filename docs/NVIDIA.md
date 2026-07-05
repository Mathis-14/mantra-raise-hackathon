# NVIDIA gameplay comparison

Mantra uses NVIDIA Nemotron 3 Nano Omni to compare complete gameplay recordings with embedded audio. The model evaluates color readability, audio feedback, and video pacing. Mantra applies fixed, visible weights to those validated dimension scores and ranks the versions deterministically.

## Run a comparison

1. Add `NVIDIA_API_KEY` to `.env`.
2. Copy `docs/nvidia-comparison-input.example.json` and replace the example URLs with two to six public MP4 gameplay recordings containing their audio tracks.
3. Run:

```bash
npm run nvidia:compare -- path/to/comparison-input.json > nvidia-comparison.json
```

4. Open `http://localhost:5173/#pipeline`, select **NVIDIA Analysis**, choose **Load result JSON**, and load `nvidia-comparison.json`.

The page labels its built-in fixture as a demo comparison. Only an imported worker result is labeled as a live NVIDIA result.

## Scoring

| Dimension | Weight | What Nemotron evaluates |
| --- | ---: | --- |
| Video pacing | 45% | responsiveness, dead time, goal clarity, reward peaks |
| Color readability | 30% | player/enemy/background separation, UI contrast, effect clarity |
| Audio feedback | 25% | synchronization, event feedback, silence, repetition, intensity |

The worker calculates the weighted total; the model does not choose or hide the weighting. Every report must contain timestamped evidence and a concrete variant hypothesis.

## Current integration boundary

Playwright recordings are uploaded to the public `playtest-media` Supabase bucket and announced through a `playtest_video_ready` event. Playwright's recording is WebM video without game audio, so the event explicitly marks it as incompatible with audiovisual NVIDIA comparison. A capture path producing MP4 with embedded game audio is still required. The orchestrator and variant generator are also placeholders, so automatically replaying every generated version remains follow-up work in those owners' modules.
