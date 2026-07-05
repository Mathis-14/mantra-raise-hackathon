import { readDemoImage } from "@/lib/google-ads";

export const runtime = "nodejs";

export async function GET() {
  const image = await readDemoImage();
  return new Response(new Uint8Array(image), {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "image/png",
    },
  });
}
