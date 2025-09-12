import {
	McpAgent
}
from "agents/mcp";
import {
	McpServer
}
from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	z
}
from "zod";
import {
	alphadec
}
from "./lib/alphadec.js";

const isValidIANATimeZone = (tz: string): boolean => {
	if (!tz || typeof tz !== 'string' || tz.length < 2) return false;
	try {
		new Intl.DateTimeFormat(undefined, {
			timeZone: tz
		});
		return true;
	}
	catch (_) {
		return false;
	}
};

export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "MCP Clock",
		version: "2025_S1N6",
	});

	async init() {
		this.server.tool(
			"clock_get",
			`Returns time-of-day information for the requested time zones.\n` +
			"Examples:\n" +
			"  • clock_get{} // now, default UTC & Alphadec\n" +
			'  • clock_get{"timezones":["Asia/Tokyo","America/New_York"]}\n' +
			'  • clock_get{"timezones":["Asia/Kolkata"],"offsetSeconds":-3600}', {
				timezones: z
					.array(z.string())
					.max(15)
					.optional()
					.describe(
						'Array of IANA zones plus the literals "UTC" or "Alphadec".\n' +
						'Defaults to ["UTC"].'
					),
				offsetSeconds: z
					.number()
					.int()
					.optional()
					.describe(
						"Signed offset (in seconds) to apply before formatting.\n" +
						'E.g. -86400 for "24 h ago", +60 for "one minute ahead".'
					),
				adec_canonical_only: z.enum(["true"]).optional().describe("Only show the canonical Alphadec string without format explanation.")
			},
			async ({
				timezones,
				offsetSeconds,
				adec_canonical_only
			}) => {
				try {
					/* ── 1. reference moment (apply offset if supplied) ─────────────── */
					const base = new Date();
					const target = offsetSeconds ?
						new Date(base.getTime() + offsetSeconds * 1_000) :
						base;

					const AlphadecData = alphadec.encode(target);

					/* ── 2. validate requested zones ───────────────────────────────── */
					const requestedZones = timezones?.length ? timezones : ["UTC"];
					const isPseudo = (tz: string) => tz === "UTC" || tz === "Alphadec";

					const AlphadecExplicit = requestedZones.includes("Alphadec");

					for (const tz of requestedZones) {
						if (!isPseudo(tz) && !isValidIANATimeZone(tz)) {
							throw new Error(`Invalid timezone: ${tz}`);
						}
					}

					/* ── 3. build response entries ─────────────────────────────────── */
					const entries: any[] = [];
					const suppressFullAlphadec = adec_canonical_only === 'true';

					// Process IANA zones and UTC
					for (const tz of requestedZones) {
						if (tz === "Alphadec") continue;
						if (tz === "UTC" && !entries.some(e => e.timezone === "UTC")) {
							entries.push({
								timezone: "UTC",
								iso: target.toISOString(),
								unixtime: Math.floor(target.getTime() / 1000)
							});
							continue;
						}
						if (tz !== "UTC") {
							entries.push({
								timezone: tz,
								time12: new Intl.DateTimeFormat("en-US", {
									hour: "numeric",
									minute: "numeric",
									hour12: true,
									timeZone: tz
								}).format(target),
								time24: new Intl.DateTimeFormat("en-US", {
									hour: "numeric",
									minute: "numeric",
									hour12: false,
									timeZone: tz
								}).format(target),
								dayName: new Intl.DateTimeFormat("en-US", {
									weekday: "long",
									timeZone: tz
								}).format(target),
								date: new Intl.DateTimeFormat("en-US", {
									year: "numeric",
									month: "short",
									day: "numeric",
									timeZone: tz
								}).format(target)
							});
						}
					}

					if (!entries.some(e => e.timezone === "UTC")) {
						entries.push({
							timezone: "UTC",
							iso: target.toISOString(),
							unixtime: Math.floor(target.getTime() / 1000)
						});
					}

					entries.push({
						timezone: "Alphadec",
						alphadec: AlphadecData.canonical,
						...((AlphadecExplicit && !suppressFullAlphadec) && {
							readable: AlphadecData.readable
						})
					});
					/* ── 4. respond ────────────────────────────────────────────────── */
					let preamble = "";
					if (AlphadecExplicit && !suppressFullAlphadec) {
						preamble = "// Alphadec units (approx): Period (A-Z) ≈ 14.04 days (UTC yr (different length leap yr vs common yr) / 26) | Arc (0-9) ≈ 33.7 hours (Period / 10) | Bar (A-Z) ≈ 77.75 minutes (Arc / 26) | Beat (0-9) ≈ 7.78 minutes (Bar / 10). The final part of canonical Alphadec is milliseconds offset within the beat.'\n";
					}

					return {
						content: [{
							type: "text",
							text: preamble + JSON.stringify(entries, null, 2)
						}]
					};
				}
				catch (e: any) {
					const errorMessage = e instanceof Error ? e.message : String(e);
					return {
						content: [{
							type: "text",
							text: `Error in clock_get: ${errorMessage}`
						}],
						error: true
					};
				}
			}
		);

		this.server.tool(
			"clock_day_info",
			"Return day information for a UTC date. If no date is provided, defaults to *today* (UTC).\n" +
			"Returns: date, weekday, days_in_month, day_of_year, days_in_year, year_progress_pct, iso_week.\n" +
			"Examples:\n" +
			"  • clock_day_info{}\n" +
			'  • clock_day_info{"date":"2025-09-09"}', {
				date: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/)
					.optional()
					.describe('Date in YYYY-MM-DD format (e.g., "2025-09-09"). Defaults to today in UTC if omitted.')
			},
			async ({
				date
			}) => {
				try {
					// Resolve to YYYY-MM-DD in UTC (today if not provided)
					const toUTCDateStr = (d: Date) => {
						const y = d.getUTCFullYear();
						const m = String(d.getUTCMonth() + 1).padStart(2, "0");
						const da = String(d.getUTCDate()).padStart(2, "0");
						return `${y}-${m}-${da}`;
					};
					const resolvedDate = date ?? toUTCDateStr(new Date());

					const dateObj = new Date(resolvedDate + "T00:00:00.000Z");
					const year = dateObj.getUTCFullYear();
					const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
					const daysInYear = isLeapYear ? 366 : 365;

					// Day of year
					const startOfYear = new Date(Date.UTC(year, 0, 1));
					const dayOfYear =
						Math.floor((dateObj.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;

					// Year progress (rough %)
					const yearProgress = Math.round((dayOfYear / daysInYear) * 100);

					const weekdayName = new Intl.DateTimeFormat("en-US", {
						weekday: "long",
						timeZone: "UTC",
					}).format(dateObj);

					// ISO week (simplified)
					const tempDate = new Date(dateObj);
					const dayOfWeek = (tempDate.getUTCDay() + 6) % 7; // Monday = 0
					tempDate.setUTCDate(tempDate.getUTCDate() - dayOfWeek + 3); // Thursday of this week
					const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 4));
					const yearStartDay = (yearStart.getUTCDay() + 6) % 7;
					yearStart.setUTCDate(yearStart.getUTCDate() - yearStartDay + 3);
					const isoWeek = Math.floor((tempDate.getTime() - yearStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;

					// Days in this month
					const daysInMonth = new Date(Date.UTC(year, dateObj.getUTCMonth() + 1, 0)).getUTCDate();

					return {
						content: [{
							type: "text",
							text: JSON.stringify({
									date: resolvedDate,
									weekday: weekdayName,
									days_in_month: daysInMonth,
									day_of_year: dayOfYear,
									days_in_year: daysInYear,
									year_progress_pct: yearProgress,
									iso_week: isoWeek,
								},
								null,
								2
							),
						}, ],
					};
				}
				catch (e: any) {
					return {
						content: [{
							type: "text",
							text: `Error in clock_day_info: ${e.message}`
						}],
						error: true,
					};
				}
			}
		);

		this.server.tool(
			"clock_convert",
			"Convert a timestamp given in one zone (UTC or IANA) to one or more target zones (UTC or IANA).\n" +
			"Examples:\n" +
			'  • clock_convert{"source_zone":"America/Mexico_City","iso":"2025-10-28T07:30:00","target_zones":["UTC","Asia/Dubai"]}\n' +
			'  • clock_convert{"source_zone":"UTC","iso":"2025-10-28T15:30:00Z","target_zones":["Africa/Lagos"]}', {
				source_zone: z.string().describe(
					'IANA name † or "UTC". † Note: IANA names can contain "/", e.g., "Australia/Sydney".'
				),
				iso: z.string().describe(
					'If source_zone is "UTC", pass a full UTC ISO-8601 string (e.g., "2025-10-28T15:30:00Z" or "...T15:30:00.123Z").\n' +
					'Otherwise, an ISO-8601 date/time *without* timezone offset (e.g., "2025-10-28T07:30:00"), ' +
					'which will be interpreted as wall-clock time in the specified IANA source_zone.'
				),
				target_zones: z.array(z.string())
					.min(1).max(15)
					.describe('Array of target IANA zones or "UTC" to convert into.')
			},
			async ({
				source_zone,
				iso,
				target_zones
			}) => {
				try {
					let srcDateUTC: Date;

					// Validate source_zone before proceeding
					if (source_zone !== "UTC" && !isValidIANATimeZone(source_zone)) {
						throw new Error(`Invalid source_zone: "${source_zone}". Must be "UTC" or a valid IANA zone name.`);
					}

					if (source_zone === "UTC") {
						// For UTC source, expect a full ISO string with Z or offset
						if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?Z$/.test(iso)) {
							// Updated regex to strictly require Z for UTC source_zone
							throw new Error(`Invalid ISO format for UTC source: "${iso}". Expected YYYY-MM-DDTHH:MM(:SS)(.mmm)Z.`);
						}
						srcDateUTC = new Date(iso);
					}
					else { // IANA source_zone
						if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?$/.test(iso)) {
							throw new Error(`Invalid ISO-8601 format for IANA source "${source_zone}": "${iso}". Expected YYYY-MM-DDTHH:MM(:SS)(.mmm) without offset.`);
						}
						const isoTimestamp = iso.replace(' ', 'T'); // Should not be needed if regex is strict

						// Using the "double date trick" for IANA local time to UTC conversion
						const term1Ms = Date.parse(isoTimestamp + "Z"); // Create a date as if input was UTC
						if (Number.isNaN(term1Ms)) {
							throw new Error(`Invalid ISO date/time string for parsing: ${isoTimestamp}`);
						}
						// Get what 'term1Ms' would be if interpreted in the actual source_zone, then convert THAT to UTC string
						const localTimeInSourceZoneStr = new Date(term1Ms)
							.toLocaleString('sv-SE', {
								timeZone: source_zone,
								hour12: false
							})
							.replace(' ', 'T'); // 'sv-SE' gives 'YYYY-MM-DD HH:MM:SS'

						const term2Ms = Date.parse(localTimeInSourceZoneStr + "Z"); // Date.parse assumes UTC if 'Z' is appended
						if (Number.isNaN(term2Ms)) {
							throw new Error(`Failed to parse localized time string for zone ${source_zone}: ${localTimeInSourceZoneStr}`);
						}
						// The difference (term1Ms - term2Ms) is the offset.
						// If localTimeInSourceZoneStr was earlier than isoTimestamp (e.g. America/New_York), term2Ms < term1Ms, diff > 0.
						// srcDateUTC should be term1Ms - (term1Ms - term2Ms) = term2Ms ??? NO
						// Correct logic: offset = term1Ms - term2Ms. True UTC = term1Ms - offset
						// srcDateUTC = new Date(term1Ms - (term1Ms - term2Ms)); // This is equivalent to new Date(term2Ms)
						// srcDateUTC = new Date(term1Ms + (term1Ms - term2Ms)); // From prior examples: 2 * term1Ms - term2Ms
						srcDateUTC = new Date(2 * term1Ms - term2Ms);
					}

					if (Number.isNaN(srcDateUTC.getTime())) {
						throw new Error(`Could not determine a valid UTC date from source: ${source_zone}, iso: ${iso}`);
					}

					/* -------- Validate target zones -------- */
					for (const tz of target_zones) {
						if (tz !== "UTC" && !isValidIANATimeZone(tz)) {
							throw new Error(`Invalid target zone: "${tz}". Must be "UTC" or a valid IANA zone name.`);
						}
					}

					/* -------- Build outputs -------- */
					const out = target_zones.map(targetZone => {
						if (targetZone === "UTC") {
							return {
								timezone: "UTC",
								iso: srcDateUTC.toISOString()
							};
						}

						// For IANA target zones
						return {
							timezone: targetZone,

							time12: new Intl.DateTimeFormat(
								"en-US", {
									hour: "numeric",
									minute: "2-digit",
									hour12: true,
									timeZone: targetZone
								}
							).format(srcDateUTC),

							time24: new Intl.DateTimeFormat(
								"en-US", {
									hour: "2-digit",
									minute: "2-digit",
									second: "2-digit",
									hour12: false,
									timeZone: targetZone
								}
							).format(srcDateUTC),

							dayName: new Intl.DateTimeFormat(
								"en-US", {
									weekday: "long",
									timeZone: targetZone
								}
							).format(srcDateUTC),

							date: new Intl.DateTimeFormat(
								"en-US", {
									year: "numeric",
									month: "short",
									day: "numeric",
									timeZone: targetZone
								}
							).format(srcDateUTC)
						};
					});

					return {
						content: [{
							type: "text",
							text: JSON.stringify(out, null, 2)
						}]
					};

				}
				catch (e: any) {
					const errorMessage = e instanceof Error ? e.message : String(e);
					return {
						content: [{
							type: "text",
							text: `Error in clock_convert: ${errorMessage}`
						}],
						error: true
					};
				}
			}
		);

		this.server.tool(
			"clock_convert_alphadec",
			"Convert between a UTC ISO timestamp and an Alphadec string.\n" +
			"Examples:\n" +
			'clock_convert_alphadec{"direction": "utc_to_alphadec", "value": "2025-06-09T16:30:00.000Z"}\n' +
			'clock_convert_alphadec{"direction": "alphadec_to_utc", "value": "2025_L3T5_000000"}\n\n Alphadec timestamp = Year_PeriodArcBarBeat_offset. Units (approx): Period (A-Z) ≈ 14.04 days (UTC yr (different length leap yr vs common yr) ÷ 26) | Arc (0-9) ≈ 33.7 hours (Period ÷ 10) | Bar (A-Z) ≈ 77.75 minutes (Arc ÷ 26) | Beat (0-9) ≈ 7.78 minutes (Bar ÷ 10). The ending _000000 is milliseconds offset within the beat (max offset: 466,508 common year; 467,786 leap year). Period F contains Mar Equinox, Period M contains Jun Solstice, Period S contains Sep Equinox, Period Z contains Dec Solstice. K-sortable; truncating significant digits creates natural time groupings, eg 2025_M2 contains every Alphadec in M2 arc. Encoding is typically lossy by ≤1ms due to the 67,600-beat grid. There are exactly 400 ISO↔AlphaDec exact ms alignments per year, at every 1/400th (every 0.25%) of the year.', {
				direction: z.enum(["utc_to_alphadec", "alphadec_to_utc"])
					.default("utc_to_alphadec")
					.describe(
						'Direction of conversion: "utc_to_alphadec" (default) or "alphadec_to_utc".'
					),
				value: z.string().describe(
					'The value to convert: a UTC ISO 8601 string (e.g., "2025-10-24T13:30:00.000Z") ' +
					'if direction is "utc_to_alphadec", or an AlphaDec string (e.g., "2025_V1G5_000000") ' +
					'if direction is "alphadec_to_utc".'
				)
			},
			async ({
				direction,
				value
			}) => {
				try {
					if (direction === "utc_to_alphadec") {
						// Validate if 'value' is a valid ISO string for UTC
						if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?Z$/.test(value)) {
							throw new Error(`Invalid UTC ISO format for "value": ${value}. Expected YYYY-MM-DDTHH:MM(:SS)(.mmm)Z.`);
						}
						const inputDate = new Date(value);
						if (Number.isNaN(inputDate.getTime())) {
							throw new Error(`Invalid date from UTC ISO string: ${value}`);
						}
						const encodeResult = alphadec.encode(inputDate);
						return {
							content: [{
								type: "text",
								text: JSON.stringify({
									source_utc_iso: value,
									alphadec: encodeResult.canonical
								}, null, 2)
							}]
						};
					}
					else { // direction === "alphadec_to_utc"
						if (!/^\d{4}_[A-Z]\d[A-Z]\d_[0-9]{6}$/.test(value)) {
							throw new Error(`Invalid AlphaDec format for "value": ${value}. Expected YYYY_PaBt_MMMMMM.`);
						}
						const decodedDate = alphadec.decode(value);
						if (Number.isNaN(decodedDate.getTime())) {
							throw new Error(`Invalid AlphaDec string or unable to decode: ${value}`);
						}
						return {
							content: [{
								type: "text",
								text: JSON.stringify({
									source_alphadec: value,
									utc_iso: decodedDate.toISOString()
								}, null, 2)
							}]
						};
					}
				}
				catch (e: any) {
					const errorMessage = e instanceof Error ? e.message : String(e);
					return {
						content: [{
							type: "text",
							text: `Error in clock_convert_alphadec: ${errorMessage}`
						}],
						error: true
					};
				}
			}
		);

		this.server.tool(
			"clock_convert_unixtime",
			"Convert between a UTC ISO timestamp and a Unix timestamp (seconds since epoch).\n" +
			"Examples:\n" +
			'clock_convert_unixtime{"direction": "utc_to_unixtime", "value": "2025-06-15T12:00:00Z"}\n' +
			'clock_convert_unixtime{"direction": "unixtime_to_utc", "value": "1749988800"}', {
				direction: z.enum(["utc_to_unixtime", "unixtime_to_utc"])
					.default("utc_to_unixtime")
					.describe(
						'Direction of conversion: "utc_to_unixtime" (default) or "unixtime_to_utc".'
					),
				value: z.string().describe(
					'The value to convert: a UTC ISO 8601 string (e.g., "2025-06-15T12:00:00Z") ' +
					'if direction is "utc_to_unixtime", or a Unix timestamp string (e.g., "1749988800") ' +
					'if direction is "unixtime_to_utc".'
				)
			},
			async ({
				direction,
				value
			}) => {
				try {
					if (direction === "utc_to_unixtime") {
						// Validate if 'value' is a valid ISO string for UTC
						if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/.test(value)) {
							throw new Error(`Invalid UTC ISO format for "value": ${value}. Expected YYYY-MM-DDTHH:MM(:SS)Z.`);
						}
						const inputDate = new Date(value);
						if (Number.isNaN(inputDate.getTime())) {
							throw new Error(`Invalid date from UTC ISO string: ${value}`);
						}
						const unixTimestamp = Math.floor(inputDate.getTime() / 1000);
						return {
							content: [{
								type: "text",
								text: JSON.stringify({
									source_utc_iso: value,
									unix_timestamp: unixTimestamp
								}, null, 2)
							}]
						};
					}
					else { // direction === "unixtime_to_utc"
						// Validate if 'value' is a valid Unix timestamp (integer seconds)
						if (!/^\d+$/.test(value)) {
							throw new Error(`Invalid Unix timestamp format for "value": ${value}. Expected positive integer (seconds since epoch).`);
						}
						const unixSeconds = parseInt(value, 10);
						if (Number.isNaN(unixSeconds) || unixSeconds < 0) {
							throw new Error(`Invalid Unix timestamp: ${value}. Must be a non-negative integer.`);
						}
						const convertedDate = new Date(unixSeconds * 1000);
						if (Number.isNaN(convertedDate.getTime())) {
							throw new Error(`Invalid Unix timestamp or unable to convert: ${value}`);
						}
						return {
							content: [{
								type: "text",
								text: JSON.stringify({
									source_unix_timestamp: unixSeconds,
									utc_iso: convertedDate.toISOString()
								}, null, 2)
							}]
						};
					}
				}
				catch (e: any) {
					const errorMessage = e instanceof Error ? e.message : String(e);
					return {
						content: [{
							type: "text",
							text: `Error in clock_convert_unixtime: ${errorMessage}`
						}],
						error: true
					};
				}
			}
		);


		this.server.tool(
			"clock_delta_utc",
			"Calculate the time difference between two UTC ISO timestamps.\n" +
			"At least one of 'start' or 'end' must be provided. " +
			"If 'start' is omitted, the current time is used. If 'end' is omitted, the current time is used.\n" +
			"Returns a negative delta if the start time is after the end time.\n" +
			"Examples:\n" +
			'  • clock_delta_utc{"start": "2022-01-15T10:30:00Z"} // time since that date\n' +
			'  • clock_delta_utc{"end": "2025-12-31T23:59:59Z"} // time until that date\n' +
			'  • clock_delta_utc{"start": "2022-01-15T10:30:00Z", "end": "2025-08-31T14:45:30Z"}', {
				start: z
					.string()
					.optional()
					.describe('Optional start UTC ISO timestamp (e.g., "2022-01-15T10:30:00Z")'),
				end: z
					.string()
					.optional()
					.describe('Optional end UTC ISO timestamp (e.g., "2025-08-31T14:45:30Z")'),
			},
			async ({
				start,
				end
			}) => {
				try {
					// 1. Handle optional parameters
					if (!start && !end) {
						throw new Error("At least one of 'start' or 'end' must be provided.");
					}

					const now = new Date();
					// Format 'now' to match the required YYYY-MM-DDTHH:MM:SSZ format
					const nowStr = now.toISOString().slice(0, 19) + 'Z';

					const resolvedStart = start || nowStr;
					const resolvedEnd = end || nowStr;

					// 2. Validate format (can be kept as is)
					const ISO_UTC_SECONDS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
					if (!ISO_UTC_SECONDS_RE.test(resolvedStart)) {
						throw new Error(`Invalid start UTC ISO format: ${resolvedStart}.`);
					}
					if (!ISO_UTC_SECONDS_RE.test(resolvedEnd)) {
						throw new Error(`Invalid end UTC ISO format: ${resolvedEnd}.`);
					}

					const startDate = new Date(resolvedStart);
					const endDate = new Date(resolvedEnd);

					if (Number.isNaN(startDate.getTime())) {
						throw new Error(`Invalid start date: ${resolvedStart}`);
					}
					if (Number.isNaN(endDate.getTime())) {
						throw new Error(`Invalid end date: ${resolvedEnd}`);
					}

					// 3. Calculate total difference (this will determine the sign)
					const totalMs = endDate.getTime() - startDate.getTime();
					const sign = totalMs < 0 ? -1 : 1;

					// For the breakdown, always calculate from earlier to later date
					const earlierDate = sign === 1 ? startDate : endDate;
					const laterDate = sign === 1 ? endDate : startDate;

					// 4. Reuse your proven breakdown logic with the ordered dates
					let years = 0;
					let cursor = new Date(earlierDate);
					while (true) {
						const next = new Date(cursor);
						next.setUTCFullYear(next.getUTCFullYear() + 1);
						if (next.getTime() <= laterDate.getTime()) {
							years++;
							cursor = next;
						}
						else {
							break;
						}
					}

					let remainingMs = laterDate.getTime() - cursor.getTime();
					const MS_DAY = 1000 * 60 * 60 * 24;
					const MS_HOUR = 1000 * 60 * 60;
					const MS_MIN = 1000 * 60;

					const days = Math.floor(remainingMs / MS_DAY);
					remainingMs %= MS_DAY;
					const hours = Math.floor(remainingMs / MS_HOUR);
					remainingMs %= MS_HOUR;
					const minutes = Math.floor(remainingMs / MS_MIN);
					remainingMs %= MS_MIN;
					const seconds = Math.floor(remainingMs / 1000);

					// 5. Format readable string with the correct sign
					const parts: string[] = [];
					if (years > 0) parts.push(`${years} year${years !== 1 ? "s" : ""}`);
					if (days > 0) parts.push(`${days} day${days !== 1 ? "s" : ""}`);
					if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
					if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? "s" : ""}`);
					if (seconds > 0 || parts.length === 0)
						parts.push(`${seconds} second${seconds !== 1 ? "s" : ""}`);

					const readablePrefix = sign < 0 ? "Negative difference of " : "";
					const readable = readablePrefix + parts.join(", ");

					return {
						content: [{
							type: "text",
							text: JSON.stringify({
									start_utc_iso: resolvedStart,
									end_utc_iso: resolvedEnd,
									// total_seconds will correctly be negative or positive
									total_seconds: Math.floor(totalMs / 1000),
									breakdown: {
										years,
										days,
										hours,
										minutes,
										seconds,
									},
									readable,
								},
								null,
								2
							),
						}, ],
					};
				}
				catch (e: any) {
					const errorMessage = e instanceof Error ? e.message : String(e);
					return {
						content: [{
							type: "text",
							text: `Error in clock_delta_utc: ${errorMessage}`,
						}, ],
						error: true,
					};
				}
			}
		);
		this.server.tool(
			"clock_delta_alphadec",
			"Calculate the time difference between two 4-character AlphaDec timestamps within the current year. " +
			"Implicitly uses current year and _000000 millisecond suffix. " +
			"Example: clock_delta_alphadec{\"alphadec_start\":\"A2B3\",\"alphadec_end\":\"C1Y9\"}", {
				alphadec_start: z
					.string()
					.regex(/^[A-Z]\d[A-Z]\d$/, "Must be a valid 4-character AlphaDec code, e.g., A2B3."),
				alphadec_end: z
					.string()
					.regex(/^[A-Z]\d[A-Z]\d$/, "Must be a valid 4-character AlphaDec code, e.g., C1Y9."),
			},
			async ({
				alphadec_start,
				alphadec_end
			}) => {
				try {
					const currentYear = new Date().getUTCFullYear();

					// Construct full canonical strings and decode
					const full_start = `${currentYear}_${alphadec_start}_000000`;
					const full_end = `${currentYear}_${alphadec_end}_000000`;

					const date_start = alphadec.decode(full_start);
					const date_end = alphadec.decode(full_end);

					if (Number.isNaN(date_start.getTime()) || Number.isNaN(date_end.getTime())) {
						throw new Error("Failed to decode one or both AlphaDec codes for the current year.");
					}

					// Calculate ISO time difference
					const delta_ms = date_end.getTime() - date_start.getTime();
					const total_seconds = Math.abs(delta_ms) / 1000;
					const sign = delta_ms < 0 ? "-" : "";

					const hours = Math.floor(total_seconds / 3600);
					const minutes = Math.floor((total_seconds % 3600) / 60);
					const seconds = Math.floor(total_seconds % 60);
					const iso_delta = `${sign}${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

					// Calculate AlphaDec unit difference
					const beats_in_arc = 260; // 26 bars * 10 beats
					const beats_in_period = 2600; // 10 arcs * 260 beats

					const alphadecToBeats = (code: string): number => {
						const [p_char, a_char, b_char, t_char] = code;
						const p_idx = p_char.charCodeAt(0) - 65; // 'A' = 65
						const a_val = parseInt(a_char, 10);
						const b_idx = b_char.charCodeAt(0) - 65;
						const t_val = parseInt(t_char, 10);

						return p_idx * beats_in_period + a_val * beats_in_arc + b_idx * 10 + t_val;
					};

					const delta_beats = alphadecToBeats(alphadec_end) - alphadecToBeats(alphadec_start);
					const adec_sign = delta_beats < 0 ? "-" : "";
					let remaining = Math.abs(delta_beats);

					const periods = Math.floor(remaining / beats_in_period);
					remaining %= beats_in_period;
					const arcs = Math.floor(remaining / beats_in_arc);
					remaining %= beats_in_arc;
					const bars = Math.floor(remaining / 10);
					const beats = remaining % 10;

					const alphadec_delta = `${adec_sign}${String(periods).padStart(2, "0")}:${String(arcs).padStart(2, "0")}:${String(bars).padStart(2, "0")}:${String(beats).padStart(2, "0")}`;

					const breakdown = delta_beats < 0 ?
						`Negative difference of ${periods} period(s), ${arcs} arc(s), ${bars} bar(s), ${beats} beat(s)` :
						`${periods} period(s), ${arcs} arc(s), ${bars} bar(s), ${beats} beat(s)`;

					return {
						content: [{
							type: "text",
							text: JSON.stringify({
								iso_time_difference: iso_delta,
								alphadec_unit_delta: alphadec_delta,
								breakdown: breakdown
							}, null, 2)
						}],
					};

				}
				catch (e: any) {
					return {
						content: [{
							type: "text",
							text: `Error in clock_delta_alphadec: ${e.message}`
						}],
						error: true,
					};
				}
			}
		);


	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("MCP Clock: Welcome!", {
			status: 200
		});
	},
};
