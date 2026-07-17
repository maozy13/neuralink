import type {
  Converter,
  NormalizedParams,
  RefusalContent,
  ResponseContentPartAdded,
  ResponseCreated,
  ResponseError,
  ResponseEvent,
  ResponseOutputItem,
  ResponseOutputItemAdded,
  ResponseOutputTextDelta,
  ResponseReasoningSummaryPartAdded,
  ResponseReasoningSummaryTextDelta,
  ResponseStatus,
  Reasoning,
  SummaryText,
  TextContent,
  OutputMessage,
} from "../typings/index.js";

/** Request body accepted by a Responses API-compatible endpoint. */
export interface ResponsesAPIRequest extends NormalizedParams { stream: true }
/** Minimal Responses API response metadata. */
export interface ResponsesAPIMetadata {
  id: string;
  created_at: number;
  status: ResponseStatus;
  error?: ResponseError | null;
  [key: string]: unknown;
}
/** Minimal source event emitted when a response is created. */
export interface ResponsesAPICreatedEvent {
  type: "response.created";
  sequence_number: number;
  response: ResponsesAPIMetadata;
}
/** Minimal source event emitted when a response output item is added. */
export interface ResponsesAPIOutputItemAddedEvent {
  type: "response.output_item.added";
  sequence_number: number;
  item: ResponsesAPIOutputItem;
  [key: string]: unknown;
}
/** Incremental assistant message returned by a Responses API-compatible endpoint. */
export interface ResponsesAPIOutputMessage {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<TextContent | RefusalContent>;
  [key: string]: unknown;
}
/** Incremental reasoning item returned by a Responses API-compatible endpoint. */
export interface ResponsesAPIReasoning {
  id: string;
  type: "reasoning";
  content?: Reasoning["content"];
  summary?: Reasoning["summary"];
  [key: string]: unknown;
}
/** Output item returned by a Responses API-compatible endpoint. */
export type ResponsesAPIOutputItem = ResponsesAPIOutputMessage | ResponsesAPIReasoning;
/** Minimal source event emitted when content is added to an output item. */
export interface ResponsesAPIContentPartAddedEvent {
  type: "response.content_part.added";
  sequence_number: number;
  item_id: string;
  part: TextContent | RefusalContent;
  [key: string]: unknown;
}
/** Minimal source event emitted for an incremental output-text update. */
export interface ResponsesAPIOutputTextDeltaEvent {
  type: "response.output_text.delta";
  sequence_number: number;
  item_id: string;
  delta: string;
  [key: string]: unknown;
}
/** Minimal source event emitted when a reasoning summary part is added. */
export interface ResponsesAPIReasoningSummaryPartAddedEvent {
  type: "response.reasoning_summary_part.added";
  sequence_number: number;
  item_id: string;
  part: Omit<SummaryText, "text"> & { text?: string };
  [key: string]: unknown;
}
/** Minimal source event emitted for an incremental reasoning-summary update. */
export interface ResponsesAPIReasoningSummaryTextDeltaEvent {
  type: "response.reasoning_summary_text.delta";
  sequence_number: number;
  item_id: string;
  delta: string;
  [key: string]: unknown;
}
/** A Responses API event not handled by the minimal converter. */
export interface ResponsesAPIUnknownEvent {
  type: string;
  sequence_number?: number;
  [key: string]: unknown;
}
/** Source events supported by the minimal Responses API converter. */
export type ResponsesAPISourceEvent =
  | ResponsesAPICreatedEvent
  | ResponsesAPIOutputItemAddedEvent
  | ResponsesAPIContentPartAddedEvent
  | ResponsesAPIOutputTextDeltaEvent
  | ResponsesAPIReasoningSummaryPartAddedEvent
  | ResponsesAPIReasoningSummaryTextDeltaEvent
  | ResponsesAPIUnknownEvent;
