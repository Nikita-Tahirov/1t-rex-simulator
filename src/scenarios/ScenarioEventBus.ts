export class ScenarioEventBus {
  private events = new Map<string, number>();

  emit(name: string, delta = 1): void {
    this.events.set(name, (this.events.get(name) ?? 0) + delta);
  }

  set(name: string, value: number): void {
    this.events.set(name, value);
  }

  count(name: string): number {
    return this.events.get(name) ?? 0;
  }

  get(name: string, fallback = 0): number {
    return this.events.get(name) ?? fallback;
  }

  keys(): string[] {
    return Array.from(this.events.keys());
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.events);
  }

  reset(): void {
    this.events.clear();
  }
}
