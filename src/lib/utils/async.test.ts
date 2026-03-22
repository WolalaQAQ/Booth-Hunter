import test from "node:test";
import assert from "node:assert/strict";

import { mapWithConcurrency } from "./async";

test("mapWithConcurrency preserves input order while limiting in-flight work", async () => {
  let inFlight = 0;
  let maxInFlight = 0;

  const result = await mapWithConcurrency([40, 5, 25, 10], 2, async (delay, index) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, delay));
    inFlight -= 1;
    return `task-${index}`;
  });

  assert.deepEqual(result, ["task-0", "task-1", "task-2", "task-3"]);
  assert.equal(maxInFlight, 2);
});

test("mapWithConcurrency runs serially when concurrency is 1", async () => {
  const seen: number[] = [];

  await mapWithConcurrency([1, 2, 3], 1, async (value) => {
    seen.push(value);
    await new Promise((resolve) => setTimeout(resolve, 1));
    return value * 2;
  });

  assert.deepEqual(seen, [1, 2, 3]);
});
