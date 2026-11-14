import assert from "node:assert/strict";
import test from "node:test";
import {
  clockGet,
  clockDayInfo,
  clockConvert,
  clockConvertAlphadec,
  clockConvertUnixtime,
  clockShiftUtc,
  clockDeltaUtc,
  clockDeltaAlphadec,
} from "../src/mcpclock.ts";

test("Alphadec explanation appears only when explicitly requested", () => {
  for (const options of [{}, { timezones: [] }, { timezones: ["UTC", "Asia/Kolkata"] }]) {
    const entry = clockGet(options).find(item => item.timezone === "Alphadec");
    assert.equal(Object.hasOwn(entry, "alphadec_info"), false);
  }
  const result = clockGet({ timezones: ["Alphadec"] });
  assert.match(result.find(item => item.timezone === "Alphadec").alphadec_info, /Alphadec units/);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test("clockGet returns plain data with UTC, requested zones, and Alphadec", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-05-28T10:40:40.025Z") });
  const result = clockGet({ timezones: ["Asia/Kolkata", "UTC", "UTC"], offsetSeconds: -3600 });
  assert.equal(result.length, 3);
  assert.equal(result[0].timezone, "Asia/Kolkata");
  assert.equal(result[0].utc_offset, "GMT+5:30");
  assert.deepEqual(result[1], {
    timezone: "UTC",
    iso: "2026-05-28T09:40:40.025Z",
    unixtime: 1779961240,
  });
  assert.equal(result[2].timezone, "Alphadec");
  assert.equal(typeof result[2].alphadec, "string");
  assert.deepEqual(clockGet(), clockGet({ timezones: [] }));
});

test("day info handles leap years, ISO week boundaries, and Hijri calendars", () => {
  const leap = clockDayInfo({ date: "2024-02-29" });
  assert.equal(leap.weekday, "Thursday");
  assert.equal(leap.days_in_month, 29);
  assert.equal(leap.days_in_year, 366);
  assert.equal(leap.day_of_year, 60);
  assert.equal(clockDayInfo({ date: "2021-01-01" }).iso_week, 53);
  assert.deepEqual(Object.keys(leap.hijri_calendar), ["tabular", "umm_al_qura"]);
  for (const date of Object.values(leap.hijri_calendar)) assert.match(date, /1445 AH$/);
});

test("time zone conversion works without an MCP runtime", () => {
  assert.deepEqual(clockConvert({
    source_zone: "Asia/Kolkata",
    iso: "2026-05-28T12:30:00",
    target_zones: ["UTC"],
  }), [{ timezone: "UTC", iso: "2026-05-28T07:00:00.000Z" }]);
});

test("conversion defaults are applied by the library", () => {
  const encoded = clockConvertAlphadec({ value: "2026-01-01T00:00:00Z" });
  assert.equal(encoded.alphadec, "2026_A0A0_000000");
  assert.equal(clockConvertAlphadec({
    direction: "alphadec_to_utc", value: encoded.alphadec,
  }).utc_iso, "2026-01-01T00:00:00.000Z");
  assert.equal(clockConvertUnixtime({ value: "1970-01-01T00:00:00Z" }).unix_timestamp, 0);
  assert.equal(clockConvertUnixtime({ direction: "unixtime_to_utc", value: "0" }).utc_iso,
    "1970-01-01T00:00:00.000Z");
});

test("UTC shifts retain sequential calendar-year rollover and milliseconds", () => {
  const result = clockShiftUtc({
    date_from: "2024-02-29T12:00:00.123Z", delta: { years: 4, seconds: 3600 },
  });
  assert.equal(result.shifted_utc_iso, "2028-03-01T13:00:00.123Z");
  assert.deepEqual(result.normalized_delta, { years: 4, days: 0, hours: 1, minutes: 0, seconds: 0 });
  assert.equal(clockShiftUtc({
    date_from: "2026-05-28T10:00:00Z", direction: "before", delta: { days: 35 },
  }).shifted_utc_iso, "2026-04-23T10:00:00.000Z");
});

test("NOW and omitted endpoints use the current UTC clock", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-05-28T10:40:40.025Z") });
  assert.equal(clockDayInfo().date, "2026-05-28");
  const shift = clockShiftUtc({ date_from: "NOW", delta: { days: 35 } });
  assert.equal(shift.date_from_was_now, true);
  assert.equal(shift.shifted_utc_iso, "2026-07-02T10:40:40.000Z");
  assert.equal(clockDeltaUtc({ end: "2026-05-28T10:41:40Z" }).total_seconds, 60);
  assert.equal(clockDeltaUtc({ start: "2026-05-28T10:39:40Z" }).total_seconds, 60);
});

test("UTC differences retain year breakdowns and signed subsecond rounding", () => {
  const result = clockDeltaUtc({ start: "2024-02-29T12:00:00Z", end: "2028-03-01T12:00:00Z" });
  assert.deepEqual(result.breakdown, { years: 4, days: 0, hours: 0, minutes: 0, seconds: 0 });
  assert.equal(result.readable, "4 years");
  assert.equal(clockDeltaUtc({
    start: "2026-05-28T10:00:00.500Z", end: "2026-05-28T10:00:00Z",
  }).total_seconds, -1);
});

test("Alphadec differences support both directions", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-05-28T10:40:40Z") });
  const forward = clockDeltaAlphadec({ alphadec_start: "A0A0", alphadec_end: "A0A1" });
  assert.equal(forward.alphadec_unit_delta, "00:00:00:01");
  assert.equal(forward.iso_utc_start, "2026-01-01T00:00:00.000Z");
  const backward = clockDeltaAlphadec({ alphadec_start: "A0A1", alphadec_end: "A0A0" });
  assert.equal(backward.alphadec_unit_delta, "-00:00:00:01");
});

test("direct callers receive exceptions for invalid inputs", () => {
  assert.throws(() => clockGet({ timezones: ["Bogus/Zone"] }), /Invalid timezone/);
  assert.throws(() => clockGet({ offsetSeconds: 0.5 }), /integer/);
  assert.throws(() => clockDayInfo({ date: "not-a-date" }), /YYYY-MM-DD/);
  assert.throws(() => clockConvert({ source_zone: "UTC", iso: "bad", target_zones: [] }), /target_zones/);
  assert.throws(() => clockConvertAlphadec({ value: "bad" }), /Invalid UTC ISO/);
  assert.throws(() => clockConvertUnixtime({ direction: "invalid", value: "0" }), /direction/);
  assert.throws(() => clockShiftUtc({ date_from: "NOW", delta: { days: -1 } }), /non-negative/);
  assert.throws(() => clockShiftUtc({ date_from: "NOW", delta: { years: 0.5 } }), /integer/);
  assert.throws(() => clockShiftUtc({ date_from: "NOW", direction: "invalid" }), /direction/);
  assert.throws(() => clockDeltaUtc({}), /At least one/);
  assert.throws(() => clockDeltaAlphadec({}), /At least one/);
  assert.throws(() => clockDeltaAlphadec({ alphadec_start: "bad" }), /4-character/);
});
