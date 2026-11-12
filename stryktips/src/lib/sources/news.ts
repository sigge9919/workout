// Kvalitativt läge per match (skador, avstängningar, motivation, tränarbyten)
// via Claude med web search. Svaret valideras mot ett schema; ogiltigt svar
// räknas som att källan saknas, så analysen går vidare med lägre konfidens.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { CouponMatch, MatchNews } from "../types";

export interface NewsSource {
  name: string;
  fetchMatch(match: CouponMatch): Promise<MatchNews>;
}

const teamSchema = z.object({
  absences: z.array(
    z.object({
      player: z.string(),
      reason: z.enum(["skada", "avstängning", "annat"]),
      importance: z.enum(["nyckelspelare", "ordinarie", "bredd"]),
      status: z.enum(["borta", "osäker"]),
    }),
  ),
  managerChange: z.string().nullable(),
  motivation: z.string(),
  motivationScore: z.number().min(-2).max(2),
  fatigueScore: z.number().min(-2).max(0),
  notes: z.string(),
});

export const matchNewsSchema = z.object({
  home: teamSchema,
  away: teamSchema,
  isDerby: z.boolean(),
  venueCity: z.string().nullable(),
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  sources: z.array(z.string()),
});

const SYSTEM = `Du är fotbollsanalytiker och tar fram underlag inför en Stryktipsomgång.
Sök på webben efter det senaste läget inför matchen du får. Prioritera källor från de senaste sju dagarna:
klubbarnas egna sidor, presskonferenser, lokalpress och etablerade sportmedier.

Ta reda på för båda lagen:
- skador och avstängningar, och hur viktig varje spelare är (nyckelspelare, ordinarie, bredd)
- tränarbyte under de senaste veckorna
- motivation: titelstrid, kvalplats, nedflyttningsstrid eller inget att spela för
- matchtäthet, rotation inför cup- eller Europamatcher, långa resor
- om matchen är ett derby, och i vilken stad den spelas

Hitta inte på uppgifter. Om du inte hittar något om ett lag: lämna listan tom, skriv det i notes och sänk confidence.

Svara till sist med ENBART ett JSON-objekt, utan markdown, med exakt denna form (texter på svenska):
{
  "home": TEAM, "away": TEAM,
  "isDerby": boolean,
  "venueCity": string | null,
  "summary": "2-3 meningar om vad som kan avgöra matchen",
  "confidence": tal 0-1 (hur säkert underlaget är),
  "sources": ["url", ...]
}
där TEAM = {
  "absences": [{"player": string, "reason": "skada"|"avstängning"|"annat", "importance": "nyckelspelare"|"ordinarie"|"bredd", "status": "borta"|"osäker"}],
  "managerChange": string | null,
  "motivation": string,
  "motivationScore": tal -2..2 (−2 inget att spela för, +2 allt att spela för),
  "fatigueScore": tal -2..0 (0 utvilat, −2 kraftigt påverkat av matchtäthet/resor/rotation),
  "notes": string
}`;

/** Plockar ut JSON-objektet ur Claudes sista textblock. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Svaret innehöll inget JSON-objekt");
  return JSON.parse(text.slice(start, end + 1));
}

export function parseNews(text: string): MatchNews {
  const result = matchNewsSchema.safeParse(extractJson(text));
  if (!result.success) throw new Error(`Ogiltigt nyhetssvar: ${result.error.issues[0]?.message}`);
  return result.data;
}

export class ClaudeNews implements NewsSource {
  name = "claude-web-search";
  private client: Anthropic | null;

  constructor(
    private model = process.env.NEWS_MODEL || "claude-opus-5-5",
    client?: Anthropic,
  ) {
    this.client = client ?? (process.env.ANTHROPIC_API_KEY ? new Anthropic() : null);
  }

  get enabled() {
    return this.client !== null;
  }

  async fetchMatch(match: CouponMatch): Promise<MatchNews> {
    if (!this.client) throw new Error("ANTHROPIC_API_KEY saknas");
    const question =
      `Match: ${match.home} – ${match.away}\n` +
      `Liga: ${match.league}${match.country ? ` (${match.country})` : ""}\n` +
      `Avspark: ${match.kickoff}`;
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: question }];

    // Web search kör en loop på serversidan; pause_turn betyder att den vill fortsätta.
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: SYSTEM,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
        messages,
      });
      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }
      if (response.stop_reason === "refusal") throw new Error("Claude avböjde förfrågan");
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return parseNews(text);
    }
    throw new Error("Nyhetssökningen blev inte klar");
  }
}
