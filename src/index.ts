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


// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "MCP Clock",
		version: "2025_Q9Z0",
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
			"Convert between a UTC ISO timestamp and an AlphaDec string.\n" +
			"Examples:\n" +
			'clock_convert_alphadec{"direction": "utc_to_alphadec", "value": "2025-06-09T16:30:00.000Z"}\n' +
			'clock_convert_alphadec{"direction": "alphadec_to_utc", "value": "L3T5_000000"}\n\n Alphadec units (approx): Period (A-Z) ≈ 14.04 days (UTC yr (different length leap yr vs common yr) ÷ 26) | Arc (0-9) ≈ 33.7 hours (Period ÷ 10) | Bar (A-Z) ≈ 77.75 minutes (Arc ÷ 26) | Beat (0-9) ≈ 7.78 minutes (Bar ÷ 10). The final part of canonical Alphadec is milliseconds offset within the beat. Period F contains Mar Equinox, Period M contains Jun Solstice, Period S contains Sep Equinox, Period Z contains Dec Solstice. K-sortable; truncating significant digits creates natural time groupings, eg 2025_M2 contains every Alphadec in M2 arc.', {
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

		return new Response("Not found", {
			status: 404
		});
	},
};
