import type {
  Converter,
  InputItem,
  NormalizedParams,
  Response,
  ResponseEvent,
} from "../typings/index.js";

/** A message accepted by an Anthropic-compatible endpoint. */
export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

/** Request body accepted by an Anthropic-compatible endpoint. */
export interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  stream: true;
  system?: string;
}

/** A JSON event emitted by an Anthropic-compatible endpoint. */
export interface AnthropicSourceEvent {
  type: string;
  [key: string]: unknown;
}

/** Anthropic message metadata supplied by a message_start event. */
interface AnthropicMessageStartEvent extends AnthropicSourceEvent {
  type: "message_start";
  message: {
    id: string;
    [key: string]: unknown;
  };
}

/** An incremental Anthropic content block event. */
interface AnthropicContentBlockDeltaEvent extends AnthropicSourceEvent {
  type: "content_block_delta";
  delta:
    | { type: "text_delta"; text: string; [key: string]: unknown }
    | { type: "thinking_delta"; thinking: string; [key: string]: unknown }
    | { type: string; [key: string]: unknown };
}

/** Converts requests and stream events for Anthropic-compatible endpoints. */
export class AnthropicConverter
  implements Converter<AnthropicRequest, AnthropicSourceEvent>
{
  /** Maximum output tokens used by the minimal normalized request. */
  private static readonly DEFAULT_MAX_TOKENS = 4096;

  /**
   * Converts provider-neutral parameters to an Anthropic streaming request.
   * @param params Provider-neutral model parameters.
   * @returns An Anthropic-compatible request body.
   */
  public toAPI(params: NormalizedParams): AnthropicRequest {
    const { messages, systemMessages } = this.toMessages(params.input);
    const system = [params.instructions, ...systemMessages]
      .filter((value): value is string => value !== undefined)
      .join("\n");
    const request: AnthropicRequest = {
      model: params.model,
      messages,
      max_tokens: AnthropicConverter.DEFAULT_MAX_TOKENS,
      stream: true,
    };
    if (system.length > 0) request.system = system;
    return request;
  }

  /**
   * Converts an Anthropic source event to a normalized response event.
   * @param event Provider-specific streaming event.
   * @param response Response accumulated before this event.
   * @returns A normalized event, or undefined when unsupported.
   */
  public fromEvent(
    event: AnthropicSourceEvent,
    response: Response | undefined,
  ): ResponseEvent | undefined {
    if (event.type === "message_start") {
      const startEvent = event as AnthropicMessageStartEvent;
      return {
        type: "response.created",
        response: {
          id: startEvent.message.id,
          created_at: Math.floor(Date.now() / 1000),
          status: "in_progress",
          output: [],
        },
      };
    }
    if (event.type === "content_block_delta") {
      return this.fromContentBlockDelta(event as AnthropicContentBlockDeltaEvent);
    }
    if (event.type === "message_stop") {
      if (response === undefined) {
        throw new Error("Anthropic stream ended before response.created");
      }
      return { type: "response.completed", response };
    }
    console.log(event);
    return undefined;
  }

  /**
   * Converts normalized inputs to Anthropic messages and system text.
   * @param input Plain text or structured normalized input.
   * @returns Anthropic conversation messages and extracted system messages.
   */
  private toMessages(input: string | InputItem[]): {
    messages: AnthropicMessage[];
    systemMessages: string[];
  } {
    if (typeof input === "string") {
      return {
        messages: [{ role: "user", content: input }],
        systemMessages: [],
      };
    }
    const messages: AnthropicMessage[] = [];
    const systemMessages: string[] = [];
    for (const item of input) {
      if (item.type !== "message") continue;
      if (item.content.type !== "input_text") {
        this.unsupportedContent(item.content.type);
      }
      if (item.role === "system" || item.role === "developer") {
        systemMessages.push(item.content.text);
      } else {
        messages.push({ role: item.role, content: item.content.text });
      }
    }
    return { messages, systemMessages };
  }

  /**
   * Converts an Anthropic content delta to its normalized counterpart.
   * @param event Anthropic content block delta event.
   * @returns A normalized delta event, or undefined when unsupported.
   */
  private fromContentBlockDelta(
    event: AnthropicContentBlockDeltaEvent,
  ): ResponseEvent | undefined {
    if (event.delta.type === "text_delta") {
      return {
        type: "response.message_text.delta",
        delta: event.delta.text as string,
      };
    }
    if (event.delta.type === "thinking_delta") {
      return {
        type: "response.reasoning_summary_text.delta",
        delta: event.delta.thinking as string,
      };
    }
    console.log(event);
    return undefined;
  }

  /**
   * Rejects structured content unsupported by the minimal converter.
   * @param type Unsupported normalized content type.
   * @returns This function never returns.
   */
  private unsupportedContent(type: "input_image" | "input_file"): never {
    throw new Error(`AnthropicConverter does not support ${type}`);
  }
}
