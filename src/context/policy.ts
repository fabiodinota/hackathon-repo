export type ContextPolicy = { maxFrames: number; maxSeconds: number; maxImageBytes: number; maxPayloadBytes: number; maxTextItemsPerFrame: number; maxTextItemLength: number };
export const defaultContextPolicy: ContextPolicy = { maxFrames: 3, maxSeconds: 60, maxImageBytes: 1200000, maxPayloadBytes: 4000000, maxTextItemsPerFrame: 20, maxTextItemLength: 240 };
