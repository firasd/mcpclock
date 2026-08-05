# MCP Clock

**Live MCP endpoint:** `https://mcpclock.firasd.workers.dev/mcp`

Works in Claude.ai, Claude iOS, Claude Code, OpenAI Codex, and any MCP-compatible client.

---

## Tools

### `clock_get`
Returns current time in one or more time zones.

- **`timezones`** *(optional)* — Array of IANA zone names (e.g. `"America/New_York"`) plus the special literals `"UTC"` and `"Alphadec"`. Defaults to `["UTC"]`. Max 15 zones.
- **`offsetSeconds`** *(optional)* — Signed offset in seconds applied before formatting. E.g. `-86400` for 24 h ago, `+60` for one minute ahead.
- **`adec_canonical_only`** *(optional)* — Pass `"true"` to suppress the Alphadec unit explanation and return only the canonical string.

```json
clock_get{}
clock_get{"timezones": ["Asia/Tokyo", "America/New_York"]}
clock_get{"timezones": ["Alphadec"], "adec_canonical_only": "true"}
```

---

### `clock_day_info`
Returns calendar information for a UTC date — weekday, days in month, day of year, days in year, year progress %, ISO week number, and the corresponding Hijri (Islamic) date.

- **`date`** *(optional)* — Date in `YYYY-MM-DD` format. Defaults to today (UTC).

The `hijri_calendar` field returns two variants: `tabular` (`islamic-tbla`, the arithmetic/tabular calendar) and `umm_al_qura` (`islamic-umalqura`, the Saudi civil calendar).

```json
clock_day_info{}
clock_day_info{"date": "2025-09-09"}
```

---

### `clock_convert`
Converts a timestamp from one time zone to one or more target zones.

- **`source_zone`** — IANA zone name or `"UTC"`.
- **`iso`** — ISO-8601 string. If source is `"UTC"`, include the `Z` suffix. If source is an IANA zone, omit the offset (wall-clock time).
- **`target_zones`** — Array of IANA zone names or `"UTC"`. Min 1, max 15.

```json
clock_convert{
  "source_zone": "America/Mexico_City",
  "iso": "2025-10-28T07:30:00",
  "target_zones": ["UTC", "Asia/Dubai"]
}
```

---

### `clock_convert_alphadec`
Converts between a UTC ISO timestamp and an Alphadec string.

- **`direction`** — `"utc_to_alphadec"` (default) or `"alphadec_to_utc"`.
- **`value`** — UTC ISO string (e.g. `"2025-06-09T16:30:00.000Z"`) or Alphadec string (e.g. `"2025_L3T5_000000"`).

```json
clock_convert_alphadec{"direction": "utc_to_alphadec", "value": "2025-06-09T16:30:00.000Z"}
clock_convert_alphadec{"direction": "alphadec_to_utc", "value": "2025_L3T5_000000"}
```

---

### `clock_convert_unixtime`
Converts between a UTC ISO timestamp and a Unix timestamp (seconds since epoch).

- **`direction`** — `"utc_to_unixtime"` (default) or `"unixtime_to_utc"`.
- **`value`** — UTC ISO string (e.g. `"2025-06-15T12:00:00Z"`) or Unix timestamp string (e.g. `"1749988800"`).

```json
clock_convert_unixtime{"direction": "utc_to_unixtime", "value": "2025-06-15T12:00:00Z"}
clock_convert_unixtime{"direction": "unixtime_to_utc", "value": "1749988800"}
```

---

### `clock_shift_utc`
Shifts a UTC ISO timestamp forward or backward by a structured time delta ("what date is 35 days from now?").

- **`date_from`** — Required. Either the literal string `"NOW"` (current UTC instant) or a UTC ISO timestamp like `"2026-05-28T10:00:00Z"`.
- **`direction`** *(optional)* — `"after"` (default) or `"before"`.
- **`delta`** *(optional)* — Object with non-negative integer fields: `years`, `days`, `hours`, `minutes`, `seconds`. Missing fields default to zero.

Years move on the UTC calendar (so Feb 29 → Feb 28/Mar 1 behaviour follows the calendar), then days/hours/minutes/seconds are applied on the UTC timeline. Returns `source_utc_iso`, `shifted_utc_iso`, the `input_delta`, a `normalized_delta`, and `total_seconds_excluding_calendar_years`.

