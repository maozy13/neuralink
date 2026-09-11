import type {
  Converter,
  InputItem,
  NormalizedParams,
  Response,
  ResponseEvent,
  Tool,
} from "../typings/index.js";

/** A tool-use block supplied in an Anthropic assistant message. */
interface AnthropicToolUseBlock { type: "tool_use"; id: string; name: string; input: unknown }
/** A tool-result block supplied in an Anthropic user message. */
interface AnthropicToolResultBlock { type: "tool_result"; tool_use_id: string; content: string }
/** A message accepted by an Anthropic-compatible endpoint. */
interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | Array<AnthropicToolUseBlock | AnthropicToolResultBlock>;
}
/** A function tool accepted by an Anthropic-compatible endpoint. */
interface AnthropicTool { name: string; description: string; input_schema: Record<string, unknown> }

/** Request body accepted by an Anthropic-compatible endpoint. */
interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  stream: true;
  system?: string;
  tools?: AnthropicTool[];
}

/** A JSON event emitted by an Anthropic-compatible endpoint. */
interface AnthropicSourceEvent {
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
  index: number;
  delta:
    | { type: "text_delta"; text: string; [key: string]: unknown }
    | { type: "thinking_delta"; thinking: string; [key: string]: unknown }
    | { type: "input_json_delta"; partial_json: string; [key: string]: unknown }
    | { type: string; [key: string]: unknown };
}
/** An Anthropic content-block start event for tool selection. */
interface AnthropicContentBlockStartEvent extends AnthropicSourceEvent {
  type: "content_block_start";
  index: number;
  content_block: { type: string; id?: string; name?: string; [key: string]: unknown };
}

/** Converts requests and stream events for Anthropic-compatible endpoints. */
export class AnthropicConverter
  implements Converter<AnthropicRequest, AnthropicSourceEvent>
{
  /** Maximum output tokens used by the minimal normalized request. */
  private static readonly DEFAULT_MAX_TOKENS = 4096;
  private readonly contentBlockIndexes = new Map<number, number>();
  private readonly contentTypeCounts = new Map<"message" | "reasoning" | "function_call", number>();

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
    if (params.tools !== undefined) request.tools = params.tools.map((tool) => this.toTool(tool));
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
      this.contentBlockIndexes.clear();
      this.contentTypeCounts.clear();
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
      return this.fromContentBlockDelta(event as AnthropicContentBlockDeltaEvent, response);
    }
    if (event.type === "content_block_start") {
      return this.fromContentBlockStart(event as AnthropicContentBlockStartEvent);
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
      if (item.type === "message") {
        const content = item.content
          .map((part) => part.type === "input_text" ? part.text : this.unsupportedContent(part.type))
          .join("");
        if (item.role === "system" || item.role === "developer") systemMessages.push(content);
        else messages.push({ role: item.role, content });
        continue;
      }
      if (item.type !== "function_call" && item.type !== "function_call_output") {
        return this.unsupportedInput(item.type);
      }
      const role = item.type === "function_call" ? "assistant" : "user";
      const block = item.type === "function_call"
        ? { type: "tool_use" as const, id: item.call_id, name: item.name, input: JSON.parse(item.arguments) as unknown }
        : { type: "tool_result" as const, tool_use_id: item.call_id, content: item.output };
      const previous = messages.at(-1);
      if (previous?.role === role && Array.isArray(previous.content)) previous.content.push(block);
      else messages.push({ role, content: [block] });
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
    response: Response | undefined,
  ): ResponseEvent | undefined {
    if (event.delta.type === "text_delta") {
      return {
        type: "response.message_text.delta",
        index: this.blockIndex(event.index, "message"),
        delta: event.delta.text as string,
      };
    }
    if (event.delta.type === "thinking_delta") {
      return {
        type: "response.reasoning_summary_text.delta",
        index: this.blockIndex(event.index, "reasoning"),
        delta: event.delta.thinking as string,
      };
    }
    if (event.delta.type === "input_json_delta") {
      if (response === undefined) throw new Error("Anthropic emitted tool arguments before response.created");
      const index = this.blockIndex(event.index, "function_call");
      return { type: "response.function_call_arguments.delta", delta: event.delta.partial_json as string, index };
    }
    console.log(event);
    return undefined;
  }

  /**
   * Converts the start of an Anthropic tool-use block.
   * @param event Anthropic content-block start event.
   * @returns A normalized function-call event, or undefined for non-tool blocks.
   */
  private fromContentBlockStart(event: AnthropicContentBlockStartEvent): ResponseEvent | undefined {
    if (event.content_block.type === "text") {
      this.blockIndex(event.index, "message");
      return undefined;
    }
    if (event.content_block.type === "thinking") {
      this.blockIndex(event.index, "reasoning");
      return undefined;
    }
    if (event.content_block.type !== "tool_use") return undefined;
    this.blockIndex(event.index, "function_call");
    return {
      type: "response.function_call.added",
      function_call: {
        id: event.content_block.id ?? "",
        type: "function_call",
        call_id: event.content_block.id ?? "",
        name: event.content_block.name ?? "",
        arguments: "",
      },
    };
  }

  /**
   * Resolves an Anthropic content-block position to a same-type normalized index.
   * @param blockIndex Upstream content-block index.
   * @param type Normalized output type represented by the block.
   * @returns Stable zero-based index among outputs of the same type.
   */
  private blockIndex(blockIndex: number, type: "message" | "reasoning" | "function_call"): number {
    const existing = this.contentBlockIndexes.get(blockIndex);
    if (existing !== undefined) return existing;
    const index = this.contentTypeCounts.get(type) ?? 0;
    this.contentBlockIndexes.set(blockIndex, index);
    this.contentTypeCounts.set(type, index + 1);
    return index;
  }

  /**
   * Converts a normalized function tool to the Anthropic tool shape.
   * @param tool Normalized function tool definition.
   * @returns Anthropic function tool definition.
   */
  private toTool(tool: Tool): AnthropicTool {
    if (tool.type !== "function") return this.unsupportedTool(tool.type);
    return { name: tool.name, description: tool.description, input_schema: tool.parameters };
  }

  /**
   * Rejects structured content unsupported by the minimal converter.
   * @param type Unsupported normalized content type.
   * @returns This function never returns.
   */
  private unsupportedContent(type: "input_image" | "input_file"): never {
    throw new Error(`AnthropicConverter does not support ${type}`);
  }

  /**
   * Rejects structured input unsupported by the Anthropic converter.
   * @param type Unsupported normalized input type.
   * @returns This function never returns.
   */
  private unsupportedInput(type: "custom_tool_call" | "custom_tool_call_output"): never {
    throw new Error(`AnthropicConverter does not support ${type}`);
  }

  /**
   * Rejects tool definitions unsupported by the Anthropic converter.
   * @param type Unsupported normalized tool type.
   * @returns This function never returns.
   */
  private unsupportedTool(type: "custom"): never {
    throw new Error(`AnthropicConverter does not support ${type} tools`);
  }
}
