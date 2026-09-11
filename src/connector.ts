import type { Converter, InputItem, Optional, Response, ResponseEvent } from "./typings/index.js";

/** Handles one normalized event type and returns the updated response result. */
type ResponseEventHandler<EventType extends ResponseEvent["type"]> = (
  event: Extract<ResponseEvent, { type: EventType }>,
  result: Response | undefined,
) => Response;

/** Maps every supported event type to its response-result update handler. */
type ResponseEventHandlerMap = {
  [EventType in ResponseEvent["type"]]: ResponseEventHandler<EventType>;
};

const responseEventHandlers = {
  "response.created": (event) => event.response,
  "response.completed": (_event, result) => {
    const response = requireResponse(result, "response.completed");
    response.status = "completed";
    return response;
  },
  "response.failed": (event) => event.response,
  "response.incomplete": (_event, result) => requireResponse(result, "response.incomplete"),
  "response.message_text.delta": (event, result) => {
    if (result === undefined) {
      throw new Error("Model API emitted a message-text delta before response.created");
    }
    const item = result.output
      .filter((outputItem) => outputItem.type === "message" && outputItem.content.type === "output_text")[event.index];
    const content = item?.type === "message" && item.content.type === "output_text" ? item.content : undefined;
    if (content === undefined) {
      requireNextIndex(event.index, result.output.filter(
        (outputItem) => outputItem.type === "message" && outputItem.content.type === "output_text",
      ).length, event.type);
      result.output.push({ type: "message", role: "assistant", content: { type: "output_text", text: event.delta } });
      return result;
    }
    content.text += event.delta;
    return result;
  },
  "response.message_refusal.delta": (event, result) => {
    if (result === undefined) {
      throw new Error("Model API emitted a message-refusal delta before response.created");
    }
    const item = result.output
      .filter((outputItem) => outputItem.type === "message" && outputItem.content.type === "refusal")[event.index];
    const content = item?.type === "message" && item.content.type === "refusal" ? item.content : undefined;
    if (content === undefined) {
      requireNextIndex(event.index, result.output.filter(
        (outputItem) => outputItem.type === "message" && outputItem.content.type === "refusal",
      ).length, event.type);
      result.output.push({ type: "message", role: "assistant", content: { type: "refusal", refusal: event.delta } });
      return result;
    }
    content.refusal += event.delta;
    return result;
  },
  "response.reasoning_text.delta": (event, result) => {
    const response = requireResponse(result, "response.reasoning_text.delta");
    const item = response.output.filter((outputItem) => outputItem.type === "reasoning")[event.index];
    if (item === undefined) {
      requireNextIndex(
        event.index,
        response.output.filter((outputItem) => outputItem.type === "reasoning").length,
        event.type,
      );
      response.output.push({
        type: "reasoning",
        content: { type: "reasoning_text", text: event.delta },
        summary: { type: "summary_text", text: "" },
      });
      return response;
    }
    item.content.text += event.delta;
    return response;
  },
  "response.reasoning_summary_text.delta": (event, result) => {
    if (result === undefined) {
      throw new Error("Model API emitted a reasoning-summary delta before response.created");
    }
    const item = result.output.filter((outputItem) => outputItem.type === "reasoning")[event.index];
    if (item === undefined) {
      requireNextIndex(
        event.index,
        result.output.filter((outputItem) => outputItem.type === "reasoning").length,
        event.type,
      );
      result.output.push({
        type: "reasoning",
        content: { type: "reasoning_text", text: "" },
        summary: { type: "summary_text", text: event.delta },
      });
      return result;
    }
    item.summary.text += event.delta;
    return result;
  },
  "response.function_call.added": (event, result) => {
    const response = requireResponse(result, "response.function_call.added");
    response.output.push(event.function_call);
    return response;
  },
  "response.function_call_arguments.delta": (event, result) => {
    const response = requireResponse(result, "response.function_call_arguments.delta");
    const item = response.output.filter((outputItem) => outputItem.type === "function_call")[event.index];
    if (item === undefined) {
      throw new Error(`Model API emitted arguments for unknown function call index ${event.index}`);
    }
    item.arguments += event.delta;
    return response;
  },
  "response.custom_tool_call.added": (event, result) => {
    const response = requireResponse(result, "response.custom_tool_call.added");
    response.output.push(event.custom_tool_call);
    return response;
  },
  "response.custom_tool_call_input.delta": (event, result) => {
    const response = requireResponse(result, "response.custom_tool_call_input.delta");
    const item = response.output.filter((outputItem) => outputItem.type === "custom_tool_call")[event.index];
    if (item === undefined) {
      throw new Error(`Model API emitted input for unknown custom tool call index ${event.index}`);
    }
    item.input += event.delta;
    return response;
  },
} satisfies ResponseEventHandlerMap;

/**
 * Requires an accumulated response for a terminal lifecycle event.
 * @param response Response accumulated before the event.
 * @param type Lifecycle event type used in the error message.
 * @returns The accumulated response.
 */
function requireResponse(response: Response | undefined, type: string): Response {
  if (response === undefined) throw new Error(`Model API emitted ${type} before response.created`);
  return response;
}

/**
 * Requires a new same-type output item to use the next contiguous index.
 * @param index Requested normalized output index.
 * @param length Current number of same-type output items.
 * @param type Event type used in the error message.
 */
function requireNextIndex(index: number, length: number, type: string): void {
  if (index !== length) throw new Error(`Model API emitted ${type} for unknown index ${index}`);
}

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
  ): AsyncGenerator<ResponseEvent, Response> {
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

    let result: Response | undefined;
    for await (const data of parseServerSentEvents(response.body)) {
      const sourceEvent = data === "[DONE]" ? data as SourceEvent : JSON.parse(data) as SourceEvent;
      const converted = this.converter.fromEvent(sourceEvent, result);
      if (converted === undefined) continue;
      const events = Array.isArray(converted) ? converted : [converted];
      for (const event of events) {
        result = updateResponse(event, result);
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
function updateResponse(event: ResponseEvent, result: Response | undefined): Response {
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
