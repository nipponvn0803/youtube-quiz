export type QuizOption = {
  text: string;
};

export type QuizQuestion = {
  id: string;
  text: string;
  options: QuizOption[];
  correctIndex: number;
  explanation?: string;
};

export type QuizRequestMessage = {
  type: "REQUEST_QUIZ";
  videoId: string;
  videoUrl: string;
  currentTimeSeconds: number;
  numQuestions: number;
  tabId?: number;
};

export type QuizResponseMessage =
  | {
      type: "QUIZ_SUCCESS";
      questions: QuizQuestion[];
    }
  | {
      type: "QUIZ_ERROR";
      error: string;
    };

export type ExtensionSettings = {
  openaiApiKey: string;
  openaiModel: string;
  quizIntervalMinutes: number;
  quizNumQuestions: number;
  quizAutoEnabled: boolean;
};

