import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Turns the COMPUTED month numbers into narrative. The model only ever sees the
// numbers we computed and is told to use nothing else, so it can't invent figures.
const SYSTEM = `You are an Amazon Advertising analyst writing a concise month-on-month review for a founder.
You are given a JSON summary of ALREADY-COMPUTED figures (blended totals for the current and prior month, and per-campaign spend/sales/orders/ROAS for both months). Use ONLY these numbers. Do not invent or estimate any figure not present. If prior-month data is missing, write about the current month only and do not claim changes.
Thresholds: ROAS >=10 good, 5-10 okay, <5 weak (equivalently ACOS <=10% / 10-20% / >20%).
Return STRICT JSON, no markdown, with this shape:
{
  "headline": "2-3 sentence headline on the month's story",
  "winners": [{"name":"campaign","note":"one line, cite the numbers"}],
  "watch":   [{"name":"campaign","note":"one line, cite the numbers"}],
  "strategic": "2-4 sentence strategic takeaway"
}
Keep winners and watch to at most 4 items each, chosen by materiality (spend and change). Notes must be one line each and reference actual figures from the summary.`;

export async function POST(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "AI narrative isn't enabled yet — add ANTHROPIC_API_KEY to the app's environment.", needsKey: true },
      { status: 400 }
    );
  }

  let summary: unknown;
  try { summary = (await req.json()).summary; } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  if (!summary) return NextResponse.json({ error: "No summary provided" }, { status: 400 });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
        max_tokens: 1500,
        system: SYSTEM,
        messages: [{ role: "user", content: `Here is the month summary JSON:\n\n${JSON.stringify(summary)}\n\nReturn the review as strict JSON only.` }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Anthropic API ${res.status}: ${t.slice(0, 300)}` }, { status: 502 });
    }
    const data = await res.json();
    const text = (data.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n");
    const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    let narrative;
    try { narrative = JSON.parse(clean); }
    catch { return NextResponse.json({ error: "Model did not return valid JSON", raw: clean.slice(0, 500) }, { status: 502 }); }
    return NextResponse.json({ narrative });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "narrative failed" }, { status: 500 });
  }
}
