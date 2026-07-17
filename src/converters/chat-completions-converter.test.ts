import { describe, expect, it } from "vitest";
import type { ResponseResult } from "../typings/index.js";
import { ChatCompletionsConverter, type ChatCompletionsSourceEvent } from "./chat-completions-converter.js";

/**
 * Creates a minimal Chat Completions streaming chunk.
 * @param delta Choice delta content.
 * @param id Response identifier.
 * @returns A provider streaming event.
 */
function chunk(delta: ChatCompletionsSourceEvent["choices"][number]["delta"], id = "chat_1"): ChatCompletionsSourceEvent {
  return { id, created: 123, choices: [{ index: 0, delta }] };
}

/** Creates an empty accumulated response for converter tests. */
function result(): ResponseResult {
  return { id: "chat_1", created_at: 123, status: "in_progress", output: [] };
}

describe("ChatCompletionsConverter", () => {
  it("converts plain text and instructions to messages", () => {
    expect(new ChatCompletionsConverter().toAPI({ model: "model", input: "Hello", instructions: "Be brief" })).toEqual({
      model: "model",
      messages: [{ role: "system", content: "Be brief" }, { role: "user", content: "Hello" }],
      stream: true,
    });
  });

  it("converts text message items and skips non-message items", () => {
    expect(new ChatCompletionsConverter().toAPI({
      model: "model",
      input: [
        { type: "message", role: "assistant", content: { type: "input_text", text: "Hi" } },
        { type: "function_call_output", call_id: "call_1", output: "done" },
      ],
    }).messages).toEqual([{ role: "assistant", content: "Hi" }]);
  });

  it.each(["input_image", "input_file"] as const)("rejects unsupported %s input", (type) => {
    const content = type === "input_image"
      ? { type, image_url: "https://example.test/image.png" }
      : { type, file_url: "https://example.test/file.txt" };
    expect(() => new ChatCompletionsConverter().toAPI({
      model: "model",
      input: [{ type: "message", role: "user", content }],
    })).toThrow(type);
  });

  it("emits response.created for the first chunk and a new response id", () => {
    const converter = new ChatCompletionsConverter();
    expect(converter.fromEvent(chunk({ role: "assistant" }), undefined)).toEqual([{
      type: "response.created",
      sequence_number: 0,
      response: { id: "chat_1", created_at: 123, status: "in_progress", error: null },
    }]);
    expect(converter.fromEvent(chunk({ role: "assistant" }, "chat_2"), result())).toEqual([expect.objectContaining({ type: "response.created" })]);
  });

  it("emits reasoning output and subsequent summary delta", () => {
    const converter = new ChatCompletionsConverter();
    converter.fromEvent(chunk({ role: "assistant" }), undefined);
    const current = result();
    const added = converter.fromEvent(chunk({ reasoning_content: "Think" }), current);
    expect(added).toEqual([
      {
        type: "response.output_item.added",
        sequence_number: 1,
        item: { type: "reasoning", content: [], summary: [] },
      },
      {
        type: "response.reasoning_summary_part.added",
        sequence_number: 2,
        part: { type: "summary_text", text: "Think" },
      },
    ]);
    current.output.push({ id: "chat_1", type: "reasoning", content: [], summary: [{ type: "summary_text", text: "Think" }] });
    expect(converter.fromEvent(chunk({ reasoning_content: " more" }), current)).toEqual([{
      type: "response.reasoning_summary_text.delta",
      sequence_number: 3,
      delta: " more",
    }]);
    expect(converter.fromEvent(chunk({ reasoning_content: " again" }), current)).toEqual([{
      type: "response.reasoning_summary_text.delta",
      sequence_number: 4,
      delta: " again",
    }]);
  });

  it("emits message output and subsequent text delta", () => {
    const converter = new ChatCompletionsConverter();
    converter.fromEvent(chunk({ role: "assistant" }), undefined);
    const current = result();
    const added = converter.fromEvent(chunk({ content: "Hello" }), current);
    expect(added).toEqual([
      {
        type: "response.output_item.added",
        sequence_number: 1,
        item: { type: "message", role: "assistant", content: { type: "output_text", text: "" } },
      },
      {
        type: "response.content_part.added",
        sequence_number: 2,
        part: { type: "output_text", text: "Hello" },
      },
    ]);
    current.output.push({ id: "chat_1", type: "message", role: "assistant", content: { type: "output_text", text: "Hello" } });
    expect(converter.fromEvent(chunk({ content: " world" }), current)).toEqual([{
      type: "response.output_text.delta",
      sequence_number: 3,
      delta: " world",
    }]);
    expect(converter.fromEvent(chunk({ content: "!" }), current)).toEqual([{
      type: "response.output_text.delta",
      sequence_number: 4,
      delta: "!",
    }]);
  });

  it("emits part events for existing empty reasoning and message items", () => {
    const converter = new ChatCompletionsConverter();
    converter.fromEvent(chunk({}), undefined);
    const current = result();
    current.output.push(
      { id: "rs", type: "reasoning", content: [], summary: [] },
      { id: "msg", type: "message", role: "assistant", content: { type: "output_text", text: "" } },
    );
    expect(converter.fromEvent(chunk({ reasoning_content: "Think" }), current)).toEqual([{
      type: "response.reasoning_summary_part.added",
      sequence_number: 1,
      part: { type: "summary_text", text: "Think" },
    }]);
    expect(converter.fromEvent(chunk({ content: "Hello" }), current)).toEqual([{
      type: "response.content_part.added",
      sequence_number: 2,
      part: { type: "output_text", text: "Hello" },
    }]);
  });

  it("ignores empty choice deltas and missing choices", () => {
    const converter = new ChatCompletionsConverter();
    converter.fromEvent(chunk({}), undefined);
    expect(converter.fromEvent(chunk({}), result())).toBeUndefined();
    expect(converter.fromEvent({ id: "chat_1", created: 123, choices: [] }, result())).toBeUndefined();
  });
});
