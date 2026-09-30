export type IntentResult = {
  intent: string | null;
  confidence: number;
  signals: string[];
  uncertain: boolean;
  generatedAt: string;
};
