/**
 * Post-spawn guidance notes.
 *
 * Returns push-based completion guidance for run spawns and thread-binding guidance for session spawns.
 */
import { isCronSessionKey } from "../routing/session-key.js";

export const SUBAGENT_SPAWN_ACCEPTED_NOTE =
  "Auto-announce is push-based. After spawning children, do NOT call sessions_list, sessions_history, exec sleep, or any polling tool. Track expected child session keys. Continue any independent work. If your final answer depends on child output, call sessions_yield and wait for runtime completion events to arrive as user messages; only answer after completion events for ALL required children arrive. A yielded turn is not a final answer. Use NO_REPLY only when a runtime completion instruction explicitly marks an event as late or duplicate; never use it merely because you previously yielded.";
export const SUBAGENT_SPAWN_SESSION_ACCEPTED_NOTE =
  "thread-bound session stays active after this task; continue in-thread for follow-ups.";

/** Resolve the post-spawn note, suppressing polling guidance for cron sessions. */
export function resolveSubagentSpawnAcceptedNote(params: {
  spawnMode: "run" | "session";
  agentSessionKey?: string;
}): string | undefined {
  if (params.spawnMode === "session") {
    return SUBAGENT_SPAWN_SESSION_ACCEPTED_NOTE;
  }
  return isCronSessionKey(params.agentSessionKey) ? undefined : SUBAGENT_SPAWN_ACCEPTED_NOTE;
}
