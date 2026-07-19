import { describe, expect, it, vi } from "vitest";
import { ChatCompletionsConverter } from "./chat-completions-converter.js";

describe("ChatCompletionsConverter", () => {
  it("converts requests", () => {
    const tools = [{ type: "function" as const, name: "weather", description: "Weather", parameters: { type: "object" } }];
    expect(new ChatCompletionsConverter().toAPI({ model: "m", input: "hi", instructions: "brief", tools })).toEqual({
      model: "m", messages: [{ role: "system", content: "brief" }, { role: "user", content: "hi" }],
      tools: [{ type: "function", function: { name: "weather", description: "Weather", parameters: { type: "object" } } }],
      stream: true,
    });
    expect(new ChatCompletionsConverter().toAPI({ model: "m", input: [
      { type: "message", role: "assistant", content: { type: "input_text", text: "ok" } },
      { type: "function_call", call_id: "c", name: "weather", arguments: "{}" },
      { type: "function_call", call_id: "d", name: "weather", arguments: "{}" },
      { type: "function_call_output", call_id: "c", output: "x" },
    ] }).messages).toEqual([
      { role: "assistant", content: "ok" },
      { role: "assistant", content: "", tool_calls: [
        { id: "c", type: "function", function: { name: "weather", arguments: "{}" } },
        { id: "d", type: "function", function: { name: "weather", arguments: "{}" } },
      ] },
      { role: "tool", tool_call_id: "c", content: "x" },
    ]);
  });

  it.each(["input_image", "input_file"] as const)("rejects %s", (type) => {
    const content = type === "input_image" ? { type, image_url: "x" } : { type, file_url: "x" };
    expect(() => new ChatCompletionsConverter().toAPI({ model: "m", input: [{ type: "message", role: "user", content }] })).toThrow(type);
  });

  it("maps streaming chunks to the new events", () => {
    const converter = new ChatCompletionsConverter();
    expect(converter.fromEvent({ id: "r", created: 1, choices: [{ index: 0, delta: { content: "hello", reasoning_content: "think" } }] }, undefined)).toEqual([
      { type: "response.created", response: { id: "r", created_at: 1, status: "in_progress", output: [] } },
      { type: "response.reasoning_summary_text.delta", index: 0, delta: "think" },
      { type: "response.message_text.delta", index: 0, delta: "hello" },
    ]);
    expect(converter.fromEvent({ id: "r", created: 1, choices: [{ index: 0, delta: { content: "" } }] }, { id: "r", created_at: 1, status: "in_progress", output: [] })).toEqual([
      { type: "response.message_text.delta", index: 0, delta: "" },
    ]);
  });

  it("maps tool call initialization and argument fragments", () => {
    const converter = new ChatCompletionsConverter();
    expect(converter.fromEvent({
      id: "r", created: 1, choices: [{ index: 0, delta: { content: "", tool_calls: [{
        index: 0, id: "call", type: "function", function: { name: "weather", arguments: "" },
      }] } }],
    }, undefined)).toEqual([
      { type: "response.created", response: { id: "r", created_at: 1, status: "in_progress", output: [] } },
      { type: "response.function_call.added", function_call: { id: "call", type: "function_call", call_id: "call", name: "weather", arguments: "" } },
    ]);
    expect(converter.fromEvent({
      id: "r", created: 1, choices: [{ index: 0, delta: { tool_calls: [
        { index: 0, function: { arguments: "{\"city\":" } },
        { index: 0, function: {} },
      ] } }],
    }, { id: "r", created_at: 1, status: "in_progress", output: [] })).toEqual([
      { type: "response.function_call_arguments.delta", delta: "{\"city\":" , index: 0 },
      { type: "response.function_call_arguments.delta", delta: "", index: 0 },
    ]);
  });

  it("uses response state to identify the first event", () => {
    const converter = new ChatCompletionsConverter();
    const event = { id: "same-id", created: 1, choices: [{ index: 0, delta: {} }] };
    expect(converter.fromEvent(event, undefined)).toEqual([
      { type: "response.created", response: { id: "same-id", created_at: 1, status: "in_progress", output: [] } },
    ]);
    expect(converter.fromEvent(event, undefined)).toEqual([
      { type: "response.created", response: { id: "same-id", created_at: 1, status: "in_progress", output: [] } },
    ]);
  });

  it("prints and skips chunks without a mapped delta", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const event = { id: "r", created: 1, choices: [] };
    expect(new ChatCompletionsConverter().fromEvent(event, { id: "r", created_at: 1, status: "in_progress", output: [] })).toBeUndefined();
    expect(log).toHaveBeenCalledWith(event);
    log.mockRestore();
  });

  it("maps [DONE] to response.completed", () => {
    const response = { id: "r", created_at: 1, status: "in_progress" as const, output: [] };
    expect(new ChatCompletionsConverter().fromEvent("[DONE]", response)).toEqual({ type: "response.completed", response });
    expect(() => new ChatCompletionsConverter().fromEvent("[DONE]", undefined)).toThrow("before response.created");
  });
});
