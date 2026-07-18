import { describe, expect, it, vi } from "vitest";
import { Connector, ResponsesAPIConverter } from "./index.js";

/**
 * Creates a streaming HTTP response.
 * @param chunks Independently delivered SSE chunks.
 * @param status HTTP response status.
 * @returns Mock streaming response.
 */
function sse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller): void {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), { status });
}

/**
 * Serializes source events as SSE data blocks.
 * @param events Source events to serialize.
 * @returns Complete SSE payload.
 */
function blocks(events: object[]): string {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
}

describe("Connector", () => {
  it("posts, yields normalized events, and accumulates all delta kinds", async () => {
    const source = [
      { type: "response.created", response: { id: "r", created_at: 1, status: "in_progress" } },
      { type: "response.output_item.added", item: { type: "reasoning" } },
      { type: "response.reasoning_summary_text.delta", delta: "think" },
      { type: "response.output_item.added", item: { type: "message" } },
      { type: "response.output_text.delta", delta: "hello" },
      { type: "response.completed", response: { id: "r", created_at: 1, status: "completed", output: [] } },
    ];
    const fetchMock = vi.fn().mockResolvedValue(sse([blocks(source), "data: [DONE]\n\n"]));
    const iterator = new Connector("url", "key", new ResponsesAPIConverter(), { fetch: fetchMock }).call("m", "input");
    const yielded = [];
    let next = await iterator.next();
    while (!next.done) {
      yielded.push(next.value);
      next = await iterator.next();
    }
    expect(yielded).toHaveLength(6);
    expect(next.value).toEqual({
      id: "r", created_at: 1, status: "completed",
      output: [
        { type: "reasoning", content: { type: "reasoning_text", text: "" }, summary: { type: "summary_text", text: "think" } },
        { type: "message", role: "assistant", content: { type: "output_text", text: "hello" } },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith("url", expect.objectContaining({
      method: "POST", body: JSON.stringify({ model: "m", input: "input", stream: true }),
    }));
  });

  it("appends repeated deltas and handles refusal and failed replacement", async () => {
    const failed = { id: "r", created_at: 1, status: "failed" as const, output: [] };
    const source = [
      { type: "response.created", response: { id: "r", created_at: 1 } },
      { type: "response.content_part.added", part: { type: "output_refusal" } },
      { type: "response.content_part.added", part: { type: "refusal" } },
      { type: "response.failed", response: failed },
    ];
    const iterator = new Connector("url", "key", new ResponsesAPIConverter(), { fetch: vi.fn().mockResolvedValue(sse([blocks(source)])) }).call("m", []);
    for (let index = 0; index < source.length; index += 1) await iterator.next();
    expect((await iterator.next()).value).toEqual(failed);
  });

  it("preserves the accumulated response for incomplete", async () => {
    const source = [
      { type: "response.created", response: { id: "r", created_at: 1 } },
      { type: "response.incomplete", sequence_number: 2, response: { id: "r", created_at: 1 } },
    ];
    const values = await Array.fromAsync(new Connector("url", "key", new ResponsesAPIConverter(), { fetch: vi.fn().mockResolvedValue(sse([blocks(source)])) }).call("m", "x"));
    expect(values).toHaveLength(2);
  });

  it.each([
    [{ type: "response.output_text.delta", delta: "x" }, "message-text delta"],
    [{ type: "response.content_part.added", part: { type: "refusal" } }, "message-refusal delta"],
    [{ type: "response.reasoning_summary_text.delta", delta: "x" }, "reasoning-summary delta"],
    [{ type: "response.completed", response: { id: "r", created_at: 1 } }, "response.completed"],
    [{ type: "response.incomplete", response: { id: "r", created_at: 1 } }, "response.incomplete"],
  ])("rejects %j before creation", async (event, message) => {
    const call = new Connector("url", "key", new ResponsesAPIConverter(), { fetch: vi.fn().mockResolvedValue(sse([blocks([event])])) }).call("m", "x");
    await expect(Array.fromAsync(call)).rejects.toThrow(message);
  });

  it("rejects mixed text and refusal deltas", async () => {
    const prefix = { type: "response.created", response: { id: "r", created_at: 1 } };
    for (const events of [
      [prefix, { type: "response.output_text.delta", delta: "x" }, { type: "response.content_part.added", part: { type: "refusal" } }],
      [prefix, { type: "response.content_part.added", part: { type: "refusal" } }, { type: "response.output_text.delta", delta: "x" }],
    ]) {
      const call = new Connector("url", "key", new ResponsesAPIConverter(), { fetch: vi.fn().mockResolvedValue(sse([blocks(events)])) }).call("m", "x");
      await expect(Array.fromAsync(call)).rejects.toThrow("mixed");
    }
  });

  it("parses split, CRLF, multiline and final SSE blocks", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sse([
      ": keepalive\r\n\r\ndata:{\"type\":\"response.created\",\r\n",
      "data: \"response\":{\"id\":\"r\",\"created_at\":1}}",
    ]));
    await expect(Array.fromAsync(new Connector("url", "key", new ResponsesAPIConverter(), { fetch: fetchMock }).call("m", "x"))).resolves.toHaveLength(1);
  });

  it("uses global fetch and validates HTTP responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sse([blocks([{ type: "response.created", response: { id: "r", created_at: 1 } }])])));
    await expect(Array.fromAsync(new Connector("url", "key", new ResponsesAPIConverter()).call("m", "x"))).resolves.toHaveLength(1);
    vi.unstubAllGlobals();
    await expect(Array.fromAsync(new Connector("url", "key", new ResponsesAPIConverter(), { fetch: vi.fn().mockResolvedValue(sse([], 401)) }).call("m", "x"))).rejects.toThrow("401");
    await expect(Array.fromAsync(new Connector("url", "key", new ResponsesAPIConverter(), { fetch: vi.fn().mockResolvedValue(new Response(null, { status: 204 })) }).call("m", "x"))).rejects.toThrow("body");
    await expect(Array.fromAsync(new Connector("url", "key", new ResponsesAPIConverter(), { fetch: vi.fn().mockResolvedValue(sse([": ping\n\ndata: [DONE]\n\n"])) }).call("m", "x"))).rejects.toThrow("supported event");
  });
});
