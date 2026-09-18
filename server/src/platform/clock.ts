export interface Clock {
  now(): Date;
  nowIso(): string;
  timestampMs(): number;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  nowIso(): string {
    return new Date().toISOString();
  }

  timestampMs(): number {
    return Date.now();
  }
}
