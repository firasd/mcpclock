import { toolDefinitions, getToolHelp } from "./tool-definitions.js";
import { clockGet, clockDayInfo, clockConvert, clockConvertAlphadec, clockConvertUnixtime, clockShiftUtc, clockDeltaUtc, clockDeltaAlphadec } from "./mcpclock.js";

const handlers = {
  clock_get: (args: unknown) => clockGet(toolDefinitions.clock_get.inputSchema.parse(args)),
  clock_day_info: (args: unknown) => clockDayInfo(toolDefinitions.clock_day_info.inputSchema.parse(args)),
  clock_convert: (args: unknown) => clockConvert(toolDefinitions.clock_convert.inputSchema.parse(args)),
  clock_convert_alphadec: (args: unknown) => clockConvertAlphadec(toolDefinitions.clock_convert_alphadec.inputSchema.parse(args)),
  clock_convert_unixtime: (args: unknown) => clockConvertUnixtime(toolDefinitions.clock_convert_unixtime.inputSchema.parse(args)),
  clock_shift_utc: (args: unknown) => clockShiftUtc(toolDefinitions.clock_shift_utc.inputSchema.parse(args)),
  clock_delta_utc: (args: unknown) => clockDeltaUtc(toolDefinitions.clock_delta_utc.inputSchema.parse(args)),
  clock_delta_alphadec: (args: unknown) => clockDeltaAlphadec(toolDefinitions.clock_delta_alphadec.inputSchema.parse(args)),
  clock_help: (args: unknown) => getToolHelp(toolDefinitions.clock_help.inputSchema.parse(args)),
};

const headers = { "Cache-Control": "no-store" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value, null, 2), {
  status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
});
const text = (value: string, status = 200) => new Response(value, {
  status, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
});

export function handleRestRequest(request: Request): Response {
  const url = new URL(request.url);
  const name = url.pathname.startsWith("/tools/") ? url.pathname.slice(7) : undefined;
  if (url.pathname !== "/" && name !== "help" && !Object.prototype.hasOwnProperty.call(handlers, name ?? "")) {
    return json({ error: "Not found. See /tools/help." }, 404);
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Use GET for REST tools.", { status: 405, headers: { ...headers, Allow: "GET, HEAD" } });
  }
  let response: Response;
  try {
    if (url.pathname === "/") {
      response = text(`MCP Clock - welcome! It's currently:\n\n${JSON.stringify(clockGet(), null, 2)}\n\nSee /tools/help for GET endpoints and curl examples.\nMCP endpoint: /mcp\n`);
    } else if (name === "help") {
      const help = getToolHelp({ tool: url.searchParams.get("tool") ?? undefined });
      response = text([
        "MCP Clock - GET API", "",
        `curl '${url.origin}/tools/clock_get'`,
        `curl -G '${url.origin}/tools/clock_get' --data-urlencode 'timezones=["Asia/Kolkata","UTC"]'`,
        `curl -G '${url.origin}/tools/clock_shift_utc' --data-urlencode 'date_from=NOW' --data-urlencode 'delta={"days":35}'`,
        "", "Pass scalar values as query parameters. Arrays and objects use JSON.",
        "Alternatively, pass a JSON object in the args query parameter.",
        "Tool endpoints return JSON. Errors return HTTP 400; unknown paths return 404.",
        "Use /tools/help?tool=clock_shift_utc for focused help.", "",
        ...help.tools.map(tool => `GET /tools/${tool.name}\n${tool.description}\nParameters:\n${JSON.stringify(tool.inputSchema, null, 2)}\n`),
      ].join("\n"));
    } else {
      const key = name as keyof typeof handlers;
      let args: Record<string, unknown> = {};
      if (url.searchParams.has("args")) {
        if ([...url.searchParams.keys()].some(key => key !== "args") || url.searchParams.getAll("args").length !== 1) throw new Error("Use args alone, without other query parameters.");
        const parsed: unknown = JSON.parse(url.searchParams.get("args")!);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("args must be a JSON object.");
        args = parsed as Record<string, unknown>;
      } else {
        const schema = toolDefinitions[key].inputSchema;
        const properties = schema.shape;
        for (const [param, value] of url.searchParams) {
          if (!Object.prototype.hasOwnProperty.call(properties, param)) throw new Error(`Unknown parameter: ${param}`);
          if (url.searchParams.getAll(param).length !== 1) throw new Error(`Duplicate parameter: ${param}. Use JSON for arrays.`);
          // Strings stay strings (notably Unix timestamps and the literal "true").
          const field = getToolHelp({ tool: key }).tools[0].inputSchema.properties?.[param] as { type?: string };
          args[param] = field.type === "string" ? value : JSON.parse(value);
        }
      }
      response = json(handlers[key](args));
    }
  } catch (error) {
    response = json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
  return request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
}
