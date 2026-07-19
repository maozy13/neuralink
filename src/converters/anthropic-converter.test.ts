import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicConverter } from "./anthropic-converter.js";

describe("AnthropicConverter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("converts text input, instructions, and tools", () => {
    expect(new AnthropicConverter().toAPI({
      model: "claude-test",
      input: "Hello",
      instructions: "Be concise",
      tools: [{ type: "function", name: "weather", description: "Weather", parameters: { type: "object" } }],
    })).toEqual({
      model: "claude-test",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 4096,
      stream: true,
      system: "Be concise",
      tools: [{ name: "weather", description: "Weather", input_schema: { type: "object" } }],
    });
  });

  it("converts structured messages and groups parallel tool blocks", () => {
    expect(new AnthropicConverter().toAPI({
      model: "claude-test",
      input: [
        { type: "message", role: "system", content: { type: "input_text", text: "System" } },
        { type: "message", role: "developer", content: { type: "input_text", text: "Developer" } },
        { type: "message", role: "user", content: { type: "input_text", text: "Question" } },
        { type: "message", role: "assistant", content: { type: "input_text", text: "Answer" } },
        { type: "function_call", call_id: "a", name: "first", arguments: "{}" },
        { type: "function_call", call_id: "b", name: "second", arguments: "{\"x\":1}" },
        { type: "function_call_output", call_id: "a", output: "result-a" },
        { type: "function_call_output", call_id: "b", output: "result-b" },
      ],
      instructions: "Instructions",
    })).toEqual({
      model: "claude-test",
      messages: [
        { role: "user", content: "Question" },
        { role: "assistant", content: "Answer" },
        { role: "assistant", content: [
          { type: "tool_use", id: "a", name: "first", input: {} },
          { type: "tool_use", id: "b", name: "second", input: { x: 1 } },
        ] },
        { role: "user", content: [
          { type: "tool_result", tool_use_id: "a", content: "result-a" },
          { type: "tool_result", tool_use_id: "b", content: "result-b" },
        ] },
      ],
      max_tokens: 4096,
      stream: true,
      system: "Instructions\nSystem\nDeveloper",
    });
  });

  it("omits an empty system prompt", () => {
    expect(new AnthropicConverter().toAPI({
      model: "claude-test",
      input: [],
    })).toEqual({
      model: "claude-test",
      messages: [],
      max_tokens: 4096,
      stream: true,
    });
  });

  it.each(["input_image", "input_file"] as const)(
    "rejects unsupported %s input",
    (type) => {
      const content = type === "input_image"
        ? { type, image_url: "https://example.test/image.png" }
        : { type, file_url: "https://example.test/file.txt" };
      expect(() => new AnthropicConverter().toAPI({
        model: "claude-test",
        input: [{ type: "message", role: "user", content }],
      })).toThrow(type);
    },
  );

  it("maps message_start", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_234_567);
    expect(new AnthropicConverter().fromEvent({
      type: "message_start",
      message: { id: "msg_1" },
    }, undefined)).toEqual({
      type: "response.created",
      response: {
        id: "msg_1",
        created_at: 1234,
        status: "in_progress",
        output: [],
      },
    });
  });

  it.each([
    [
      { type: "text_delta", text: "Hello" },
      { type: "response.message_text.delta", index: 0, delta: "Hello" },
    ],
    [
      { type: "thinking_delta", thinking: "Think" },
      { type: "response.reasoning_summary_text.delta", index: 0, delta: "Think" },
    ],
  ] as const)("maps content delta %#", (delta, expected) => {
    expect(new AnthropicConverter().fromEvent({
      type: "content_block_delta",
      index: 0,
      delta,
    }, undefined)).toEqual(expected);
  });

  it("maps tool-use starts and indexed JSON argument deltas", () => {
    const converter = new AnthropicConverter();
    expect(converter.fromEvent({
      type: "content_block_start", index: 1,
      content_block: { type: "tool_use", id: "call", name: "weather", input: {} },
    }, undefined)).toEqual({
      type: "response.function_call.added",
      function_call: { id: "call", type: "function_call", call_id: "call", name: "weather", arguments: "" },
    });
    expect(converter.fromEvent({
      type: "content_block_start", index: 0, content_block: { type: "text", text: "" },
    }, undefined)).toBeUndefined();
    expect(converter.fromEvent({
      type: "content_block_start", index: 3, content_block: { type: "thinking", thinking: "" },
    }, undefined)).toBeUndefined();
    const response = {
      id: "r", created_at: 1, status: "in_progress" as const,
      output: [
        { type: "reasoning" as const, content: { type: "reasoning_text" as const, text: "" }, summary: { type: "summary_text" as const, text: "" } },
        { id: "call", type: "function_call" as const, call_id: "call", name: "weather", arguments: "" },
      ],
    };
    expect(converter.fromEvent({
      type: "content_block_delta", index: 1,
      delta: { type: "input_json_delta", partial_json: "{}" },
    }, response)).toEqual({ type: "response.function_call_arguments.delta", delta: "{}", index: 0 });
    expect(() => converter.fromEvent({
      type: "content_block_delta", index: 0,
      delta: { type: "input_json_delta", partial_json: "{}" },
    }, undefined)).toThrow("before response.created");
    expect(converter.fromEvent({
      type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "again" },
    }, response)).toEqual({ type: "response.message_text.delta", index: 0, delta: "again" });
    expect(converter.fromEvent({
      type: "content_block_start", index: 2, content_block: { type: "tool_use" },
    }, response)).toMatchObject({ function_call: { id: "", call_id: "", name: "" } });
  });

  it("maps message_stop", () => {
    const response = {
      id: "msg_1",
      created_at: 1,
      status: "in_progress" as const,
      output: [],
    };
    expect(new AnthropicConverter().fromEvent(
      { type: "message_stop" },
      response,
    )).toEqual({ type: "response.completed", response });
    expect(() => new AnthropicConverter().fromEvent(
      { type: "message_stop" },
      undefined,
    )).toThrow("before response.created");
  });

  it("prints and skips unsupported events and delta types", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const converter = new AnthropicConverter();
    const ping = { type: "ping" };
    const signature = {
      type: "content_block_delta",
      delta: { type: "signature_delta", signature: "signature" },
    };
    expect(converter.fromEvent(ping, undefined)).toBeUndefined();
    expect(converter.fromEvent(signature, undefined)).toBeUndefined();
    expect(log).toHaveBeenNthCalledWith(1, ping);
    expect(log).toHaveBeenNthCalledWith(2, signature);
  });
});
