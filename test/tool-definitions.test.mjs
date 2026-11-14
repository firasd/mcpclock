import assert from "node:assert/strict";
import test from "node:test";
import { getToolHelp, toolDefinitions } from "../src/tool-definitions.ts";

test("help lists every tool, including itself", () => {
  const { tools } = getToolHelp();
  assert.deepEqual(tools.map(tool => tool.name), Object.keys(toolDefinitions));
  assert.equal(tools.length, 9);
  assert.equal(tools.find(tool => tool.name === "clock_help").inputSchema.properties.tool.type, "string");
});

test("focused help includes nested constraints and required parameters", () => {
  const { tools } = getToolHelp({ tool: "clock_shift_utc" });
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "clock_shift_utc");
  const schema = tools[0].inputSchema;
  assert.deepEqual(schema.required, ["date_from"]);
  assert.match(schema.properties.date_from.description, /NOW/);
  assert.deepEqual(schema.properties.direction.enum, ["after", "before"]);
  assert.equal(schema.properties.delta.properties.days.type, "integer");
  assert.equal(schema.properties.delta.properties.days.minimum, 0);
  assert.equal(tools[0].annotations.readOnlyHint, true);
});

test("help reflects the shared description rather than a duplicate", () => {
  const definition = toolDefinitions.clock_day_info;
  const previous = definition.description;
  try {
    definition.description = "Updated calendar description";
    assert.equal(getToolHelp({ tool: "clock_day_info" }).tools[0].description, definition.description);
  } finally {
    definition.description = previous;
  }
});

test("help preserves defaults without marking defaulted inputs as required", () => {
  const { inputSchema } = getToolHelp({ tool: "clock_convert_unixtime" }).tools[0];
  assert.equal(inputSchema.properties.direction.default, "utc_to_unixtime");
  assert.deepEqual(inputSchema.required, ["value"]);
  const getSchema = getToolHelp({ tool: "clock_get" }).tools[0].inputSchema;
  assert.equal(getSchema.properties.timezones.maxItems, 15);
  assert.match(getSchema.properties.offsetSeconds.description, /Signed offset/);
});

test("unknown tool names are rejected, including object prototype properties", () => {
  assert.throws(() => getToolHelp({ tool: "missing" }), /Unknown tool: missing/);
  assert.throws(() => getToolHelp({ tool: "toString" }), /Unknown tool/);
  assert.throws(() => getToolHelp({ tool: "" }), /Unknown tool/);
});
