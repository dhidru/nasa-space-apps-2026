import { useEffect, useState } from "react";

export type AsyncState<T> = { status: "loading" } | { status: "done"; value: T } | { status: "error"; error: Error };

/** Runs `run` whenever `deps` change and drops results from stale runs. */
export function useAsync<T>(run: () => Promise<T> | undefined, deps: unknown[]): AsyncState<T> | undefined {
  const [state, setState] = useState<AsyncState<T>>();
  useEffect(() => {
    const p = run();
    if (!p) {
      setState(undefined);
      return;
    }
    let live = true;
    setState({ status: "loading" });
    p.then(
      (value) => live && setState({ status: "done", value }),
      (error) => live && setState({ status: "error", error: error instanceof Error ? error : new Error(String(error)) }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
