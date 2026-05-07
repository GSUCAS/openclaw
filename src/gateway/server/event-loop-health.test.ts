import { describe, expect, it } from "vitest";
import { classifyGatewayEventLoopHealthSample } from "./event-loop-health.js";

describe("event-loop-health", () => {
  it("does not degrade on cpu and utilization alone", () => {
    let pressureState = undefined;

    for (let sampleIndex = 0; sampleIndex < 4; sampleIndex += 1) {
      const classification = classifyGatewayEventLoopHealthSample({
        delayP99Ms: 0,
        delayMaxMs: 0,
        utilization: 0.97,
        cpuCoreRatio: 0.98,
        pressureState,
      });

      expect(classification.reasons).toEqual([]);
      pressureState = classification.pressureState;
    }
  });

  it("degrades on sustained pressure with delay evidence", () => {
    let pressureState = undefined;

    for (let sampleIndex = 0; sampleIndex < 2; sampleIndex += 1) {
      const classification = classifyGatewayEventLoopHealthSample({
        delayP99Ms: 60,
        delayMaxMs: 300,
        utilization: 0.97,
        cpuCoreRatio: 0.98,
        pressureState,
      });

      expect(classification.reasons).toEqual([]);
      pressureState = classification.pressureState;
    }

    const classification = classifyGatewayEventLoopHealthSample({
      delayP99Ms: 60,
      delayMaxMs: 300,
      utilization: 0.97,
      cpuCoreRatio: 0.98,
      pressureState,
    });

    expect(classification.reasons).toEqual(["event_loop_utilization", "cpu"]);
  });

  it("degrades immediately on severe event-loop delay", () => {
    const classification = classifyGatewayEventLoopHealthSample({
      delayP99Ms: 1_100,
      delayMaxMs: 1_200,
      utilization: 0.1,
      cpuCoreRatio: 0.1,
    });

    expect(classification.reasons).toEqual(["event_loop_delay"]);
  });
});
