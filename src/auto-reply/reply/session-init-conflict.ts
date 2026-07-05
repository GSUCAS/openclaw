export const REPLY_SESSION_INITIALIZATION_CONFLICT_CODE = "REPLY_SESSION_INITIALIZATION_CONFLICT";

export class ReplySessionInitializationConflictError extends Error {
  readonly code = REPLY_SESSION_INITIALIZATION_CONFLICT_CODE;
  readonly retryable = true;
  readonly sessionKey: string;
  readonly changedFields: string[];

  constructor(params: { sessionKey: string; changedFields?: string[] }) {
    super(`reply session initialization conflicted for ${params.sessionKey}`);
    this.name = "ReplySessionInitializationConflictError";
    this.sessionKey = params.sessionKey;
    this.changedFields = params.changedFields ?? [];
  }
}

export function isReplySessionInitializationConflictError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const maybeError = error as { code?: unknown; message?: unknown; retryable?: unknown };
  if (maybeError.code === REPLY_SESSION_INITIALIZATION_CONFLICT_CODE) {
    return true;
  }
  return (
    maybeError.retryable === true &&
    typeof maybeError.message === "string" &&
    maybeError.message.includes("reply session initialization conflicted")
  );
}
