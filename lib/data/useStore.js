"use client";
// Re-render a component whenever the store is hydrated / mutated.
import { useSyncExternalStore } from "react";
import D from "./store";

export function useStoreVersion() {
  return useSyncExternalStore(D.subscribe, D.getVersion, D.getVersion);
}
