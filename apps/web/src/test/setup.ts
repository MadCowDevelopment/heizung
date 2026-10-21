/**
 * Vitest-Setup (jsdom).
 *
 * Die Domänen-Tests laufen ohne DOM, die späteren UI-Tests brauchen aber
 * einige Browser-APIs, die jsdom nicht mitbringt.
 */

import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.clearAllMocks();
});
