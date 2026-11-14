import assert from "node:assert/strict";
import test from "node:test";
import { clockOffsetUtc } from "../src/mcpclock.ts";
import { toolDefinitions } from "../src/tool-definitions.ts";

test("duration and moment modes return identical results", () => {
  const shifted = clockOffsetUtc({ moment_a: "2026-05-28T12:00:00Z", target: { type: "duration", duration: { days: 35 } } });
  assert.equal(shifted.moment_b, "2026-07-02T12:00:00.000Z");
  assert.equal(shifted.total_seconds, 35 * 86400);
  assert.deepEqual(shifted, clockOffsetUtc({ moment_a: shifted.moment_a, target: { type: "moment", moment_b: shifted.moment_b } }));
});

test("before direction, rollover, zero, and reverse differences", () => {
  const anchor = "2026-05-28T12:00:00Z";
  const result = clockOffsetUtc({ moment_a: anchor, target: { type: "duration", direction: "before", duration: { seconds: 3600 } } });
  assert.equal(result.moment_b, "2026-05-28T11:00:00.000Z");
  assert.equal(result.total_seconds, -3600);
  assert.equal(result.breakdown.hours, 1);
  assert.equal(clockOffsetUtc({ moment_a: anchor, target: { type: "duration", duration: {} } }).total_seconds, 0);
});

test("calendar-year movement retains leap rollover and milliseconds", () => {
  const result = clockOffsetUtc({ moment_a: "2024-02-29T12:00:00.123Z", target: { type: "duration", duration: { years: 4 } } });
  assert.equal(result.moment_b, "2028-03-01T12:00:00.123Z");
  assert.equal(result.breakdown.years, 4);
});

test("default anchor and NOW resolve to one shared instant", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-05-28T12:00:00.123Z") });
  const result = clockOffsetUtc({ target: { type: "moment", moment_b: "NOW" } });
  assert.equal(result.moment_a, "2026-05-28T12:00:00.123Z");
  assert.equal(result.moment_a, result.moment_b);
  assert.equal(result.total_seconds, 0);
});

test("schema enforces the exclusive modes and defaults direction", () => {
  const schema = toolDefinitions.clock_offset_utc.inputSchema;
  assert.equal(schema.parse({ target: { type: "duration", duration: {} } }).target.direction, "after");
  for (const target of [{}, { type: "moment" }, { type: "duration" },
    { type: "moment", moment_b: "NOW", duration: {} },
    { type: "duration", duration: {}, moment_b: "NOW" },
    { type: "duration", duration: { days: -1 } },
    { type: "duration", duration: { hours: 0.5 } }]) {
    assert.equal(schema.safeParse({ target }).success, false);
  }
});

test("invalid timestamps and oversized shifts fail instead of rolling silently", () => {
  for (const moment_a of ["bad", "2026-02-30T00:00:00Z", "2026-05-28T12:00:00+00:00"]) {
    assert.throws(() => clockOffsetUtc({ moment_a, target: { type: "moment", moment_b: "NOW" } }));
  }
  assert.throws(() => clockOffsetUtc({ target: { type: "duration", duration: { years: Number.MAX_SAFE_INTEGER } } }), /year range/);
  assert.throws(() => clockOffsetUtc({ target: { type: "duration", duration: { days: -1 } } }), /non-negative/);
});
