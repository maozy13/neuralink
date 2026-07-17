import { describe, expect, it } from "vitest";
import { ResponsesAPIConverter } from "./responses-api-converter.js";

describe("ResponsesAPIConverter", () => {
  const converter = new ResponsesAPIConverter();

  it("enables streaming", () => {
    expect(converter.toAPI({ model: "gpt-test", input: "Hello", instructions: "Brief" })).toEqual({
      model: "gpt-test", input: "Hello", instructions: "Brief", stream: true,
    });
  });

  it("normalizes response.created", () => {
    expect(converter.fromEvent({
      type: "response.created",
      sequence_number: 3,
      response: { id: "resp_1", created_at: 123, error: null, ignored: true },
    })).toEqual({
      type: "response.created",
      sequence_number: 3,
      response: { id: "resp_1", created_at: 123, error: null },
    });
  });

  it("normalizes response.output_item.added", () => {
    const item = { id: "reasoning_1", type: "reasoning" as const, content: [], summary: [] };
    expect(converter.fromEvent({
      type: "response.output_item.added",
      sequence_number: 4,
      item,
      output_index: 0,
    })).toEqual({
      type: "response.output_item.added",
      sequence_number: 4,
      item,
    });
  });

  it("normalizes response.content_part.added", () => {
    expect(converter.fromEvent({
      type: "response.content_part.added",
      sequence_number: 5,
      item_id: "msg_1",
      content_index: 0,
      part: { type: "output_text", text: "Hello", annotations: [] },
    })).toEqual({
      type: "response.content_part.added",
      sequence_number: 5,
      item_id: "msg_1",
      part: { type: "output_text", text: "Hello" },
    });
  });

  it("normalizes a refusal content part", () => {
    expect(converter.fromEvent({
      type: "response.content_part.added",
      sequence_number: 6,
      item_id: "msg_2",
      part: { type: "refusal", refusal: "Cannot help" },
    })).toEqual({
      type: "response.content_part.added",
      sequence_number: 6,
      item_id: "msg_2",
      part: { type: "refusal", refusal: "Cannot help" },
    });
  });

  it("normalizes response.output_text.delta", () => {
    expect(converter.fromEvent({
      type: "response.output_text.delta",
      sequence_number: 7,
      item_id: "msg_1",
      output_index: 0,
      content_index: 0,
      delta: " world",
    })).toEqual({
      type: "response.output_text.delta",
      sequence_number: 7,
      item_id: "msg_1",
      delta: " world",
    });
  });

  it("ignores unsupported events", () => {
    expect(converter.fromEvent({ type: "response.in_progress", sequence_number: 1 })).toBeUndefined();
  });
});
