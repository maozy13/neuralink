import type {
  Converter,
  InputItem,
  NormalizedParams,
  Response,
  ResponseEvent,
  Tool,
} from "../typings/index.js";

/** A Chat Completions function call included in an assistant request message. */
interface ChatCompletionsRequestToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
/** A Chat Completions request message. */
type ChatCompletionsMessage =
  | { role: "user" | "assistant" | "developer" | "system"; content: string; tool_calls?: ChatCompletionsRequestToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
/** A Chat Completions function tool definition. */
interface ChatCompletionsTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}
/** Request body accepted by a Chat Completions-compatible endpoint. */
interface ChatCompletionsRequest {
  model: string;
  messages: ChatCompletionsMessage[];
  tools?: ChatCompletionsTool[];
  stream: true;
}
/** An incremental function call returned inside a Chat Completions choice. */
interface ChatCompletionsToolCallDelta {
  index: number;
  id?: string;
  type?: "function";
  function: { name?: string; arguments?: string };
}
/** Incremental content returned for one Chat Completions choice. */
interface ChatCompletionsDelta {
  role?: string;
  content?: string;
  reasoning_content?: string;
  tool_calls?: ChatCompletionsToolCallDelta[];
}
/** One choice in a Chat Completions streaming chunk. */
interface ChatCompletionsChoice { index: number; delta: ChatCompletionsDelta }
/** Streaming chunk returned by a Chat Completions-compatible endpoint. */
interface ChatCompletionsChunk {
  id: string;
  created: number;
  choices: ChatCompletionsChoice[];
  [key: string]: unknown;
}
/** Source data accepted by ChatCompletionsConverter. */
type ChatCompletionsSourceEvent = ChatCompletionsChunk | "[DONE]";

/** Converts requests and streaming chunks for Chat Completions-compatible APIs. */
export class ChatCompletionsConverter implements Converter<ChatCompletionsRequest, ChatCompletionsSourceEvent> {
  /**
   * Converts provider-neutral parameters to a streaming Chat Completions request.
   * @param params Provider-neutral model parameters.
   * @returns A Chat Completions request with streaming enabled.
   */
  public toAPI(params: NormalizedParams): ChatCompletionsRequest {
    const messages = this.toMessages(params.input);
    if (params.instructions !== undefined) messages.unshift({ role: "system", content: params.instructions });
    const request: ChatCompletionsRequest = { model: params.model, messages, stream: true };
    if (params.tools !== undefined) request.tools = params.tools.map((tool) => this.toTool(tool));
    return request;
  }

  /**
   * Converts a Chat Completions chunk into a normalized response event.
   * @param event The provider streaming chunk.
   * @param response The response accumulated before this chunk.
   * @returns A normalized event, or undefined for an empty chunk.
   */
  public fromEvent(event: ChatCompletionsSourceEvent, response: Response | undefined): ResponseEvent | ResponseEvent[] | undefined {
    if (event === "[DONE]") {
      if (response === undefined) throw new Error("Chat Completions stream ended before response.created");
      return { type: "response.completed", response };
    }
    const events: ResponseEvent[] = [];
    if (response === undefined) {
      events.push({
        type: "response.created",
        response: { id: event.id, created_at: event.created, status: "in_progress", output: [] },
      });
    }
    const choice = event.choices[0];
    const delta = choice?.delta;
    if (delta?.reasoning_content !== undefined) events.push(this.fromReasoning(delta.reasoning_content, choice!.index));
    if (delta?.content !== undefined && delta.tool_calls === undefined) events.push(this.fromContent(delta.content, choice!.index));
    for (const toolCall of delta?.tool_calls ?? []) events.push(this.fromToolCall(toolCall));
    if (events.length > 0) return events;
    console.log(event);
    return undefined;
  }

  /**
   * Converts normalized input into Chat Completions messages.
   * @param input Plain text or structured input items.
   * @returns Chat Completions request messages.
   */
  private toMessages(input: string | InputItem[]): ChatCompletionsMessage[] {
    if (typeof input === "string") return [{ role: "user", content: input }];
    const messages: ChatCompletionsMessage[] = [];
    for (const item of input) {
      if (item.type === "message") {
        messages.push({
          role: item.role,
          content: item.content
            .map((content) => content.type === "input_text" ? content.text : this.unsupportedContent(content.type))
            .join(""),
        });
        continue;
      }
      if (item.type === "function_call_output") {
        messages.push({ role: "tool", tool_call_id: item.call_id, content: item.output });
        continue;
      }
      const previous = messages.at(-1);
      const toolCall = {
        id: item.call_id,
        type: "function" as const,
        function: { name: item.name, arguments: item.arguments },
      };
      if (previous?.role === "assistant" && previous.tool_calls !== undefined) previous.tool_calls.push(toolCall);
      else messages.push({ role: "assistant", content: "", tool_calls: [toolCall] });
    }
    return messages;
  }

  /**
   * Converts a normalized function tool to the nested Chat Completions shape.
   * @param tool Normalized function tool definition.
   * @returns Chat Completions function tool definition.
   */
  private toTool(tool: Tool): ChatCompletionsTool {
    return {
      type: "function",
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    };
  }

  /**
   * Rejects structured content unsupported by the minimal converter.
   * @param type The unsupported normalized content type.
   * @returns This function never returns.
   */
  private unsupportedContent(type: "input_image" | "input_file"): never {
    throw new Error(`ChatCompletionsConverter does not support ${type}`);
  }

  /**
   * Converts reasoning text to an output-item or summary delta event.
   * @param text Incremental reasoning text.
   * @param index Choice index identifying the normalized reasoning item.
   * @returns The normalized reasoning event.
   */
  private fromReasoning(text: string, index: number): ResponseEvent {
    return { type: "response.reasoning_summary_text.delta", index, delta: text };
  }

  /**
   * Converts assistant text to an output-item or text delta event.
   * @param text Incremental assistant text.
   * @param index Choice index identifying the normalized message.
   * @returns The normalized assistant event.
   */
  private fromContent(text: string, index: number): ResponseEvent {
    return { type: "response.message_text.delta", index, delta: text };
  }

  /**
   * Converts a streaming Chat Completions tool-call fragment.
   * @param toolCall Incremental provider tool call.
   * @returns A function-call initialization or arguments delta event.
   */
  private fromToolCall(toolCall: ChatCompletionsToolCallDelta): ResponseEvent {
    if (toolCall.id === undefined) {
      return {
        type: "response.function_call_arguments.delta",
        delta: toolCall.function.arguments ?? "",
        index: toolCall.index,
      };
    }
    return {
      type: "response.function_call.added",
      function_call: {
        id: toolCall.id,
        type: "function_call",
        call_id: toolCall.id,
        name: toolCall.function.name ?? "",
        arguments: "",
      },
    };
  }
}
