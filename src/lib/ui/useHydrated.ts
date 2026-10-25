import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** False during SSR and until React has hydrated, so submit buttons can't do a native form GET early. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
