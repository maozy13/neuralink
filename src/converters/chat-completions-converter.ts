import type {
  Converter,
  InputItem,
  NormalizedParams,
  ResponseEvent,
  ResponseOutputItem,
  ResponseResult,
} from "../typings/index.js";

/** A Chat Completions request message. */
export interface ChatCompletionsMessage { role: string; content: string }
/** Request body accepted by a Chat Completions-compatible endpoint. */
export interface ChatCompletionsRequest {
  model: string;
  messages: ChatCompletionsMessage[];
  stream: true;
}
/** Incremental content returned for one Chat Completions choice. */
export interface ChatCompletionsDelta {
  role?: string;
  content?: string;
  reasoning_content?: string;
}
/** One choice in a Chat Completions streaming chunk. */
export interface ChatCompletionsChoice { index: number; delta: ChatCompletionsDelta }
/** Streaming chunk returned by a Chat Completions-compatible endpoint. */
export interface ChatCompletionsSourceEvent {
  id: string;
  created: number;
  choices: ChatCompletionsChoice[];
  [key: string]: unknown;
}

/** Converts requests and streaming chunks for Chat Completions-compatible APIs. */
export class ChatCompletionsConverter implements Converter<ChatCompletionsRequest, ChatCompletionsSourceEvent> {
  private sequenceNumber = 0;
  private responseId: string | undefined;

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
   * @param result The response result accumulated before this chunk.
   * @returns A normalized event, or undefined for an empty chunk.
   */
  public fromEvent(event: ChatCompletionsSourceEvent, result: ResponseResult | undefined): ResponseEvent | ResponseEvent[] | undefined {
    const events: ResponseEvent[] = [];
    const isFirstEvent = result === undefined || this.responseId !== event.id;
    if (isFirstEvent) {
      this.responseId = event.id;
      this.sequenceNumber = 0;
      events.push({
        type: "response.created",
        sequence_number: this.nextSequence(),
        response: { id: event.id, created_at: event.created, status: "in_progress", error: null },
      });
    }
    const delta = event.choices[0]?.delta;
    const currentResult = isFirstEvent ? undefined : result;
    if (delta?.reasoning_content !== undefined) events.push(...this.fromReasoning(delta.reasoning_content, currentResult));
    if (delta?.content !== undefined) events.push(...this.fromContent(delta.content, currentResult));
    return events.length === 0 ? undefined : events;
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
   * @param result The current accumulated response.
   * @returns The normalized reasoning event.
   */
  private fromReasoning(text: string, result: ResponseResult | undefined): ResponseEvent[] {
    const item = result?.output.find((output) => output.type === "reasoning");
    if (item === undefined) {
      return [
        this.outputItem({ type: "reasoning", content: [], summary: [] }),
        { type: "response.reasoning_summary_part.added", sequence_number: this.nextSequence(), part: { type: "summary_text", text } },
      ];
    }
    if (item.summary.length === 0) {
      return [{ type: "response.reasoning_summary_part.added", sequence_number: this.nextSequence(), part: { type: "summary_text", text } }];
    }
    return [{ type: "response.reasoning_summary_text.delta", sequence_number: this.nextSequence(), delta: text }];
  }

  /**
   * Converts assistant text to an output-item or text delta event.
   * @param text Incremental assistant text.
   * @param result The current accumulated response.
   * @returns The normalized assistant event.
   */
  private fromContent(text: string, result: ResponseResult | undefined): ResponseEvent[] {
    const item = result?.output.find((output) => output.type === "message");
    if (item === undefined) {
      return [
        this.outputItem({ type: "message", role: "assistant", content: { type: "output_text", text: "" } }),
        { type: "response.content_part.added", sequence_number: this.nextSequence(), part: { type: "output_text", text } },
      ];
    }
    if (item.content.type === "output_text" && item.content.text.length === 0) {
      return [{ type: "response.content_part.added", sequence_number: this.nextSequence(), part: { type: "output_text", text } }];
    }
    return [{ type: "response.output_text.delta", sequence_number: this.nextSequence(), delta: text }];
  }

  /**
   * Wraps a newly discovered output item in a normalized event.
   * @param item The normalized output item.
   * @returns A response.output_item.added event.
   */
  private outputItem(item: ResponseOutputItem): ResponseEvent {
    return { type: "response.output_item.added", sequence_number: this.nextSequence(), item };
  }

  /**
   * Returns and advances the normalized event sequence number.
   * @returns The next event sequence number.
   */
  private nextSequence(): number {
    const current = this.sequenceNumber;
    this.sequenceNumber += 1;
    return current;
  }
}
