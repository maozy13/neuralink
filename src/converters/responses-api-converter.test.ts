import { describe, expect, it, vi } from "vitest";
import { ResponsesAPIConverter } from "./responses-api-converter.js";

describe("ResponsesAPIConverter", () => {
  const converter = new ResponsesAPIConverter();

  it("enables streaming", () => {
    expect(converter.toAPI({ model: "model", input: "hello" })).toEqual({ model: "model", input: "hello", stream: true });
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
    const output = [{ type: "message" as const, role: "assistant" as const, content: { type: "output_text" as const, text: "partial" } }];
    expect(converter.fromEvent({
      type: "response.incomplete", sequence_number: 7,
      response: { id: "r", created_at: 1, status: "cancelled", output },
    })).toEqual({ type: "response.incomplete", sequence_number: 7, response: { id: "r", created_at: 1, status: "cancelled", output } });
    expect(converter.fromEvent({ type: "response.incomplete", response: { id: "r", created_at: 1 } })).toMatchObject({ sequence_number: 0 });
  });

  it.each([
    [{ type: "response.output_item.added", item: { type: "message" } }, { type: "response.message_text.delta", delta: "" }],
    [{ type: "response.output_item.added", item: { type: "reasoning" } }, { type: "response.reasoning_summary_text.delta", delta: "" }],
    [{ type: "response.content_part.added", part: { type: "output_text" } }, { type: "response.message_text.delta", delta: "" }],
    [{ type: "response.content_part.added", part: { type: "output_refusal" } }, { type: "response.message_refusal.delta", delta: "" }],
    [{ type: "response.content_part.added", part: { type: "refusal" } }, { type: "response.message_refusal.delta", delta: "" }],
    [{ type: "response.output_text.delta", delta: "hello" }, { type: "response.message_text.delta", delta: "hello" }],
    [{ type: "response.reasoning_summary_part.added", part: { type: "summary_text" } }, { type: "response.reasoning_summary_text.delta", delta: "" }],
    [{ type: "response.reasoning_summary_text.delta", delta: "think" }, { type: "response.reasoning_summary_text.delta", delta: "think" }],
  ] as const)("maps delta source event %#", (source, normalized) => {
    expect(converter.fromEvent(source)).toEqual(normalized);
  });

  it("prints and ignores unsupported events", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const source = { type: "response.in_progress", sequence_number: 1 };
    expect(converter.fromEvent(source)).toBeUndefined();
    expect(log).toHaveBeenCalledWith(source);
    log.mockRestore();
  });

  it("ignores the SSE [DONE] marker", () => {
    expect(converter.fromEvent("[DONE]")).toBeUndefined();
  });
});
