import { describe, expect, it, vi } from "vitest";
import { Connector, ResponsesAPIConverter } from "./index.js";

/**
 * Creates an SSE response from text chunks.
 * @param chunks Independently delivered stream chunks.
 * @returns A successful streaming response.
 */
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller): void {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), { status: 200 });
}

describe("Connector", () => {
  it("uses the global fetch implementation by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      'data: {"type":"response.created","sequence_number":0,"response":{"id":"r","created_at":1,"error":null}}\n\n',
    ]));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const connector = new Connector("url", "key", new ResponsesAPIConverter());
      await expect(Array.fromAsync(connector.call("model", "input"))).resolves.toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("posts parameters, yields response.created, and returns ResponseResult", async () => {
    const source = {
      type: "response.created",
      sequence_number: 0,
      response: { id: "resp_1", created_at: 123, error: null },
    };
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      `event: response.created\r\ndata: ${JSON.stringify(source)}`,
      "\r\n\r\n: keepalive\n\ndata: [DONE]",
    ]));
    const connector = new Connector("https://example.test/v1/responses", "secret", new ResponsesAPIConverter(), { fetch: fetchMock });
    const iterator = connector.call("gpt-test", "Hello", { instructions: "Brief" });

    expect(await iterator.next()).toEqual({ done: false, value: source });
    expect(await iterator.next()).toEqual({ done: true, value: { id: "resp_1", created_at: 123, output: [] } });
    expect(fetchMock).toHaveBeenCalledWith("https://example.test/v1/responses", {
      method: "POST",
      headers: {
        Authorization: "Bearer secret",
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ model: "gpt-test", input: "Hello", instructions: "Brief", stream: true }),
    });
  });

  it("yields and accumulates response.output_item.added", async () => {
    const item = { id: "msg_1", type: "message" as const, role: "assistant" as const, content: { type: "output_text" as const, text: "" } };
    const events = [
      { type: "response.created", sequence_number: 0, response: { id: "resp_1", created_at: 123, error: null } },
      { type: "response.in_progress", sequence_number: 1 },
      { type: "response.output_item.added", sequence_number: 2, item },
    ];
    const connector = new Connector("url", "key", new ResponsesAPIConverter(), {
      fetch: vi.fn().mockResolvedValue(sseResponse(events.map((event) => `data: ${JSON.stringify(event)}\n\n`))),
    });
    const iterator = connector.call("model", "input");

    expect((await iterator.next()).value).toEqual(events[0]);
    expect((await iterator.next()).value).toEqual(events[2]);
    expect(await iterator.next()).toEqual({ done: true, value: { id: "resp_1", created_at: 123, output: [item] } });
  });

  it("rejects an output item emitted before response.created", async () => {
    const item = { id: "reasoning_1", type: "reasoning", content: [], summary: [] };
    const event = { type: "response.output_item.added", sequence_number: 0, item };
    const connector = new Connector("url", "key", new ResponsesAPIConverter(), {
      fetch: vi.fn().mockResolvedValue(sseResponse([`data: ${JSON.stringify(event)}\n\n`])),
    });
    await expect(Array.fromAsync(connector.call("model", "input"))).rejects.toThrow("before response.created");
  });

  it("writes response.content_part.added into its message output item", async () => {
    const item = { id: "msg_1", type: "message", role: "assistant", content: { type: "output_text", text: "" } };
    const sourcePart = { type: "output_text", text: "Hello" };
    const part = { type: "output_text", text: "Hello" };
    const events = [
      { type: "response.created", sequence_number: 0, response: { id: "r", created_at: 1, error: null } },
      { type: "response.output_item.added", sequence_number: 1, item },
      { type: "response.content_part.added", sequence_number: 2, item_id: "msg_1", part: sourcePart },
    ];
    const connector = new Connector("url", "key", new ResponsesAPIConverter(), {
      fetch: vi.fn().mockResolvedValue(sseResponse(events.map((event) => `data: ${JSON.stringify(event)}\n\n`))),
    });
    const iterator = connector.call("model", "input");

    await iterator.next();
    await iterator.next();
    expect((await iterator.next()).value).toEqual({ ...events[2], part });
    expect(await iterator.next()).toEqual({
      done: true,
      value: { id: "r", created_at: 1, output: [{ ...item, content: part }] },
    });
  });

  it.each([
    {
      name: "before response.created",
      events: [{ type: "response.content_part.added", sequence_number: 0, item_id: "msg_1", part: { type: "output_text", text: "" } }],
      error: "before response.created",
    },
    {
      name: "for an unknown item",
      events: [
        { type: "response.created", sequence_number: 0, response: { id: "r", created_at: 1, error: null } },
        { type: "response.content_part.added", sequence_number: 1, item_id: "missing", part: { type: "output_text", text: "" } },
      ],
      error: "unknown output item missing",
    },
    {
      name: "for a non-message item",
      events: [
        { type: "response.created", sequence_number: 0, response: { id: "r", created_at: 1, error: null } },
        { type: "response.output_item.added", sequence_number: 1, item: { id: "rs_1", type: "reasoning", content: [], summary: [] } },
        { type: "response.content_part.added", sequence_number: 2, item_id: "rs_1", part: { type: "output_text", text: "" } },
      ],
      error: "non-message output item rs_1",
    },
  ])("rejects content emitted $name", async ({ events, error }) => {
    const connector = new Connector("url", "key", new ResponsesAPIConverter(), {
      fetch: vi.fn().mockResolvedValue(sseResponse(events.map((event) => `data: ${JSON.stringify(event)}\n\n`))),
    });
    await expect(Array.fromAsync(connector.call("model", "input"))).rejects.toThrow(error);
  });

  it("appends response.output_text.delta to its message text", async () => {
    const events = [
      { type: "response.created", sequence_number: 0, response: { id: "r", created_at: 1, error: null } },
      { type: "response.output_item.added", sequence_number: 1, item: { id: "msg_1", type: "message", role: "assistant", content: { type: "output_text", text: "" } } },
      { type: "response.content_part.added", sequence_number: 2, item_id: "msg_1", part: { type: "output_text", text: "Hello" } },
      { type: "response.output_text.delta", sequence_number: 3, item_id: "msg_1", delta: " world" },
    ];
    const connector = new Connector("url", "key", new ResponsesAPIConverter(), {
      fetch: vi.fn().mockResolvedValue(sseResponse(events.map((event) => `data: ${JSON.stringify(event)}\n\n`))),
    });
    const iterator = connector.call("model", "input");

    await iterator.next();
    await iterator.next();
    await iterator.next();
    expect((await iterator.next()).value).toEqual(events[3]);
    expect(await iterator.next()).toEqual({
      done: true,
      value: {
        id: "r",
        created_at: 1,
        output: [{ id: "msg_1", type: "message", role: "assistant", content: { type: "output_text", text: "Hello world" } }],
      },
    });
  });

  it.each([
    {
      name: "before response.created",
      events: [{ type: "response.output_text.delta", sequence_number: 0, item_id: "msg_1", delta: "x" }],
      error: "before response.created",
    },
    {
      name: "for an unknown item",
      events: [
        { type: "response.created", sequence_number: 0, response: { id: "r", created_at: 1, error: null } },
        { type: "response.output_text.delta", sequence_number: 1, item_id: "missing", delta: "x" },
      ],
      error: "unknown output item missing",
    },
    {
      name: "for a non-message item",
      events: [
        { type: "response.created", sequence_number: 0, response: { id: "r", created_at: 1, error: null } },
        { type: "response.output_item.added", sequence_number: 1, item: { id: "rs_1", type: "reasoning", content: [], summary: [] } },
        { type: "response.output_text.delta", sequence_number: 2, item_id: "rs_1", delta: "x" },
      ],
      error: "non-message output item rs_1",
    },
    {
      name: "for a refusal item",
      events: [
        { type: "response.created", sequence_number: 0, response: { id: "r", created_at: 1, error: null } },
        { type: "response.output_item.added", sequence_number: 1, item: { id: "msg_1", type: "message", role: "assistant", content: { type: "refusal", refusal: "No" } } },
        { type: "response.output_text.delta", sequence_number: 2, item_id: "msg_1", delta: "x" },
      ],
      error: "refusal output item msg_1",
    },
  ])("rejects an output-text delta emitted $name", async ({ events, error }) => {
    const connector = new Connector("url", "key", new ResponsesAPIConverter(), {
      fetch: vi.fn().mockResolvedValue(sseResponse(events.map((event) => `data: ${JSON.stringify(event)}\n\n`))),
    });
    await expect(Array.fromAsync(connector.call("model", "input"))).rejects.toThrow(error);
  });

  it("adds and updates reasoning summary text", async () => {
    const events = [
      { type: "response.created", sequence_number: 0, response: { id: "r", created_at: 1, status: "in_progress" } },
      { type: "response.output_item.added", sequence_number: 1, item: { id: "rs_1", type: "reasoning", status: "in_progress" } },
      { type: "response.reasoning_summary_part.added", sequence_number: 2, item_id: "rs_1", part: { type: "summary_text", text: "" } },
      { type: "response.reasoning_summary_text.delta", sequence_number: 3, item_id: "rs_1", delta: "Thinking" },
      { type: "response.reasoning_summary_text.delta", sequence_number: 4, item_id: "rs_1", delta: " done" },
    ];
    const connector = new Connector("url", "key", new ResponsesAPIConverter(), {
      fetch: vi.fn().mockResolvedValue(sseResponse(events.map((event) => `data: ${JSON.stringify(event)}\n\n`))),
    });
    const iterator = connector.call("model", "input");

    for (let index = 0; index < events.length; index += 1) await iterator.next();
    expect(await iterator.next()).toEqual({
      done: true,
      value: {
        id: "r",
        created_at: 1,
        status: "in_progress",
        output: [{ id: "rs_1", type: "reasoning", content: [], summary: [{ type: "summary_text", text: "Thinking done" }] }],
      },
    });
  });

  it.each([
    ["part before response.created", [{ type: "response.reasoning_summary_part.added", sequence_number: 0, item_id: "rs_1", part: { type: "summary_text", text: "" } }], "before response.created"],
    ["part for an unknown item", [{ type: "response.created", sequence_number: 0, response: { id: "r", created_at: 1, error: null } }, { type: "response.reasoning_summary_part.added", sequence_number: 1, item_id: "missing", part: { type: "summary_text", text: "" } }], "unknown output item missing"],
    ["part for a message", [{ type: "response.created", sequence_number: 0, response: { id: "r", created_at: 1, error: null } }, { type: "response.output_item.added", sequence_number: 1, item: { id: "msg_1", type: "message", role: "assistant", content: { type: "output_text", text: "" } } }, { type: "response.reasoning_summary_part.added", sequence_number: 2, item_id: "msg_1", part: { type: "summary_text", text: "" } }], "non-reasoning output item msg_1"],
    ["delta before response.created", [{ type: "response.reasoning_summary_text.delta", sequence_number: 0, item_id: "rs_1", delta: "x" }], "before response.created"],
    ["delta for an unknown item", [{ type: "response.created", sequence_number: 0, response: { id: "r", created_at: 1, error: null } }, { type: "response.reasoning_summary_text.delta", sequence_number: 1, item_id: "missing", delta: "x" }], "unknown output item missing"],
    ["delta for a message", [{ type: "response.created", sequence_number: 0, response: { id: "r", created_at: 1, error: null } }, { type: "response.output_item.added", sequence_number: 1, item: { id: "msg_1", type: "message", role: "assistant", content: { type: "output_text", text: "" } } }, { type: "response.reasoning_summary_text.delta", sequence_number: 2, item_id: "msg_1", delta: "x" }], "non-reasoning output item msg_1"],
    ["delta before a summary part", [{ type: "response.created", sequence_number: 0, response: { id: "r", created_at: 1, error: null } }, { type: "response.output_item.added", sequence_number: 1, item: { id: "rs_1", type: "reasoning", content: [], summary: [] } }, { type: "response.reasoning_summary_text.delta", sequence_number: 2, item_id: "rs_1", delta: "x" }], "before a summary part"],
  ])("rejects a reasoning-summary %s", async (_name, events, error) => {
    const connector = new Connector("url", "key", new ResponsesAPIConverter(), {
      fetch: vi.fn().mockResolvedValue(sseResponse(events.map((event) => `data: ${JSON.stringify(event)}\n\n`))),
    });
    await expect(Array.fromAsync(connector.call("model", "input"))).rejects.toThrow(error);
  });

  it("joins multiline data fields and uses default options", async () => {
    const connector = new Connector("url", "key", new ResponsesAPIConverter(), {
      fetch: vi.fn().mockResolvedValue(sseResponse([
        "data:{\"type\":\"response.created\",\n",
        "data: \"sequence_number\":1,\"response\":{\"id\":\"r\",\"created_at\":1,\"error\":null}}\n\n",
      ])),
    });
    await expect(Array.fromAsync(connector.call("model", []))).resolves.toHaveLength(1);
  });

  it("rejects unsuccessful responses", async () => {
    const connector = new Connector("url", "key", new ResponsesAPIConverter(), {
      fetch: vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    });
    await expect(Array.fromAsync(connector.call("model", "input"))).rejects.toThrow("status 401");
  });

  it("rejects responses without a body", async () => {
    const connector = new Connector("url", "key", new ResponsesAPIConverter(), {
      fetch: vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    });
    await expect(Array.fromAsync(connector.call("model", "input"))).rejects.toThrow("did not include a body");
  });

  it("rejects streams without a supported event", async () => {
    const connector = new Connector("url", "key", new ResponsesAPIConverter(), {
      fetch: vi.fn().mockResolvedValue(sseResponse([": keepalive\n\ndata: [DONE]\n\n"])),
    });
    await expect(Array.fromAsync(connector.call("model", "input"))).rejects.toThrow("supported event");
  });
});