/** Converts requests and supported streaming events for Responses API. */
export class ResponsesAPIConverter implements Converter<ResponsesAPIRequest, ResponsesAPISourceEvent> {
  /**
   * Converts model parameters to a streaming Responses API request.
   * @param params Provider-neutral model parameters.
   * @returns A Responses API request with streaming enabled.
   */
  public toAPI(params: NormalizedParams): ResponsesAPIRequest {
    return { ...params, stream: true };
  }
  /**
   * Normalizes a Responses API response.created event.
   * @param event The provider event to normalize.
   * @returns A normalized event, or undefined when the event is unsupported.
   */
  public fromEvent(event: ResponsesAPISourceEvent): ResponseEvent | undefined {
    if (event.type === "response.reasoning_summary_text.delta") {
      return this.fromReasoningSummaryTextDelta(event as ResponsesAPIReasoningSummaryTextDeltaEvent);
    }
    if (event.type === "response.reasoning_summary_part.added") {
      return this.fromReasoningSummaryPartAdded(event as ResponsesAPIReasoningSummaryPartAddedEvent);
    }
    if (event.type === "response.output_text.delta") {
      return this.fromOutputTextDelta(event as ResponsesAPIOutputTextDeltaEvent);
    }
    if (event.type === "response.content_part.added") {
      return this.fromContentPartAdded(event as ResponsesAPIContentPartAddedEvent);
    }
    if (event.type === "response.output_item.added") {
      return this.fromOutputItemAdded(event as ResponsesAPIOutputItemAddedEvent);
    }
    if (event.type === "response.created") {
      const createdEvent = event as ResponsesAPICreatedEvent;
      const { id, created_at, status, error = null } = createdEvent.response;
      return {
        type: "response.created",
        sequence_number: createdEvent.sequence_number,
        response: { id, created_at, status, error },
      };
    }
    return undefined;
  }

  /**
   * Normalizes a Responses API response.reasoning_summary_part.added event.
   * @param event The provider reasoning-summary part event to normalize.
   * @returns A provider-neutral response.reasoning_summary_part.added event.
   */
  private fromReasoningSummaryPartAdded(
    event: ResponsesAPIReasoningSummaryPartAddedEvent,
  ): ResponseReasoningSummaryPartAdded {
    return {
      type: "response.reasoning_summary_part.added",
      sequence_number: event.sequence_number,
      item_id: event.item_id,
      part: { type: "summary_text", text: event.part.text ?? "" },
    };
  }

  /**
   * Normalizes a Responses API response.reasoning_summary_text.delta event.
   * @param event The provider reasoning-summary delta event to normalize.
   * @returns A provider-neutral response.reasoning_summary_text.delta event.
   */
  private fromReasoningSummaryTextDelta(
    event: ResponsesAPIReasoningSummaryTextDeltaEvent,
  ): ResponseReasoningSummaryTextDelta {
    return {
      type: "response.reasoning_summary_text.delta",
      sequence_number: event.sequence_number,
      item_id: event.item_id,
      delta: event.delta,
    };
  }

  /**
   * Normalizes a Responses API response.output_text.delta event.
   * @param event The provider output-text delta event to normalize.
   * @returns A provider-neutral response.output_text.delta event.
   */
  private fromOutputTextDelta(event: ResponsesAPIOutputTextDeltaEvent): ResponseOutputTextDelta {
    return {
      type: "response.output_text.delta",
      sequence_number: event.sequence_number,
      item_id: event.item_id,
      delta: event.delta,
    };
  }

  /**
   * Normalizes a Responses API response.content_part.added event.
   * @param event The provider content-part event to normalize.
   * @returns A provider-neutral response.content_part.added event.
   */
  private fromContentPartAdded(event: ResponsesAPIContentPartAddedEvent): ResponseContentPartAdded {
    const part: TextContent | RefusalContent = event.part.type === "output_text"
      ? { type: "output_text", text: event.part.text }
      : { type: "refusal", refusal: event.part.refusal };
    return {
      type: "response.content_part.added",
      sequence_number: event.sequence_number,
      item_id: event.item_id,
      part,
    };
  }

  /**
   * Normalizes a Responses API response.output_item.added event.
   * @param event The provider output-item event to normalize.
   * @returns A provider-neutral response.output_item.added event.
   */
  private fromOutputItemAdded(event: ResponsesAPIOutputItemAddedEvent): ResponseOutputItemAdded {
    const item = this.fromOutputItem(event.item);
    return {
      type: "response.output_item.added",
      sequence_number: event.sequence_number,
      item,
    };
  }

  /**
   * Normalizes an incremental Responses API output item.
   * @param item The provider output item to normalize.
   * @returns A complete provider-neutral output item safe for incremental updates.
   */
  private fromOutputItem(item: ResponsesAPIOutputItem): ResponseOutputItem {
    if (item.type === "reasoning") {
      return {
        id: item.id,
        type: "reasoning",
        content: item.content ?? [],
        summary: item.summary ?? [],
      };
    }
    const sourceContent = Array.isArray(item.content) ? item.content[0] : item.content;
    const content: OutputMessage["content"] = sourceContent?.type === "refusal"
      ? { type: "refusal", refusal: sourceContent.refusal }
      : { type: "output_text", text: sourceContent?.text ?? "" };
    return { id: item.id, type: "message", role: "assistant", content };
  }
}
