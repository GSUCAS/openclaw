import { monitorEventLoopDelay, performance } from "node:perf_hooks";

const EVENT_LOOP_MONITOR_RESOLUTION_MS = 20;
const EVENT_LOOP_DELAY_WARN_MS = 1_000;
const EVENT_LOOP_UTILIZATION_WARN = 0.95;
const CPU_CORE_RATIO_WARN = 0.9;
const EVENT_LOOP_PRESSURE_DELAY_P99_WARN_MS = 50;
const EVENT_LOOP_PRESSURE_DELAY_MAX_WARN_MS = 250;
const EVENT_LOOP_PRESSURE_CONSECUTIVE_SAMPLES_WARN = 3;

type EventLoopDelayMonitor = ReturnType<typeof monitorEventLoopDelay>;
type EventLoopUtilization = ReturnType<typeof performance.eventLoopUtilization>;
type CpuUsage = ReturnType<typeof process.cpuUsage>;

export type GatewayEventLoopHealthReason = "event_loop_delay" | "event_loop_utilization" | "cpu";

export type GatewayEventLoopHealth = {
  degraded: boolean;
  reasons: GatewayEventLoopHealthReason[];
  intervalMs: number;
  delayP99Ms: number;
  delayMaxMs: number;
  utilization: number;
  cpuCoreRatio: number;
};

export type GatewayEventLoopPressureState = {
  utilizationConsecutiveSamples: number;
  cpuConsecutiveSamples: number;
};

export type GatewayEventLoopHealthMonitor = {
  snapshot: () => GatewayEventLoopHealth | undefined;
  stop: () => void;
};

function roundMetric(value: number, digits = 3): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function nanosecondsToMilliseconds(value: number): number {
  return roundMetric(value / 1_000_000, 1);
}

function createGatewayEventLoopPressureState(): GatewayEventLoopPressureState {
  return {
    utilizationConsecutiveSamples: 0,
    cpuConsecutiveSamples: 0,
  };
}

function hasEventLoopPressureDelayEvidence(delayP99Ms: number, delayMaxMs: number): boolean {
  return (
    delayP99Ms >= EVENT_LOOP_PRESSURE_DELAY_P99_WARN_MS ||
    delayMaxMs >= EVENT_LOOP_PRESSURE_DELAY_MAX_WARN_MS
  );
}

export function classifyGatewayEventLoopHealthSample(params: {
  delayP99Ms: number;
  delayMaxMs: number;
  utilization: number;
  cpuCoreRatio: number;
  pressureState?: GatewayEventLoopPressureState;
}): {
  reasons: GatewayEventLoopHealthReason[];
  pressureState: GatewayEventLoopPressureState;
} {
  const pressureState = params.pressureState ?? createGatewayEventLoopPressureState();
  const nextPressureState: GatewayEventLoopPressureState = {
    utilizationConsecutiveSamples:
      params.utilization >= EVENT_LOOP_UTILIZATION_WARN
        ? pressureState.utilizationConsecutiveSamples + 1
        : 0,
    cpuConsecutiveSamples:
      params.cpuCoreRatio >= CPU_CORE_RATIO_WARN ? pressureState.cpuConsecutiveSamples + 1 : 0,
  };
  const reasons: GatewayEventLoopHealthReason[] = [];
  const hasSevereDelay =
    params.delayP99Ms >= EVENT_LOOP_DELAY_WARN_MS || params.delayMaxMs >= EVENT_LOOP_DELAY_WARN_MS;

  if (hasSevereDelay) {
    reasons.push("event_loop_delay");
  }

  const hasSustainedPressure =
    hasEventLoopPressureDelayEvidence(params.delayP99Ms, params.delayMaxMs) &&
    (nextPressureState.utilizationConsecutiveSamples >=
      EVENT_LOOP_PRESSURE_CONSECUTIVE_SAMPLES_WARN ||
      nextPressureState.cpuConsecutiveSamples >= EVENT_LOOP_PRESSURE_CONSECUTIVE_SAMPLES_WARN);

  if (hasSustainedPressure) {
    if (params.utilization >= EVENT_LOOP_UTILIZATION_WARN) {
      reasons.push("event_loop_utilization");
    }
    if (params.cpuCoreRatio >= CPU_CORE_RATIO_WARN) {
      reasons.push("cpu");
    }
  }

  return {
    reasons,
    pressureState: nextPressureState,
  };
}

export function createGatewayEventLoopHealthMonitor(): GatewayEventLoopHealthMonitor {
  let monitor: EventLoopDelayMonitor | null = null;
  let lastWallAt = Date.now();
  let lastCpuUsage: CpuUsage | null = process.cpuUsage();
  let lastEventLoopUtilization: EventLoopUtilization | null = performance.eventLoopUtilization();
  let pressureState = createGatewayEventLoopPressureState();

  try {
    monitor = monitorEventLoopDelay({ resolution: EVENT_LOOP_MONITOR_RESOLUTION_MS });
    monitor.enable();
    monitor.reset();
  } catch {
    monitor = null;
  }

  return {
    snapshot: () => {
      if (!monitor || !lastCpuUsage || !lastEventLoopUtilization || lastWallAt <= 0) {
        return undefined;
      }

      const now = Date.now();
      const intervalMs = Math.max(1, now - lastWallAt);
      const cpuUsage = process.cpuUsage(lastCpuUsage);
      const currentEventLoopUtilization = performance.eventLoopUtilization();
      const utilization = roundMetric(
        performance.eventLoopUtilization(currentEventLoopUtilization, lastEventLoopUtilization)
          .utilization,
      );
      const delayP99Ms = nanosecondsToMilliseconds(monitor.percentile(99));
      const delayMaxMs = nanosecondsToMilliseconds(monitor.max);
      const cpuTotalMs = roundMetric((cpuUsage.user + cpuUsage.system) / 1_000, 1);
      const cpuCoreRatio = roundMetric(cpuTotalMs / intervalMs);
      const classification = classifyGatewayEventLoopHealthSample({
        delayP99Ms,
        delayMaxMs,
        utilization,
        cpuCoreRatio,
        pressureState,
      });
      const { reasons } = classification;
      pressureState = classification.pressureState;

      monitor.reset();
      lastWallAt = now;
      lastCpuUsage = process.cpuUsage();
      lastEventLoopUtilization = currentEventLoopUtilization;

      return {
        degraded: reasons.length > 0,
        reasons,
        intervalMs,
        delayP99Ms,
        delayMaxMs,
        utilization,
        cpuCoreRatio,
      };
    },
    stop: () => {
      monitor?.disable();
      monitor = null;
      lastWallAt = 0;
      lastCpuUsage = null;
      lastEventLoopUtilization = null;
      pressureState = createGatewayEventLoopPressureState();
    },
  };
}
