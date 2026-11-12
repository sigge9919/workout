import { NextResponse } from "next/server";
import { collectDraw } from "@/lib/collect";

export const dynamic = "force-dynamic";
// Nyhetssökningen för 13 matcher kan ta en stund.
export const maxDuration = 300;

/**
 * GET /api/draw            insamlad data för aktuell omgång (utan Claude-sökning)
 * GET /api/draw?news=1     med nyhetsläge från Claude
 * GET /api/draw?draw=4870  en given omgång
 * GET /api/draw?force=1    hämta om trots färsk cache
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const drawNumber = Number(params.get("draw")) || undefined;
  try {
    const data = await collectDraw({
      drawNumber,
      includeNews: params.get("news") === "1",
      force: params.get("force") === "1",
    });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: `Kunde inte hämta kupongen: ${(e as Error).message}` }, { status: 502 });
  }
}
