// ── NVIDIA NIM client (build.nvidia.com, OpenAI-compatible) ──
// Two roles: a VLM (vision) that reads frames, and Nemotron 3 (the brain)
// that plans the ad. Both hit the same OpenAI-compatible endpoint.
import OpenAI from 'openai'
import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dir, '../.env') })

const {
  NVIDIA_API_KEY,
  NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1',
  VLM_MODEL = 'qwen/qwen2.5-vl-72b-instruct',
  NEMOTRON_MODEL = 'nvidia/nemotron-3-super-120b-a12b',
} = process.env

if (!NVIDIA_API_KEY) {
  throw new Error('NVIDIA_API_KEY missing — copy .env.example to .env and fill it')
}

const client = new OpenAI({ apiKey: NVIDIA_API_KEY, baseURL: NVIDIA_BASE_URL })

export const MODELS = { vlm: VLM_MODEL, nemotron: NEMOTRON_MODEL }

// Encode a local image file as an OpenAI image_url data URI part.
export function imagePart(filePath) {
  const b64 = readFileSync(filePath).toString('base64')
  return { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }
}

// Pull the first fenced/loose JSON object out of a model reply.
export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const startArr = raw.indexOf('[')
  const from = start === -1 ? startArr : startArr === -1 ? start : Math.min(start, startArr)
  if (from === -1) throw new Error('no JSON found in model reply')
  const slice = raw.slice(from)
  // balance-match to the matching closing bracket
  const open = slice[0]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  for (let i = 0; i < slice.length; i++) {
    if (slice[i] === open) depth++
    else if (slice[i] === close) { depth--; if (depth === 0) return JSON.parse(slice.slice(0, i + 1)) }
  }
  throw new Error('unbalanced JSON in model reply')
}

// ── VLM: describe one frame → structured scene event ──
export async function vlmDescribeFrame(framePath, timestamp) {
  const res = await client.chat.completions.create({
    model: MODELS.vlm,
    temperature: 0.2,
    max_tokens: 400,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              `This is a frame from a mobile game at t=${timestamp}s. ` +
              `Return ONLY a JSON object describing what is happening, with keys: ` +
              `event (short string), hud_text (OCR of any on-screen numbers/text or ""), ` +
              `emotion (low|medium|high), explosion (boolean), ` +
              `visual_importance (0..1 float, how ad-worthy this moment is). ` +
              `No prose, JSON only.`,
          },
          imagePart(framePath),
        ],
      },
    ],
  })
  const txt = res.choices[0]?.message?.content ?? ''
  const obj = extractJson(txt)
  return { timestamp, ...obj }
}

// ── Nemotron 3: the AI Creative Director ──
// Takes the scene timeline, returns a full ad plan (hook, EDL, captions, CTA,
// voiceover script, asset list). This JSON drives every downstream module.
export async function nemotronPlanAd(game, sceneTimeline) {
  const res = await client.chat.completions.create({
    model: MODELS.nemotron,
    temperature: 0.6,
    max_tokens: 1600,
    messages: [
      {
        role: 'system',
        content:
          'You are an AI Creative Director for mobile-game user-acquisition ads. ' +
          'Given a scene timeline extracted from gameplay, you decide the whole ad: ' +
          'the hook, which moments to keep, where the CTA goes, editing effects, tone, ' +
          'captions, the assets to generate, and a voiceover script. ' +
          'You output a single JSON object only.',
      },
      {
        role: 'user',
        content:
          `Game: ${game}\n` +
          `Scene timeline (from a vision model):\n${JSON.stringify(sceneTimeline, null, 2)}\n\n` +
          `Produce an Ad Plan JSON with exactly these keys:\n` +
          `{\n` +
          `  "hook": string,                       // punchy opening line\n` +
          `  "tone": "casual"|"competitive"|"humorous",\n` +
          `  "duration_s": number,                 // final ad length, 8..20\n` +
          `  "cta": string,                        // call to action\n` +
          `  "voiceover": string,                  // 1-2 sentence VO script\n` +
          `  "assets": string[],                   // e.g. ["download_button","gold_popup"]\n` +
          `  "edl": [                              // edit decision list, time-ordered\n` +
          `    { "time": number, "source_time": number, "zoom"?: number,\n` +
          `      "shake"?: boolean, "caption"?: string, "overlay"?: string }\n` +
          `  ]\n` +
          `}\n` +
          `Pick the highest visual_importance moments. JSON only.`,
      },
    ],
  })
  const txt = res.choices[0]?.message?.content ?? ''
  return extractJson(txt)
}