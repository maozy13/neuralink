import { describe, expect, it, vi } from "vitest";
import { ResponsesAPIConverter } from "./responses-api-converter.js";

describe("ResponsesAPIConverter", () => {
  const converter = new ResponsesAPIConverter();

  it("enables streaming", () => {
    const tools = [
      { type: "function" as const, name: "weather", description: "Weather", parameters: { type: "object" } },
      { type: "custom" as const, name: "apply_patch", description: "Apply a patch" },
    ];
    const input = [{
      type: "message" as const,
      role: "user" as const,
      content: [
        { type: "input_text" as const, text: "hello" },
        { type: "input_image" as const, image_url: "https://example.test/image.png" },
      ],
    }];
    expect(converter.toAPI({ model: "model", input, tools })).toEqual({ model: "model", input, tools, stream: true });
  });

  it.each([
    ["response.created", "in_progress"],
    ["response.completed", "completed"],
    ["response.failed", "failed"],
  ] as const)("maps %s", (type, status) => {
    expect(converter.fromEvent({ type, response: { id: "r", created_at: 1 } })).toEqual({
      type,
      response: { id: "r", created_at: 1, status, output: [] },
    });
  });

  it("maps incomplete responses and preserves response fields", () => {
    const sourceOutput = [{ id: "msg", type: "message" as const, role: "assistant" as const, content: [{ type: "output_text" as const, text: "partial" }] }];
    const output = [{ id: "msg", type: "message" as const, role: "assistant" as const, content: { type: "output_text" as const, text: "partial" } }];
    expect(converter.fromEvent({
      type: "response.incomplete", sequence_number: 7,
      response: { id: "r", created_at: 1, status: "cancelled", output: sourceOutput },
    })).toEqual({ type: "response.incomplete", sequence_number: 7, response: { id: "r", created_at: 1, status: "cancelled", output } });
    expect(converter.fromEvent({ type: "response.incomplete", response: { id: "r", created_at: 1 } })).toMatchObject({ sequence_number: 0 });
  });

  it("normalizes completed response output items", () => {
    expect(converter.fromEvent({
      type: "response.completed",
      response: {
        id: "r", created_at: 1, status: "completed",
        output: [
          { id: "rs", type: "reasoning", content: [{ type: "reasoning_text", text: "Details" }], summary: [{ type: "summary_text", text: "Think" }] },
          { id: "msg", type: "message", role: "assistant", content: [{ type: "output_text", text: "Hello" }] },
          { id: "ref", type: "message", role: "assistant", content: [{ type: "refusal", refusal: "No" }] },
          { id: "fc", type: "function_call", call_id: "call", name: "weather", arguments: "{\"city\":\"北京\"}" },
          { id: "ctc", type: "custom_tool_call", call_id: "custom", name: "apply_patch", input: "*** Begin Patch" },
        ],
      },
    })).toEqual({
      type: "response.completed",
      response: {
        id: "r", created_at: 1, status: "completed",
        output: [
          { id: "rs", type: "reasoning", content: { type: "reasoning_text", text: "Details" }, summary: { type: "summary_text", text: "Think" } },
          { id: "msg", type: "message", role: "assistant", content: { type: "output_text", text: "Hello" } },
          { id: "ref", type: "message", role: "assistant", content: { type: "refusal", refusal: "No" } },
          { id: "fc", type: "function_call", call_id: "call", name: "weather", arguments: "{\"city\":\"北京\"}" },
          { id: "ctc", type: "custom_tool_call", call_id: "custom", name: "apply_patch", input: "*** Begin Patch" },
        ],
      },
    });
  });

  it("initializes empty upstream output content", () => {
    expect(converter.fromEvent({
      type: "response.completed",
      response: { id: "r", created_at: 1, output: [
        { id: "rs", type: "reasoning" },
        { id: "msg", type: "message", role: "assistant", content: [] },
        { id: "fc", type: "function_call", call_id: "call", name: "weather" },
        { id: "ctc", type: "custom_tool_call", call_id: "custom", name: "apply_patch" },
      ] },
    })).toMatchObject({ response: { output: [
      { content: { type: "reasoning_text", text: "" }, summary: { type: "summary_text", text: "" } },
      { content: { type: "output_text", text: "" } },
      { arguments: "" },
      { input: "" },
    ] } });
  });

  it.each([
    [{ type: "response.output_item.added", item: { type: "message" } }, { type: "response.message_text.delta", index: 0, delta: "" }],
    [{ type: "response.output_item.added", item: { type: "reasoning" } }, { type: "response.reasoning_summary_text.delta", index: 0, delta: "" }],
    [{ type: "response.output_item.added", item: { id: "fc", type: "function_call", call_id: "call", name: "weather" } }, { type: "response.function_call.added", function_call: { id: "fc", type: "function_call", call_id: "call", name: "weather", arguments: "" } }],
    [{ type: "response.output_item.added", item: { id: "fc", type: "function_call", call_id: "call", name: "weather", arguments: "{}" } }, { type: "response.function_call.added", function_call: { id: "fc", type: "function_call", call_id: "call", name: "weather", arguments: "{}" } }],
    [{ type: "response.output_item.added", item: { id: "ctc", type: "custom_tool_call", call_id: "call", name: "apply_patch" } }, { type: "response.custom_tool_call.added", custom_tool_call: { id: "ctc", type: "custom_tool_call", call_id: "call", name: "apply_patch", input: "" } }],
    [{ type: "response.output_item.added", item: { id: "ctc", type: "custom_tool_call", call_id: "call", name: "apply_patch", input: "patch" } }, { type: "response.custom_tool_call.added", custom_tool_call: { id: "ctc", type: "custom_tool_call", call_id: "call", name: "apply_patch", input: "patch" } }],
    [{ type: "response.content_part.added", part: { type: "output_text" } }, { type: "response.message_text.delta", index: 0, delta: "" }],
    [{ type: "response.content_part.added", part: { type: "output_refusal" } }, { type: "response.message_refusal.delta", index: 0, delta: "" }],
    [{ type: "response.content_part.added", part: { type: "refusal" } }, { type: "response.message_refusal.delta", index: 0, delta: "" }],
    [{ type: "response.content_part.added", part: { type: "reasoning_text" } }, { type: "response.reasoning_text.delta", index: 0, delta: "" }],
    [{ type: "response.output_text.delta", delta: "hello" }, { type: "response.message_text.delta", index: 0, delta: "hello" }],
    [{ type: "response.reasoning_summary_part.added", part: { type: "summary_text" } }, { type: "response.reasoning_summary_text.delta", index: 0, delta: "" }],
    [{ type: "response.reasoning_summary_text.delta", delta: "think" }, { type: "response.reasoning_summary_text.delta", index: 0, delta: "think" }],
    [{ type: "response.reasoning_text.delta", delta: "details" }, { type: "response.reasoning_text.delta", index: 0, delta: "details" }],
  ] as const)("maps delta source event %#", (source, normalized) => {
    expect(converter.fromEvent(source)).toEqual(normalized);
  });

  it("maps Responses API output indexes to function-call indexes", () => {
    const response = {
      id: "r", created_at: 1, status: "in_progress" as const,
      output: [
        { type: "reasoning" as const, content: { type: "reasoning_text" as const, text: "" }, summary: { type: "summary_text" as const, text: "" } },
        { id: "fc", type: "function_call" as const, call_id: "call", name: "weather", arguments: "" },
      ],
    };
    expect(converter.fromEvent({
      type: "response.function_call_arguments.delta", delta: "{\"city\":", output_index: 1,
    }, response)).toEqual({ type: "response.function_call_arguments.delta", delta: "{\"city\":", index: 0 });
    expect(() => converter.fromEvent({
      type: "response.function_call_arguments.delta", delta: "{}", output_index: 0,
    })).toThrow("before response.created");
  });

  it("uses item identity even when normalized and upstream positions differ", () => {
    const response = { created_at: 1, status: "in_progress" as const, output: [
      { id: "a", type: "function_call" as const, call_id: "ca", name: "first", arguments: "" },
      { id: "b", type: "function_call" as const, call_id: "cb", name: "second", arguments: "" },
    ] };
    expect(converter.fromEvent({ type: "response.function_call_arguments.delta", item_id: "a", output_index: 2, delta: "{}" }, response)).toMatchObject({ index: 0 });
    expect(converter.fromEvent({ type: "response.function_call_arguments.delta", item_id: "missing", output_index: 0, delta: "{}" }, response)).toMatchObject({ index: -1 });
  });

  it("maps custom-tool input indexes by item identity and output position", () => {
    const response = { created_at: 1, status: "in_progress" as const, output: [
      { id: "a", type: "custom_tool_call" as const, call_id: "ca", name: "apply_patch", input: "" },
      { id: "b", type: "custom_tool_call" as const, call_id: "cb", name: "apply_patch", input: "" },
    ] };
    expect(converter.fromEvent({
      type: "response.custom_tool_call_input.delta", item_id: "a", output_index: 2, delta: "A",
    }, response)).toEqual({ type: "response.custom_tool_call_input.delta", index: 0, delta: "A" });
    expect(converter.fromEvent({
      type: "response.custom_tool_call_input.delta", output_index: 1, delta: "B",
    }, response)).toEqual({ type: "response.custom_tool_call_input.delta", index: 1, delta: "B" });
    expect(() => converter.fromEvent({
      type: "response.custom_tool_call_input.delta", output_index: 0, delta: "x",
    })).toThrow("before response.created");
  });

  it("maps provider output positions to same-type text and reasoning indexes", () => {
    const response = {
      id: "r", created_at: 1, status: "in_progress" as const,
      output: [
        { type: "message" as const, role: "assistant" as const, content: { type: "output_text" as const, text: "a" } },
        { type: "reasoning" as const, content: { type: "reasoning_text" as const, text: "" }, summary: { type: "summary_text" as const, text: "r" } },
        { type: "message" as const, role: "assistant" as const, content: { type: "output_text" as const, text: "b" } },
      ],
    };
    expect(converter.fromEvent({
      type: "response.output_item.added", output_index: 3, item: { type: "message" },
    }, response)).toEqual({ type: "response.message_text.delta", index: 2, delta: "" });
    expect(converter.fromEvent({
      type: "response.output_text.delta", output_index: 2, delta: "x",
    }, response)).toEqual({ type: "response.message_text.delta", index: 1, delta: "x" });
    expect(converter.fromEvent({
      type: "response.reasoning_summary_text.delta", output_index: 1, delta: "y",
    }, response)).toEqual({ type: "response.reasoning_summary_text.delta", index: 0, delta: "y" });
  });

  it("prints and ignores unsupported events", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const source = { type: "response.in_progress", sequence_number: 1 };
    const unsupportedOutput = {
      type: "response.output_item.added",
      output_index: 0,
      item: { type: "web_search_call", id: "ws_1" },
    };
    const unsupportedPart = { type: "response.content_part.added", part: { type: "audio" } };
    expect(converter.fromEvent(source)).toBeUndefined();
    expect(converter.fromEvent(unsupportedOutput)).toBeUndefined();
    expect(converter.fromEvent(unsupportedPart)).toBeUndefined();
    expect(log).toHaveBeenCalledWith(source);
    expect(log).toHaveBeenCalledWith(unsupportedOutput);
    expect(log).toHaveBeenCalledWith(unsupportedPart);
    log.mockRestore();
  });

  it("ignores the SSE [DONE] marker", () => {
    expect(converter.fromEvent("[DONE]")).toBeUndefined();
  });
});
