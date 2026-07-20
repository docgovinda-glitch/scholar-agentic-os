export type EventHandler<T> = (payload: T) => void;

export interface EventBus<TEvents extends Record<string, unknown>> {
  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void;
  on<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): () => void;
}

export function createEventBus<TEvents extends Record<string, unknown>>(): EventBus<TEvents> {
  const listeners = new Map<keyof TEvents, Set<EventHandler<any>>>();

  return {
    emit(event, payload) {
      listeners.get(event)?.forEach((handler) => handler(payload));
    },
    on(event, handler) {
      const current = listeners.get(event) ?? new Set<EventHandler<any>>();
      current.add(handler);
      listeners.set(event, current);

      return () => {
        current.delete(handler);
        if (current.size === 0) {
          listeners.delete(event);
        }
      };
    },
  };
}

