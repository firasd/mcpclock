import { z } from "zod";
import { MCPCLOCK_VERSION } from "./version.js";

const readOnlyAnnotations = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false,
};

export const toolDefinitions = {
	clock_get: {
		description:
			`Returns time-of-day information for the requested time zones.\n` +
			"Examples:\n" +
			"  • clock_get{} // now, default UTC & Alphadec\n" +
			'  • clock_get{"timezones":["Asia/Tokyo","America/New_York"]}\n' +
			'  • clock_get{"timezones":["Asia/Kolkata"],"offsetSeconds":-3600}',
		inputSchema: z.object({
			timezones: z
				.array(z.string())
				.max(15)
				.optional()
				.describe(
					'Array of IANA zones plus the literals "UTC" or "Alphadec".\n' +
						'Defaults to ["UTC"].',
				),
			offsetSeconds: z
				.number()
				.int()
				.optional()
				.describe(
					"Signed offset (in seconds) to apply before formatting.\n" +
						'E.g. -86400 for "24 h ago", +60 for "one minute ahead".',
				),
		}),
		annotations: readOnlyAnnotations,
	},
	clock_day_info: {
		description:
			"Return day information for a UTC date. If no date is provided, defaults to *today* (UTC).\n" +
			"Returns: date, weekday, days_in_month, day_of_year, days_in_year, year_progress_pct, iso_week, hijri_calendar.\n" +
			"Examples:\n" +
			"  • clock_day_info{}\n" +
			'  • clock_day_info{"date":"2025-09-09"}',
		inputSchema: z.object({
			date: z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/)
				.optional()
				.describe(
					'Date in YYYY-MM-DD format (e.g., "2025-09-09"). Defaults to today in UTC if omitted.',
				),
		}),
		annotations: readOnlyAnnotations,
	},
	clock_convert: {
		description:
			"Convert a timestamp given in one zone (UTC or IANA) to one or more target zones (UTC or IANA).\n" +
			"Examples:\n" +
			'  • clock_convert{"source_zone":"America/Mexico_City","iso":"2025-10-28T07:30:00","target_zones":["UTC","Asia/Dubai"]}\n' +
			'  • clock_convert{"source_zone":"UTC","iso":"2025-10-28T15:30:00Z","target_zones":["Africa/Lagos"]}',
		inputSchema: z.object({
			source_zone: z
				.string()
				.describe(
					'IANA name † or "UTC". † Note: IANA names can contain "/", e.g., "Australia/Sydney".',
				),
			iso: z
				.string()
				.describe(
					'If source_zone is "UTC", pass a full UTC ISO-8601 string (e.g., "2025-10-28T15:30:00Z" or "...T15:30:00.123Z").\n' +
						'Otherwise, an ISO-8601 date/time *without* timezone offset (e.g., "2025-10-28T07:30:00"), ' +
						"which will be interpreted as wall-clock time in the specified IANA source_zone.",
				),
			target_zones: z
				.array(z.string())
				.min(1)
				.max(15)
				.describe('Array of target IANA zones or "UTC" to convert into.'),
		}),
		annotations: readOnlyAnnotations,
	},
	clock_convert_alphadec: {
		description:
			"Convert between a UTC ISO timestamp and an Alphadec string.\n" +
			"Examples:\n" +
			'clock_convert_alphadec{"direction": "utc_to_alphadec", "value": "2025-06-09T16:30:00.000Z"}\n' +
			'clock_convert_alphadec{"direction": "alphadec_to_utc", "value": "2025_L3T5_000000"}\n\n Alphadec timestamp = Year_PeriodArcBarBeat_offset. Units (approx): Period (A-Z) ≈ 14.04 days (UTC yr (different length leap yr vs common yr) ÷ 26) | Arc (0-9) ≈ 33.7 hours (Period ÷ 10) | Bar (A-Z) ≈ 77.75 minutes (Arc ÷ 26) | Beat (0-9) ≈ 7.78 minutes (Bar ÷ 10). The ending _000000 is milliseconds offset within the beat (max offset: 466,508 common year; 467,786 leap year). Period F contains Mar Equinox, Period M contains Jun Solstice, Period S contains Sep Equinox, Period Z contains Dec Solstice. K-sortable; truncating significant digits creates natural time groupings, eg 2025_M2 contains every Alphadec in M2 arc. Encoding is typically lossy by ≤1ms due to the 67,600-beat grid. There are exactly 400 ISO↔AlphaDec exact ms alignments per year, at every 1/400th (every 0.25%) of the year.',
		inputSchema: z.object({
			direction: z
				.enum(["utc_to_alphadec", "alphadec_to_utc"])
				.default("utc_to_alphadec")
				.describe(
					'Direction of conversion: "utc_to_alphadec" (default) or "alphadec_to_utc".',
				),
			value: z
				.string()
				.describe(
					'The value to convert: a UTC ISO 8601 string (e.g., "2025-10-24T13:30:00.000Z") ' +
						'if direction is "utc_to_alphadec", or an AlphaDec string (e.g., "2025_V1G5_000000") ' +
						'if direction is "alphadec_to_utc".',
				),
		}),
		annotations: readOnlyAnnotations,
	},
	clock_convert_unixtime: {
		description:
			"Convert between a UTC ISO timestamp and a Unix timestamp (seconds since epoch).\n" +
			"Examples:\n" +
			'clock_convert_unixtime{"direction": "utc_to_unixtime", "value": "2025-06-15T12:00:00Z"}\n' +
			'clock_convert_unixtime{"direction": "unixtime_to_utc", "value": "1749988800"}',
		inputSchema: z.object({
			direction: z
				.enum(["utc_to_unixtime", "unixtime_to_utc"])
				.default("utc_to_unixtime")
				.describe(
					'Direction of conversion: "utc_to_unixtime" (default) or "unixtime_to_utc".',
				),
			value: z
				.string()
				.describe(
					'The value to convert: a UTC ISO 8601 string (e.g., "2025-06-15T12:00:00Z") ' +
						'if direction is "utc_to_unixtime", or a Unix timestamp string (e.g., "1749988800") ' +
						'if direction is "unixtime_to_utc".',
				),
		}),
		annotations: readOnlyAnnotations,
	},
	clock_offset_utc: {
		description:
			'Measure the difference between UTC instants or shift an instant by a duration. moment_a defaults to NOW. target.type="moment" requires moment_b; target.type="duration" requires duration and optionally direction (after or before, default after). Moments accept UTC ISO timestamps or NOW. Years are applied one calendar year at a time before fixed days/hours/minutes/seconds, with Feb 29 rolling to March 1 in non-leap years. Both modes return moment_a, moment_b, signed total_seconds (rounded down to whole seconds), breakdown, and readable. Example: {"target":{"type":"duration","duration":{"days":35}}}. Example: {"target":{"type":"moment","moment_b":"2026-12-19T12:00:00Z"}}.',
		inputSchema: z.object({
			moment_a: z
				.string()
				.optional()
				.describe("UTC ISO instant or NOW. Defaults to the current instant."),
			target: z
				.discriminatedUnion("type", [
					z
						.object({
							type: z.literal("moment"),
							moment_b: z
								.string()
								.describe(
									"Second UTC ISO instant or NOW. Difference is moment_b minus moment_a.",
								),
						})
						.strict(),
					z
						.object({
							type: z.literal("duration"),
							direction: z
								.enum(["after", "before"])
								.default("after")
								.describe("Direction of movement from moment_a."),
							duration: z
								.object({
									years: z.number().int().nonnegative().max(9999).optional(),
									days: z.number().int().nonnegative().optional(),
									hours: z.number().int().nonnegative().optional(),
									minutes: z.number().int().nonnegative().optional(),
									seconds: z.number().int().nonnegative().optional(),
								})
								.strict()
								.describe(
									"Non-negative integers; omitted units default to zero. Smaller units roll over.",
								),
						})
						.strict(),
				])
				.describe("Supply either the second instant or a structured duration."),
		}),
		annotations: readOnlyAnnotations,
	},
	clock_delta_alphadec: {
		description:
			"Calculate the time difference between two 4-character AlphaDec timestamps within the current year.\n" +
			"At least one of 'alphadec_start' or 'alphadec_end' must be provided. " +
			"If one is omitted, the current time is used.\n" +
			"Implicitly uses current year and _000000 millisecond suffix for calculations.\n" +
			"Examples:\n" +
			'  • clock_delta_alphadec{"alphadec_start":"A2B3"} // time since A2B3 this year\n' +
			'  • clock_delta_alphadec{"alphadec_end":"Z8Y9"} // time until Z8Y9 this year\n' +
			'  • clock_delta_alphadec{"alphadec_start":"A2B3","alphadec_end":"C1Y9"}',
		inputSchema: z.object({
			alphadec_start: z
				.string()
				.regex(
					/^[A-Z]\d[A-Z]\d$/,
					"Must be a valid 4-character AlphaDec code, e.g., A2B3.",
				)
				.optional()
				.describe(
					"Optional start AlphaDec code (e.g., 'A2B3'). Defaults to current time if omitted.",
				),
			alphadec_end: z
				.string()
				.regex(
					/^[A-Z]\d[A-Z]\d$/,
					"Must be a valid 4-character AlphaDec code, e.g., C1Y9.",
				)
				.optional()
				.describe(
					"Optional end AlphaDec code (e.g., 'C1Y9'). Defaults to current time if omitted.",
				),
		}),
		annotations: readOnlyAnnotations,
	},
	clock_help: {
		description:
			"Return tool descriptions and parameter schemas, including required fields, defaults, constraints, and annotations. Omit tool to list all tools, or supply a tool name for focused help.",
		inputSchema: z.object({
			tool: z
				.string()
				.optional()
				.describe(
					'Optional tool name, e.g., "clock_offset_utc". Defaults to all tools.',
				),
		}),
		annotations: readOnlyAnnotations,
	},
};

export function getToolHelp({ tool }: { tool?: string } = {}) {
	const definitions = Object.entries(toolDefinitions);
	const matches =
		tool === undefined
			? definitions
			: definitions.filter(([name]) => name === tool);
	if (matches.length === 0) {
		throw new Error(
			`Unknown tool: ${tool}. Available tools: ${definitions.map(([name]) => name).join(", ")}`,
		);
	}
	return {
		version: MCPCLOCK_VERSION,
		tools: matches.map(([name, definition]) => ({
			name,
			description: definition.description,
			inputSchema: z.toJSONSchema(definition.inputSchema, { io: "input" }),
			annotations: { ...definition.annotations },
		})),
	};
}
