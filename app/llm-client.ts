// Calls the user's LOCAL Ollama (Llama 3.1 8B) directly from the browser, so their
// ad numbers go to their own Mac, never to a paid cloud. Requires the Ollama app
// running, and (when Pulse is served over https) OLLAMA_ORIGINS to allow this origin.

const OLLAMA = "http://localhost:11434";
export const OLLAMA_MODEL = "llama3.1:8b";

export class OllamaError extends Error {}

export async function ollamaChat(system: string, user: string, opts: { json?: boolean } = {}): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        options: { temperature: 0.4 },
        ...(opts.json ? { format: "json" } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch {
    throw new OllamaError("Can't reach Ollama on your Mac (http://localhost:11434). Open the Ollama app so it's running — and if you're on the deployed site, make sure OLLAMA_ORIGINS allows it.");
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    if (/not found/i.test(t)) throw new OllamaError(`Model ${OLLAMA_MODEL} isn't downloaded. In Terminal run:  ollama pull ${OLLAMA_MODEL}`);
    throw new OllamaError(`Ollama error ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data?.message?.content ?? "").trim();
}

// Llama isn't always perfectly clean JSON — pull the object out defensively.
export function extractJSON<T = unknown>(text: string): T | null {
  const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(clean) as T; } catch { /* fall through */ }
  const m = clean.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]) as T; } catch { /* fall through */ } }
  return null;
}
