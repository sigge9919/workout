// Hämtar aktuell omgång och skriver ut vad som hittades per match.
//   npm run fetch-draw                 utan Claude-sökning
//   npm run fetch-draw -- --news       med nyhetsläge (kostar)
//   npm run fetch-draw -- --force --json
import "dotenv/config";
import { collectDraw, summarize } from "../src/lib/collect";

const args = process.argv.slice(2);
const drawArg = args.find((a) => /^\d+$/.test(a));

collectDraw({
  drawNumber: drawArg ? Number(drawArg) : undefined,
  includeNews: args.includes("--news"),
  force: args.includes("--force"),
})
  .then((data) => console.log(args.includes("--json") ? JSON.stringify(data, null, 2) : summarize(data)))
  .catch((e) => {
    console.error(`Fel: ${(e as Error).message}`);
    process.exit(1);
  });
