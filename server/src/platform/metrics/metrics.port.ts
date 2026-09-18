export type MetricTags = Readonly<Record<string, string>>;

export interface Metrics {
  increment(name: string, tags?: MetricTags): void;
  timing(name: string, ms: number, tags?: MetricTags): void;
}
