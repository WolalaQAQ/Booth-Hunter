import test from "node:test";
import assert from "node:assert/strict";

import { filterPrimaryImageEntries } from "./select";

test("filterPrimaryImageEntries keeps all entries by default", () => {
  const result = filterPrimaryImageEntries(
    [
      { imageIndex: 0, id: "a" },
      { imageIndex: 1, id: "b" },
      { imageIndex: 2, id: "c" },
    ],
    false
  );

  assert.deepEqual(
    result.map((entry) => entry.id),
    ["a", "b", "c"]
  );
});

test("filterPrimaryImageEntries keeps only imageIndex 0 when primary-only is enabled", () => {
  const result = filterPrimaryImageEntries(
    [
      { imageIndex: 2, id: "c" },
      { imageIndex: 0, id: "a" },
      { imageIndex: 1, id: "b" },
    ],
    true
  );

  assert.deepEqual(
    result.map((entry) => entry.id),
    ["a"]
  );
});
