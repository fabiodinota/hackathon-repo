export type SanitizedFrame = {
  id: string;
  imageBase64?: string;
  safeText: string[];
  timestamp: string;
  source: "allowlisted_tab";
  ocrConfidence?: number;
};
export type SanitizedInput = {
  frames: SanitizedFrame[];
  timeWindowSeconds: number;
  sessionId: string;
};
export type ModelFrame = {
  imageBase64?: string;
  safeText: string[];
  timestamp: string;
};
export type ModelContext = {
  sessionId: string;
  frames: ModelFrame[];
  timeWindowSeconds: number;
};
