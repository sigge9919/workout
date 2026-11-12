/** Monoton klocka i ms. Injiceras så att motorn kan testas exakt. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = {
  now: () => performance.now(),
};

/** Manuell klocka för tester. */
export class FakeClock implements Clock {
  constructor(private t = 0) {}
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
  set(ms: number): void {
    this.t = ms;
  }
}
