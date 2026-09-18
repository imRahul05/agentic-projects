import { Metrics, MetricTags } from "./metrics.port.js";

export class NoopMetrics implements Metrics {
  increment(_name: string, _tags?: MetricTags): void {
    // no-op
  }

  timing(_name: string, _ms: number, _tags?: MetricTags): void {
    // no-op
  }
}
