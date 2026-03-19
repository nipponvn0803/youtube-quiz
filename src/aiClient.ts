import { QuizQuestion } from "./shared/types";

interface GeminiResponse {
  candidates: Array<{
    content: { parts: Array<{ text: string }> };
  }>;
}

export async function generateQuizQuestions(
  transcript: string,
  numQuestions: number,
  apiKey: string,
  model: string = "gemini-3-flash-preview",
): Promise<QuizQuestion[]> {
  console.log("youtube-quiz: generateQuizQuestions called, model =", model, "| numQuestions =", numQuestions);

  const prompt = `You are a quiz generator. Based on the following video transcript, generate ${numQuestions} multiple-choice questions to test comprehension of what was covered. Each question must have exactly 4 options with one correct answer.

Transcript:
${transcript}

Respond with a JSON object in this exact format:
{
  "questions": [
    {
      "text": "question text here",
      "options": ["option A", "option B", "option C", "option D"],
      "correctIndex": 0,
      "explanation": "brief explanation of why the answer is correct"
    }
  ]
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  console.log("youtube-quiz: calling Gemini API, model =", model);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as GeminiResponse;
  console.log("youtube-quiz: Gemini API response received");

  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("Empty response from Gemini");

  const parsed = JSON.parse(content) as {
    questions: Array<{
      text: string;
      options: string[];
      correctIndex: number;
      explanation?: string;
    }>;
  };

  console.log("youtube-quiz: parsed", parsed.questions.length, "question(s)");

  return parsed.questions.map((q, i) => ({
    id: `q-${i}`,
    text: q.text,
    options: q.options.map((text) => ({ text })),
    correctIndex: q.correctIndex,
    explanation: q.explanation,
  }));
}
