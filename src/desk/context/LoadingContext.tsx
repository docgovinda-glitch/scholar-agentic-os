import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type LoadingListener = (isLoading: boolean) => void;

class GlobalLoadingState {
  private activeOperations = new Set<string>();
  private counter = 0;
  private listeners = new Set<LoadingListener>();
  private autoIdCounter = 0;

  public get isLoading(): boolean {
    return this.activeOperations.size > 0 || this.counter > 0;
  }

  public subscribe(listener: LoadingListener): () => void {
    this.listeners.add(listener);
    listener(this.isLoading);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const state = this.isLoading;
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  public startLoading(id?: string): string {
    const opId = id || `op_${++this.autoIdCounter}`;
    this.activeOperations.add(opId);
    this.notify();
    return opId;
  }

  public stopLoading(id?: string): void {
    if (id) {
      this.activeOperations.delete(id);
    } else if (this.activeOperations.size > 0) {
      // Clear the most recent if no id specified
      const last = Array.from(this.activeOperations).pop();
      if (last) this.activeOperations.delete(last);
    } else if (this.counter > 0) {
      this.counter--;
    }
    this.notify();
  }

  public setLoading(loading: boolean): void {
    if (loading) {
      this.counter++;
    } else {
      this.counter = 0;
      this.activeOperations.clear();
    }
    this.notify();
  }

  public async withLoading<T>(
    operation: Promise<T> | (() => Promise<T>),
    id?: string
  ): Promise<T> {
    const opId = this.startLoading(id);
    try {
      const promise = typeof operation === "function" ? operation() : operation;
      return await promise;
    } finally {
      this.stopLoading(opId);
    }
  }
}

export const globalLoading = new GlobalLoadingState();

if (typeof window !== "undefined") {
  (window as any).__globalLoading = globalLoading;
}

export interface LoadingContextValue {
  isLoading: boolean;
  startLoading: (id?: string) => string;
  stopLoading: (id?: string) => void;
  setLoading: (loading: boolean) => void;
  withLoading: <T>(
    operation: Promise<T> | (() => Promise<T>),
    id?: string
  ) => Promise<T>;
}

const LoadingContext = createContext<LoadingContextValue | null>(null);

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState<boolean>(() => globalLoading.isLoading);

  useEffect(() => {
    return globalLoading.subscribe((active) => {
      setIsLoading(active);
    });
  }, []);

  const startLoading = useCallback((id?: string) => globalLoading.startLoading(id), []);
  const stopLoading = useCallback((id?: string) => globalLoading.stopLoading(id), []);
  const setLoading = useCallback((loading: boolean) => globalLoading.setLoading(loading), []);
  const withLoading = useCallback(
    <T,>(operation: Promise<T> | (() => Promise<T>), id?: string) =>
      globalLoading.withLoading(operation, id),
    []
  );

  return (
    <LoadingContext.Provider
      value={{
        isLoading,
        startLoading,
        stopLoading,
        setLoading,
        withLoading,
      }}
    >
      {children}
    </LoadingContext.Provider>
  );
}

export function useLoading(): LoadingContextValue {
  const context = useContext(LoadingContext);
  if (!context) {
    // Graceful fallback if invoked outside of LoadingProvider
    return {
      isLoading: globalLoading.isLoading,
      startLoading: (id?: string) => globalLoading.startLoading(id),
      stopLoading: (id?: string) => globalLoading.stopLoading(id),
      setLoading: (loading: boolean) => globalLoading.setLoading(loading),
      withLoading: <T,>(
        operation: Promise<T> | (() => Promise<T>),
        id?: string
      ) => globalLoading.withLoading(operation, id),
    };
  }
  return context;
}
