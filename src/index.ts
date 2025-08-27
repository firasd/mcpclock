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
						...(!(AlphadecExplicit && suppressFullAlphadec) && {
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
