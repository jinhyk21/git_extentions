import { EventEmitter } from "node:events";

export class EventBus<TEvents extends Record<string, unknown>> {
  private readonly emitter = new EventEmitter();

  public emit<TKey extends keyof TEvents>(eventName: TKey, payload: TEvents[TKey]): void {
    this.emitter.emit(String(eventName), payload);
  }

  public on<TKey extends keyof TEvents>(eventName: TKey, listener: (payload: TEvents[TKey]) => void): () => void {
    this.emitter.on(String(eventName), listener);
    return () => this.emitter.off(String(eventName), listener);
  }
}
