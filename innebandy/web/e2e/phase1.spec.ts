import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Phase 1 end to end: account -> team -> squad -> match -> upload + transcode
 * -> lines -> tagging with hotkeys, details, clips and auto-filled context.
 *
 * Playwright's Chromium has no H.264 decoder, so the proxy MP4 is swapped for
 * a VP9 copy of the same test video at the network layer. Real browsers play
 * the H.264 proxy directly.
 */

const FIXTURES = path.resolve(__dirname, "../../data/e2e");
const SHOTS = process.env.E2E_SCREENSHOTS ?? path.resolve(__dirname, "../../docs/screenshots/fas1");
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });

const SQUAD = [
  { nr: "1", name: "Maja Målvakt", pos: "MV" },
  { nr: "4", name: "Ella Back" },
  { nr: "7", name: "Anna Center" },
  { nr: "10", name: "Bea Forward" },
  { nr: "12", name: "Cia Forward" },
  { nr: "21", name: "Dina Back" },
];

test("phase 1: tag a match with hotkeys and get clips with context", async ({ page }) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const webm = fs.readFileSync(path.join(FIXTURES, "match.webm"));
  // Serve byte ranges like the real media endpoint so the video is seekable.
  await page.route(/\/local-storage\/media\/.*proxy\.mp4/, (route) => {
    const m = /bytes=(\d+)-(\d*)/.exec(route.request().headers()["range"] ?? "");
    if (!m) return route.fulfill({ status: 200, contentType: "video/webm", body: webm, headers: { "accept-ranges": "bytes" } });
    const start = Number(m[1]);
    const end = m[2] ? Math.min(Number(m[2]), webm.length - 1) : webm.length - 1;
    return route.fulfill({
      status: 206,
      contentType: "video/webm",
      body: webm.subarray(start, end + 1),
      headers: { "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${webm.length}` },
    });
  });

  // Account + team
  await page.goto("/login");
  await page.getByText("Inget konto? Skapa ett").click();
  await page.getByLabel("E-post").fill(`coach-${Date.now()}@example.com`);
  await page.getByLabel("Lösenord").fill("hemligt-losen-123");
  await page.getByRole("button", { name: "Skapa konto" }).click();
  await page.getByLabel("Lagets namn").fill("IBK Analys");
  await page.getByRole("button", { name: "Skapa lag" }).click();
  await expect(page.getByRole("heading", { name: "Matcher" })).toBeVisible();

  // Squad
  await page.getByRole("link", { name: "Lag & spelare" }).click();
  for (const p of SQUAD) {
    await page.locator("#nr-own").fill(p.nr);
    await page.locator("#name-own").fill(p.name);
    if (p.pos) await page.locator("#pos-own").selectOption(p.pos);
    await page.getByRole("button", { name: "Lägg till spelare" }).click();
    await expect(page.getByRole("textbox", { name: "Namn" }).last()).toHaveValue(p.name);
  }
  await shot(page, "01-trupp");

  // Match
  await page.getByRole("link", { name: "Matcher" }).click();
  await page.getByRole("button", { name: "Ny match" }).click();
  await page.getByLabel("Namn på ny motståndare").fill("Storvreta IBK");
  await page.getByRole("button", { name: "Skapa match" }).click();
  await expect(page.getByRole("heading", { name: "IBK Analys – Storvreta IBK" })).toBeVisible();

  // Lines: one line with five outfield players
  await page.getByRole("button", { name: "Lägg till femma" }).click();
  const line = page.getByTestId("line-card").first();
  for (const name of ["Ella Back", "Anna Center", "Bea Forward", "Cia Forward", "Dina Back"]) {
    await line.getByRole("button", { name: new RegExp(name) }).click();
  }
  await expect(line.getByText("5 spelare")).toBeVisible();

  // Video upload + transcode
  await page.getByLabel("Videokälla").selectOption("fixed");
  await page.getByRole("button", { name: "Lägg till video" }).click();
  await page.getByTestId("video-file").setInputFiles(path.join(FIXTURES, "match.mp4"));
  await expect(page.getByTestId("video-status")).toContainText("Klar", { timeout: 120_000 });
  await expect(page.getByTestId("video-status")).toContainText("1280×720 · 25 fps");
  await shot(page, "02-match");

  // Tagging workspace
  await page.getByRole("link", { name: "Öppna taggning" }).click();
  const video = page.getByTestId("video");
  await expect(video).toBeVisible();
  await page.waitForFunction(() => (document.querySelector("video") as HTMLVideoElement)?.readyState >= 1);

  // Period start at 0:00, goalie and line 1 on court
  await page.getByRole("button", { name: "Periodstart här" }).click();
  await expect(page.getByTestId("match-clock")).toHaveText("P1 00:00");
  await page.getByLabel("Målvakt").selectOption({ label: "#1 Maja Målvakt" });
  await page.keyboard.press("1");
  await expect(page.getByTestId("live-context")).toContainText("Femma 1");

  // Seek with the keyboard: +5 s, +2 s => 7 s
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("video-time")).toContainText("0:07.0");

  // Turnover with "t"
  await page.keyboard.press("t");
  const panel = page.getByTestId("detail-panel");
  await expect(panel.getByText("Bolltapp", { exact: true })).toBeVisible();
  await expect(panel.getByTestId("event-context")).toContainText("Period: 1");
  await expect(panel.getByTestId("event-context")).toContainText("Matchtid: 00:07");
  await expect(panel.getByTestId("event-context")).toContainText("Spelsituation: 5 mot 5");
  // Only players on court are offered (5 outfield + goalie), with one click.
  await expect(panel.getByText("Spelare (på plan)")).toBeVisible();
  await panel.getByRole("button", { name: "#7 Anna Center" }).click();
  await panel.getByRole("button", { name: "Oforcerat" }).click();
  const rink = panel.getByTestId("rink");
  const box = (await rink.boundingBox())!;
  await rink.click({ position: { x: box.width * 0.5, y: box.height * 0.3 } });
  await expect(panel.getByTestId("event-context")).toContainText("Zon: Mittzon");
  // Default clip: 5 s before, 5 s after
  await expect(panel.getByTestId("clip-start")).toHaveText("0:02.0");
  await expect(panel.getByTestId("clip-end")).toHaveText("0:12.0");
  await shot(page, "03-tagg-detaljer");

  // Shot at 1 s: per-type preset is 10 s before, clamped at the video start.
  await page.keyboard.press("Escape");
  await video.evaluate((v: HTMLVideoElement) => (v.currentTime = 1));
  await expect(page.getByTestId("video-time")).toContainText("0:01.0");
  await page.keyboard.press("s");
  await expect(panel.getByText("Skott", { exact: true })).toBeVisible();
  await expect(panel.getByTestId("clip-start")).toHaveText("0:00.0");
  await expect(panel.getByTestId("clip-end")).toHaveText("0:06.0");
  await panel.getByRole("button", { name: "Emot (de)" }).click();
  await panel.getByRole("button", { name: "Räddning" }).click();

  // Adjust clip by hand
  await panel.getByTestId("clip-editor").getByRole("button", { name: "+1 s" }).last().click();
  await expect(panel.getByTestId("clip-end")).toHaveText("0:07.0");
  await expect(panel.getByTestId("clip-editor")).toContainText("justerat");

  // Power play from 60 s, takeaway at 65 s
  await video.evaluate((v: HTMLVideoElement) => (v.currentTime = 60));
  await expect(page.getByTestId("video-time")).toContainText("1:00.0");
  await page.keyboard.press("Shift+Digit2");
  await expect(page.getByTestId("live-context")).toContainText("PP");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("v");
  await expect(panel.getByText("Bollvinst", { exact: true })).toBeVisible();
  await expect(panel.getByTestId("event-context")).toContainText("Spelsituation: PP");
  await expect(panel.getByTestId("event-context")).toContainText("Matchtid: 01:05");

  // Undo removes the last tag
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("event-list").locator("li")).toHaveCount(2);

  // A line change inserted before an existing tag re-derives who was on court
  await shot(page, "04-taggning");

  // Persisted after reload
  await page.reload();
  await expect(page.getByTestId("event-list").locator("li")).toHaveCount(2);
  await page.getByTestId("event-list").getByText("Bolltapp").click();
  await expect(panel.getByRole("button", { name: "#7 Anna Center" })).toHaveClass(/bg-blue-600/);
  await expect(panel.getByRole("button", { name: "Oforcerat" })).toHaveClass(/bg-slate-900/);

  // Settings: tag types with presets
  await page.goto("/installningar");
  await expect(page.getByRole("heading", { name: "Taggtyper och knappsats" })).toBeVisible();
  await shot(page, "05-installningar");
});
