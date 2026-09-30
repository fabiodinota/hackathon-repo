export type PipelineErrorCode =
  | "INVALID_INPUT"
  | "EXPIRED_SESSION"
  | "EMPTY_CONTEXT"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_INTENT";
export class PipelineError extends Error {
  constructor(
    readonly code: PipelineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PipelineError";
  }
}
