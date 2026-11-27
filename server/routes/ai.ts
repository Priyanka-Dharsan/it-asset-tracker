// AI feature: summarise the inventory with a Foundation Model endpoint.

type ChatMessage = { role: "system" | "user"; content: string };
type AppKitWithServing = {
  server: { extend: (fn: (app: any) => void) => void };
  serving: (alias?: string) => {
    invoke: (body: {
      messages: ChatMessage[];
      max_tokens?: number;
    }) => Promise<unknown>;
  };
};

const TIMEOUT_MS = 30_000;

type ChatReply = { choices?: { message?: { content?: unknown } }[] };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// Get the text out of the AI reply. Returns '' if there is none.
// The plugin wraps the reply as { ok, data: { choices: [...] } }.
function extractText(result: unknown): string {
  if (!isObject(result)) return "";
  const body = (isObject(result.data) ? result.data : result) as ChatReply;
  const content = body.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((p: unknown) =>
        isObject(p) && typeof p.text === "string" ? p.text : "",
      )
      .join("")
      .trim();
  }
  return "";
}

export function setupAiRoutes(appkit: unknown): void {
  const ak = appkit as AppKitWithServing;

  ak.server.extend((app) => {
    app.post("/api/ai/summary", async (req: any, res: any) => {
      // 1. Check the input
      const rows = req.body?.rows;
      if (!Array.isArray(rows) || rows.length === 0 || rows.length > 50) {
        return res
          .status(400)
          .json({ error: "Send between 1 and 50 rows of data." });
      }

      // 2. Build the question
      const messages: ChatMessage[] = [
        {
          role: "system",
          content:
            "You are an IT asset analyst. Using ONLY the data given, write a summary of at most 3 short sentences in plain English. Do not invent numbers.",
        },
        {
          role: "user",
          content: `IT asset data (JSON):\n${JSON.stringify(rows)}`,
        },
      ];

      try {
        // 3. Ask the AI, with a 30 second stopwatch
        let timer: NodeJS.Timeout | undefined;
        const stopwatch = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("AI_TIMEOUT")), TIMEOUT_MS);
        });
        const result = await Promise.race([
          ak.serving().invoke({ messages, max_tokens: 300 }),
          stopwatch,
        ]).finally(() => clearTimeout(timer));

        if (isObject(result) && result.ok === false) {
          console.error(
            "[ai] endpoint returned an error:",
            JSON.stringify(result)?.slice(0, 500),
          );
          return res
            .status(502)
            .json({ error: "The AI is unavailable right now." });
        }

        // 4. Empty answer?
        const summary = extractText(result);
        if (!summary) {
          return res.json({
            summary: null,
            message: "The AI returned no answer. Try again.",
          });
        }
        return res.json({ summary });
      } catch (err) {
        // 5. Timeout or other failure
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[ai] request failed:", msg);
        if (/AI_TIMEOUT|timed? ?out|abort/i.test(msg)) {
          return res
            .status(504)
            .json({ error: "The AI took too long. Please try again." });
        }
        return res
          .status(502)
          .json({ error: "The AI is unavailable right now." });
      }
    });
  });
}
