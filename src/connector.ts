import type { Converter, InputItem, Optional, ResponseEvent, ResponseResult } from "./typings/index.js";

/** Handles one normalized event type and returns the updated response result. */
type ResponseEventHandler<EventType extends ResponseEvent["type"]> = (
  event: Extract<ResponseEvent, { type: EventType }>,
  result: ResponseResult | undefined,
) => ResponseResult;

/** Maps every supported event type to its response-result update handler. */
type ResponseEventHandlerMap = {
  [EventType in ResponseEvent["type"]]: ResponseEventHandler<EventType>;
};

const responseEventHandlers = {
  "response.created": (event) => ({
    id: event.response.id,
    created_at: event.response.created_at,
    status: event.response.status,
    output: [],
  }),
  "response.output_item.added": (event, result) => {
    if (result === undefined) {
      throw new Error("Model API emitted an output item before response.created");
    }
    result.output.push(event.item);
    return result;
  },
  "response.content_part.added": (event, result) => {
    if (result === undefined) {
      throw new Error("Model API emitted a content part before response.created");
    }
    const item = result.output.find((outputItem) => outputItem.type === "message")
      ?? result.output[0];
    if (item === undefined) {
      throw new Error(`Model API emitted content for unknown output item ${event.item_id}`);
    }
    if (item.type !== "message") {
      throw new Error(`Model API emitted message content for non-message output item ${event.item_id}`);
    }
    item.content = event.part;
    return result;
  },
  "response.output_text.delta": (event, result) => {
    if (result === undefined) {
      throw new Error("Model API emitted an output-text delta before response.created");
    }
    const item = result.output.find((outputItem) => outputItem.type === "message")
      ?? result.output[0];
    if (item === undefined) {
      throw new Error(`Model API emitted an output-text delta for unknown output item ${event.item_id}`);
    }
    if (item.type !== "message") {
      throw new Error(`Model API emitted an output-text delta for non-message output item ${event.item_id}`);
    }
    if (item.content.type !== "output_text") {
      throw new Error(`Model API emitted an output-text delta for refusal output item ${event.item_id}`);
    }
    item.content.text += event.delta;
    return result;
  },
  "response.reasoning_summary_part.added": (event, result) => {
    if (result === undefined) {
      throw new Error("Model API emitted a reasoning-summary part before response.created");
    }
    const item = result.output.find((outputItem) => outputItem.type === "reasoning")
      ?? result.output[0];
    if (item === undefined) {
      throw new Error(`Model API emitted a reasoning-summary part for unknown output item ${event.item_id}`);
    }
    if (item.type !== "reasoning") {
      throw new Error(`Model API emitted a reasoning-summary part for non-reasoning output item ${event.item_id}`);
    }
    item.summary.push(event.part);
    return result;
  },
  "response.reasoning_summary_text.delta": (event, result) => {
    if (result === undefined) {
      throw new Error("Model API emitted a reasoning-summary delta before response.created");
    }
    const item = result.output.find((outputItem) => outputItem.type === "reasoning")
      ?? result.output[0];
    if (item === undefined) {
      throw new Error(`Model API emitted a reasoning-summary delta for unknown output item ${event.item_id}`);
    }
    if (item.type !== "reasoning") {
      throw new Error(`Model API emitted a reasoning-summary delta for non-reasoning output item ${event.item_id}`);
    }
    const summary = item.summary.at(-1);
    if (summary === undefined) {
      throw new Error(`Model API emitted a reasoning-summary delta before a summary part for output item ${event.item_id}`);
    }
    summary.text += event.delta;
    return result;
  },
} satisfies ResponseEventHandlerMap;

/** Runtime dependencies accepted by Connector. */
export interface ConnectorOptions { fetch?: typeof fetch }
/** Connects NeuralLink calls to a streaming model API. */
export class Connector<RequestParams, SourceEvent> {
  public readonly baseUrl: string;
  public readonly apiKey: string;
  public readonly converter: Converter<RequestParams, SourceEvent>;
  private readonly fetchImplementation: typeof fetch;

  /**
   * Creates a model API connector.
   * @param baseUrl Complete model API endpoint URL.
   * @param apiKey API key sent as a bearer token.
   * @param converter Provider-specific converter.
   * @param options Optional runtime dependencies.
   */
  public constructor(
    baseUrl: string,
    apiKey: string,
    converter: Converter<RequestParams, SourceEvent>,
    options: ConnectorOptions = {},
  ) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.converter = converter;
    this.fetchImplementation = options.fetch ?? fetch;
  }

  /**
   * Calls the model API and yields normalized streaming events.
   * @param model Provider model identifier.
   * @param input Plain text or structured model input.
   * @param optional Optional model parameters.
   * @returns An event generator returning the accumulated result.
   */
  public async *call(
    model: string,
    input: string | InputItem[],
    optional: Optional = {},
  ): AsyncGenerator<ResponseEvent, ResponseResult> {
    const response = await this.fetchImplementation(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(this.converter.toAPI({ model, input, ...optional })),
    });
    if (!response.ok) throw new Error(`Model API request failed with status ${response.status}`);
    if (response.body === null) throw new Error("Model API response did not include a body");

    let result: ResponseResult | undefined;
    for await (const data of parseServerSentEvents(response.body)) {
      if (data === "[DONE]") continue;
      const converted = this.converter.fromEvent(JSON.parse(data) as SourceEvent, result);
      if (converted === undefined) continue;
      const events = Array.isArray(converted) ? converted : [converted];
      for (const event of events) {
        result = updateResponseResult(event, result);
        yield event;
      }
    }
    if (result === undefined) throw new Error("Model API response did not include a supported event");
    return result;
  }
}

/**
 * Dispatches an event to the handler registered for its type.
 * @param event The normalized response event to process.
 * @param result The response result accumulated before this event.
 * @returns The response result after applying the mapped handler.
 */
function updateResponseResult(event: ResponseEvent, result: ResponseResult | undefined): ResponseResult {
  const handler = responseEventHandlers[event.type] as ResponseEventHandler<ResponseEvent["type"]>;
  return handler(event, result);
}

/**
 * Extracts data payloads from an SSE byte stream.
 * @param body Streaming HTTP response body.
 * @returns Complete SSE data payloads.
 */
async function* parseServerSentEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (done) break;
      const blocks = buffer.replaceAll("\r\n", "\n").split("\n\n");
      // String.split() always produces at least one element.
      buffer = blocks.pop()!;
      for (const block of blocks) {
        const data = readData(block);
        if (data !== undefined) yield data;
      }
    }
    const data = readData(buffer.replaceAll("\r\n", "\n"));
    if (data !== undefined) yield data;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Reads data fields from one SSE block.
 * @param block Complete SSE event block.
 * @returns Joined data, or undefined when absent.
 */
function readData(block: string): string | undefined {
  const lines = block
    .split("\n")
    .filter((line) => line === "data" || line.startsWith("data:"))
    .map((line) => line.slice(line.indexOf(":") + 1).replace(/^ /, ""));
  return lines.length === 0 ? undefined : lines.join("\n");
}
