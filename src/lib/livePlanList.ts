export interface PlanListState<T> {
  items: T[];
  loading: boolean;
  hasMore: boolean;
  error: boolean;
}

// Keep requested plans live, expanding only after an explicit user action.
export function createLivePlanList<T>(
  subscribe: (count: number, next: (items: T[]) => void, error: () => void) => () => void,
  publish: (state: PlanListState<T>) => void,
) {
  let count = 20;
  let generation = 0;
  let disposed = false;
  let stop: (() => void) | undefined;
  let state: PlanListState<T> = { items: [], loading: false, hasMore: false, error: false };
  function connect() {
    if (disposed) return;
    const request = ++generation;
    stop?.();
    state = { ...state, loading: true, error: false };
    publish(state);
    stop = subscribe(count + 1, items => {
      if (disposed || request !== generation) return;
      state = { items: items.slice(0, count), hasMore: items.length > count, loading: false, error: false };
      publish(state);
    }, () => {
      if (disposed || request !== generation) return;
      state = { ...state, loading: false, error: true };
      publish(state);
    });
  }
  return {
    start: connect,
    retry: connect,
    more() {
      if (disposed || state.loading || state.error || !state.hasMore) return;
      count += 20;
      connect();
    },
    dispose() { disposed = true; generation++; stop?.(); },
  };
}
