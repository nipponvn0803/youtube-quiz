import type { ExtensionSettings, QuizQuestion } from "./shared/types";

export async function callOpenAIForQuestions(params: {
  settings: ExtensionSettings;
  transcriptSnippet: string;
  title: string;
  currentTimeSeconds: number;
  numQuestions: number;
}): Promise<QuizQuestion[]> {
  const { settings, transcriptSnippet, title, currentTimeSeconds, numQuestions } = params;

  if (!settings.openaiApiKey) {
    throw new Error("OpenAI API key is not configured in the extension options.");
  }

  const systemPrompt =
    "You are a helpful tutor that writes concise multiple-choice questions about a YouTube video segment. " +
    "Focus strictly on information present in the transcript and avoid guessing.";

  const userPrompt = [
    `Video title: ${title || "(unknown)"}`,
    `Approximate timestamp (seconds): ${Math.round(currentTimeSeconds)}`,
    "",
    "Transcript excerpt for the watched portion:",
    transcriptSnippet || "(no transcript available; infer only from the title and timestamp as safely as possible).",
    "",
    `Write ${numQuestions} multiple-choice questions about this content.`,
    "Return a JSON object with this exact shape:",
    '{ "questions": [ { "id": "q1", "text": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "..." } ] }',
    "Do not include any text before or after the JSON.",
  ].join("\n");

  const body = {
    model: settings.openaiModel || "gpt-4.1-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.openaiApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${text}`);
  }

  const json = (await response.json()) as any;
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Unexpected OpenAI response format (missing content).");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error("Failed to parse OpenAI JSON response.");
  }

  if (!parsed || !Array.isArray(parsed.questions)) {
    throw new Error("OpenAI response does not contain a questions array.");
  }

  const questions: QuizQuestion[] = parsed.questions.map((q: any, idx: number) => {
    const optionsArray: string[] = Array.isArray(q.options) ? q.options : [];
    const safeOptions = optionsArray
      .filter((opt) => typeof opt === "string")
      .map((text) => ({ text }));

    const correctIndex =
      typeof q.correctIndex === "number" && q.correctIndex >= 0 && q.correctIndex < safeOptions.length
        ? q.correctIndex
        : 0;

    return {
      id: typeof q.id === "string" && q.id.length > 0 ? q.id : `q${idx + 1}`,
      text: String(q.text ?? ""),
      options: safeOptions,
      correctIndex,
      explanation: typeof q.explanation === "string" ? q.explanation : undefined,
    };
  });

  return questions;
}

