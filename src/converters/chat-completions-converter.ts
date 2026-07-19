import type {
  Converter,
  InputItem,
  NormalizedParams,
  Response,
  ResponseEvent,
} from "../typings/index.js";

/** A Chat Completions request message. */
interface ChatCompletionsMessage { role: string; content: string }
/** Request body accepted by a Chat Completions-compatible endpoint. */
interface ChatCompletionsRequest {
  model: string;
  messages: ChatCompletionsMessage[];
  stream: true;
}
/** Incremental content returned for one Chat Completions choice. */
interface ChatCompletionsDelta {
  role?: string;
  content?: string;
  reasoning_content?: string;
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
    return { model: params.model, messages, stream: true };
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
    const delta = event.choices[0]?.delta;
    if (delta?.reasoning_content !== undefined) events.push(this.fromReasoning(delta.reasoning_content));
    if (delta?.content !== undefined) events.push(this.fromContent(delta.content));
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
    return input.flatMap((item) => item.type === "message"
      ? [{ role: item.role, content: item.content.type === "input_text" ? item.content.text : this.unsupportedContent(item.content.type) }]
      : []);
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
   * @returns The normalized reasoning event.
   */
  private fromReasoning(text: string): ResponseEvent {
    return { type: "response.reasoning_summary_text.delta", delta: text };
  }

  /**
   * Converts assistant text to an output-item or text delta event.
   * @param text Incremental assistant text.
   * @returns The normalized assistant event.
   */
  private fromContent(text: string): ResponseEvent {
    return { type: "response.message_text.delta", delta: text };
  }
}
