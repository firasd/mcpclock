import { createMcpHandler } from "agents/mcp/server";
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { toolDefinitions, getToolHelp } from "./tool-definitions.js";
import { handleRestRequest } from "./rest.js";
import { MCPCLOCK_VERSION } from "./version.js";
import {
	clockGet,
	clockDayInfo,
	clockConvert,
	clockConvertAlphadec,
	clockConvertUnixtime,
	clockOffsetUtc,
	clockDeltaAlphadec,
} from "./mcpclock.js";
function mcpTool<T>(name: string, calculate: (args: T) => unknown) {
	return async (args: T): Promise<CallToolResult> => {
		try {
			return {
				content: [
					{ type: "text", text: JSON.stringify(calculate(args), null, 2) },
				],
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				isError: true,
				content: [{ type: "text", text: `Error in ${name}: ${message}` }],
			};
		}
	};
}
function createServer() {
	const server = new McpServer({
		name: "MCP Clock",
		version: MCPCLOCK_VERSION,
	});
	server.registerTool(
		"clock_get",
		toolDefinitions.clock_get,
		mcpTool("clock_get", clockGet),
	);
	server.registerTool(
		"clock_day_info",
		toolDefinitions.clock_day_info,
		mcpTool("clock_day_info", clockDayInfo),
	);
	server.registerTool(
		"clock_convert",
		toolDefinitions.clock_convert,
		mcpTool("clock_convert", clockConvert),
	);
	server.registerTool(
		"clock_convert_alphadec",
		toolDefinitions.clock_convert_alphadec,
		mcpTool("clock_convert_alphadec", clockConvertAlphadec),
	);
	server.registerTool(
		"clock_convert_unixtime",
		toolDefinitions.clock_convert_unixtime,
		mcpTool("clock_convert_unixtime", clockConvertUnixtime),
	);
	server.registerTool(
		"clock_offset_utc",
		toolDefinitions.clock_offset_utc,
		mcpTool("clock_offset_utc", clockOffsetUtc),
	);
	server.registerTool(
		"clock_delta_alphadec",
		toolDefinitions.clock_delta_alphadec,
		mcpTool("clock_delta_alphadec", clockDeltaAlphadec),
	);
	server.registerTool(
		"clock_help",
		toolDefinitions.clock_help,
		mcpTool("clock_help", getToolHelp),
	);
	return server;
}
const handleMcpRequest = createMcpHandler(createServer, { route: "/mcp" });
export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);
		if (url.pathname === "/mcp") {
			return handleMcpRequest(request, env, ctx);
		}
		return handleRestRequest(request);
	},
};
