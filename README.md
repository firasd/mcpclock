# MCP Clock

**Live MCP endpoint:** `https://mcpclock.firasd.workers.dev/mcp`

Works in Claude.ai, Claude iOS, Claude Code, OpenAI Codex, and any MCP-compatible client.

## Use As a Library

`src/mcpclock.ts` contains the clock calculations as typed, synchronous functions.
It imports only the local `src/lib/alphadec.js` implementation and uses JavaScript
`Date` and `Intl`; it has no MCP, Zod, or Cloudflare dependencies. To vendor the
library, include both files and preserve their relative paths.

```ts
import { clockDayInfo, clockOffsetUtc } from "./src/mcpclock";

const calendar = clockDayInfo({ date: "2026-05-28" });
const expiry = clockOffsetUtc({ target: { type: "duration", duration: { days: 35 } } });
const distance = clockOffsetUtc({ target: { type: "moment", moment_b: expiry.moment_b } });
```

Each function takes an options object using the tool's argument names and returns
plain data, with no JSON serialization or MCP response envelope. Invalid inputs
throw exceptions. `clockGet()` and `clockDayInfo()` can be called without options.
Explicitly requesting `"Alphadec"` adds an `alphadec_info` explanation to its entry.
The default response includes the canonical Alphadec value without that explanation.

| MCP Tool | Library Export |
|----------|----------------|
| `clock_get` | `clockGet` |
| `clock_day_info` | `clockDayInfo` |
| `clock_convert` | `clockConvert` |
| `clock_convert_alphadec` | `clockConvertAlphadec` |
| `clock_convert_unixtime` | `clockConvertUnixtime` |
| `clock_offset_utc` | `clockOffsetUtc` |
| `clock_delta_alphadec` | `clockDeltaAlphadec` |

`src/tool-definitions.ts` supplies the MCP schemas, descriptions, and annotations;
`src/index.ts` handles registration, response formatting, and the Worker endpoint.
Calendar-year shifts use successive `setUTCFullYear` calls:
February 29 rolls forward to March 1 in a non-leap year, and subsequent year
steps retain March 1. Time-zone conversion retains the existing wall-clock
offset calculation; it does not expose DST gap/overlap disambiguation options.

Run the library and tool-definition tests with `npm test` on Node 22.6+ after
installing dependencies. The library itself remains dependency-free apart from
the local Alphadec implementation.

## MCP Runtime

Run `npm run version:bump` before committing a release. Like lclip, the version
uses the shared Alphadec encoder plus a UTC day/month suffix, for example
`2026_W6G6_447072_14Nov`. The script has no npm dependencies and updates
`src/version.js`, used by MCP server identity and the `clock_help` response.
It is not run automatically during deployment.

After deployment, `npm run version:check` compares the local version with
`/tools/clock_help` and exits nonzero on a mismatch. An optional base URL can be
passed with `npm run version:check -- http://127.0.0.1:8787`.

The Worker uses MCP SDK v2 (`@modelcontextprotocol/server`), Cloudflare Agents,
and Zod 4. `createMcpHandler` from `agents/mcp/server` receives the server factory
and serves modern MCP requests plus stateless requests from legacy clients.
Dependencies use caret ranges, with no active lockfile.

---

## Tools

## GET API

`/` returns a welcome message and the current clock output. `/tools/help` provides
curl examples and dynamically generated parameter help. `/tools/<tool_name>`
returns plain JSON through GET, with query parameters validated against the same
schemas as MCP. Arrays and objects are JSON-encoded; scalar strings stay strings.

```bash
curl 'https://mcpclock.firasd.workers.dev/tools/clock_get'
curl -G 'https://mcpclock.firasd.workers.dev/tools/clock_offset_utc' \
  --data-urlencode 'target={"type":"duration","duration":{"days":35}}'
curl 'https://mcpclock.firasd.workers.dev/tools/help?tool=clock_offset_utc'
```

All GET responses disable caching. Invalid inputs return 400, unknown paths 404,
and unsupported methods 405. `/mcp` continues to serve MCP requests.

### `clock_help`
Returns descriptions, parameter JSON Schemas, and annotations from the same
definitions used to register the MCP tools. Schemas include parameter descriptions,
required fields, defaults, enums, and numeric or array constraints.

- **`tool`** *(optional)* — Exact tool name. Omit to list every tool, including `clock_help`.

```json
clock_help{}
clock_help{"tool": "clock_offset_utc"}
```

Definitions live in `src/tool-definitions.ts`; the help response is generated
from those definitions on each call.

---

### `clock_get`
Returns current time in one or more time zones.

- **`timezones`** *(optional)* — Array of IANA zone names (e.g. `"America/New_York"`) plus the special literals `"UTC"` and `"Alphadec"`. Defaults to `["UTC"]`. Max 15 zones.
- **`offsetSeconds`** *(optional)* — Signed offset in seconds applied before formatting. E.g. `-86400` for 24 h ago, `+60` for one minute ahead.
Explicitly including `"Alphadec"` adds an `alphadec_info` field to the Alphadec entry.

```json
clock_get{}
clock_get{"timezones": ["Asia/Tokyo", "America/New_York"]}
clock_get{"timezones": ["Alphadec"]}
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

### `clock_offset_utc`
Measures a difference or shifts an instant, replacing `clock_shift_utc` and `clock_delta_utc`.

- `moment_a` (optional): UTC ISO timestamp or `NOW`; defaults to now.
- `target`: either `{type: "moment", moment_b: "...Z"}` or `{type: "duration", direction: "after", duration: {days: 35}}`. Direction defaults to `after`; `before` moves backward.
- Duration fields: non-negative integer years, days, hours, minutes, seconds. Missing units default to zero; smaller units roll over.

Both modes return `moment_a`, `moment_b`, signed `total_seconds` rounded down to whole seconds, calendar-year-aware `breakdown`, and `readable`. Milliseconds are retained in the instants. Years move sequentially before smaller units; leap-day shifts are not always exact inverses.

```json
clock_offset_utc{"target":{"type":"duration","duration":{"days":35}}}
clock_offset_utc{"target":{"type":"moment","moment_b":"2026-12-19T12:00:00Z"}}
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
clock_offset_utc
clock_delta_alphadec
clock_help
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
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"clock_offset_utc","arguments":{"target":{"type":"duration","duration":{"days":35}}}}}' \
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

[BSD Zero Clause (0BSD)](LICENSE).
