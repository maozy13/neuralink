import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicConverter } from "./anthropic-converter.js";

describe("AnthropicConverter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("converts text input and instructions", () => {
    expect(new AnthropicConverter().toAPI({
      model: "claude-test",
      input: "Hello",
      instructions: "Be concise",
    })).toEqual({
      model: "claude-test",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 4096,
      stream: true,
      system: "Be concise",
    });
  });

  it("converts structured messages and skips function items", () => {
    expect(new AnthropicConverter().toAPI({
      model: "claude-test",
      input: [
        { type: "message", role: "system", content: { type: "input_text", text: "System" } },
        { type: "message", role: "developer", content: { type: "input_text", text: "Developer" } },
        { type: "message", role: "user", content: { type: "input_text", text: "Question" } },
        { type: "message", role: "assistant", content: { type: "input_text", text: "Answer" } },
        { type: "function_call_output", call_id: "call", output: "result" },
      ],
      instructions: "Instructions",
    })).toEqual({
      model: "claude-test",
      messages: [
        { role: "user", content: "Question" },
        { role: "assistant", content: "Answer" },
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
      { type: "response.message_text.delta", delta: "Hello" },
    ],
    [
      { type: "thinking_delta", thinking: "Think" },
      { type: "response.reasoning_summary_text.delta", delta: "Think" },
    ],
  ] as const)("maps content delta %#", (delta, expected) => {
    expect(new AnthropicConverter().fromEvent({
      type: "content_block_delta",
      index: 0,
      delta,
    }, undefined)).toEqual(expected);
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