```json
clock_shift_utc{"date_from": "NOW", "delta": {"days": 35}}
clock_shift_utc{"date_from": "2026-02-28T12:00:00Z", "direction": "after", "delta": {"years": 1}}
clock_shift_utc{"date_from": "2026-05-28T10:00:00Z", "direction": "before", "delta": {"seconds": 3600}}
```

---

### `clock_delta_utc`
Calculates the time difference between two UTC ISO timestamps. Omit either end to use the current time (i.e. "time since" or "time until").

- **`start`** *(optional)* — UTC ISO timestamp (e.g. `"2022-01-15T10:30:00Z"`). Defaults to now.
- **`end`** *(optional)* — UTC ISO timestamp. Defaults to now. At least one of `start` or `end` is required.

Returns `total_seconds`, a `breakdown` (years/days/hours/minutes/seconds), and a `readable` string. Negative if start is after end.

```json
clock_delta_utc{"start": "2022-01-15T10:30:00Z"}
clock_delta_utc{"end": "2025-12-31T23:59:59Z"}
clock_delta_utc{"start": "2022-01-15T10:30:00Z", "end": "2025-08-31T14:45:30Z"}
```

---

### `clock_delta_alphadec`
Calculates the time difference between two 4-character Alphadec codes within the current year. Omit either end to use the current time.

- **`alphadec_start`** *(optional)* — 4-character Alphadec code (e.g. `"A2B3"`). Defaults to now.
- **`alphadec_end`** *(optional)* — 4-character Alphadec code (e.g. `"Z8Y9"`). Defaults to now. At least one is required.

Returns both ISO time difference and Alphadec unit delta (periods/arcs/bars/beats).

```json
clock_delta_alphadec{"alphadec_start": "A2B3"}
clock_delta_alphadec{"alphadec_end": "Z8Y9"}
clock_delta_alphadec{"alphadec_start": "A2B3", "alphadec_end": "C1Y9"}
```

---

## CLI usage

The endpoint is plain streamable-HTTP JSON-RPC, so `curl` works fine. Send `Accept: application/json, text/event-stream` — responses come back as SSE frames.

**List the available tools:**

```bash
curl -s -X POST "https://mcpclock.firasd.workers.dev/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | grep '^data:' | sed 's/^data: //' | jq -r '.result.tools[].name'
```

```
clock_get
clock_day_info
clock_convert
clock_convert_alphadec
clock_convert_unixtime
clock_shift_utc
clock_delta_utc
clock_delta_alphadec
```

**Call a tool:**

```bash
curl -s -X POST "https://mcpclock.firasd.workers.dev/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"clock_get","arguments":{}}}'
```

```
event: message
data: {"result":{"content":[{"type":"text","text":"[\n  {\n    \"timezone\": \"UTC\",\n    \"iso\": \"2026-08-05T08:31:36.657Z\",\n    \"unixtime\": 1785918696\n  },\n  {\n    \"timezone\": \"Alphadec\",\n    \"alphadec\": \"2026_P4D0_086006\"\n  }\n]"}]},"jsonrpc":"2.0","id":1}
```

**Pretty-print just the tool's text payload:**

```bash
curl -s -X POST "https://mcpclock.firasd.workers.dev/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"clock_shift_utc","arguments":{"date_from":"NOW","delta":{"days":35}}}}' \
  | grep '^data:' | sed 's/^data: //' | jq -r '.result.content[0].text'
```

---

## Alphadec

Alphadec is a compact, human-readable timestamp format. A full canonical string looks like `2026_I2J9_382995`.

| Unit | Characters | Approx. Duration |
|------|-----------|-----------------|
| Period | A–Z (1st char) | ~14.04 days (year ÷ 26) |
| Arc | 0–9 (2nd char) | ~33.7 hours (period ÷ 10) |
| Bar | A–Z (3rd char) | ~77.75 minutes (arc ÷ 26) |
| Beat | 0–9 (4th char) | ~7.78 minutes (bar ÷ 10) |
| Offset | 6-digit suffix | milliseconds within beat |

Alphadec strings are K-sortable — lexicographic order matches chronological order. Truncating to fewer characters creates natural time groupings (e.g. `2026_I2` covers the entire I2 arc).

Seasonal anchors (approximate): Period F = March equinox · Period M = June solstice · Period S = September equinox · Period Z = December solstice.

---

## License

[The Unlicense](https://unlicense.org/) — this is free and unencumbered software released into the public domain. Do whatever you want with it.
