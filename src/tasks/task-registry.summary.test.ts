import { describe, expect, it } from "vitest";
import { countTaskIssueRecords, summarizeTaskRecords } from "./task-registry.summary.js";
import type { TaskRecord } from "./task-registry.types.js";

function createTask(overrides: Partial<TaskRecord>): TaskRecord {
  return {
    taskId: "task-1",
    runtime: "cli",
    requesterSessionKey: "agent:main:main",
    ownerKey: "agent:main:main",
    scopeKind: "session",
    task: "Test task",
    status: "succeeded",
    deliveryStatus: "not_applicable",
    notifyPolicy: "silent",
    createdAt: 1_000,
    cleanupAfter: 10_000,
    ...overrides,
  };
}

describe("task-registry.summary", () => {
  it("preserves historical failures in registry summaries", () => {
    const summary = summarizeTaskRecords([
      createTask({ taskId: "failed-1", status: "failed", endedAt: 2_000 }),
    ]);

    expect(summary.failures).toBe(1);
  });

  it("counts only audit-backed operational issues", () => {
    const records = [
      createTask({
        taskId: "failed-history",
        status: "failed",
        endedAt: 2_000,
      }),
      createTask({
        taskId: "lost-runtime",
        status: "lost",
        endedAt: 2_500,
        lastEventAt: 2_500,
        error: "lost backing session",
      }),
    ];

    expect(countTaskIssueRecords(records, 5_000)).toBe(1);
  });
});
