import type {
  Converter,
  NormalizedParams,
  Response,
  ResponseEvent,
  ResponseStatus,
} from "../typings/index.js";

/** Request body accepted by a Responses API-compatible endpoint. */
export interface ResponsesAPIRequest extends NormalizedParams { stream: true }
/** Minimal response object used while normalizing lifecycle events. */
interface ResponsesAPIResponse {
  id: string;
  created_at: number;
  status?: ResponseStatus;
  output?: Response["output"];
  [key: string]: unknown;
}
/** A Responses API lifecycle event carrying a response object. */
interface ResponsesAPILifecycleEvent extends ResponsesAPIEvent {
  type: "response.created" | "response.completed" | "response.failed" | "response.incomplete";
  sequence_number?: number;
  response: ResponsesAPIResponse;
}
/** A newly added Responses API output item. */
interface ResponsesAPIOutputItemAddedEvent extends ResponsesAPIEvent {
  type: "response.output_item.added";
  item: { type: "message" | "reasoning"; [key: string]: unknown };
  [key: string]: unknown;
}
/** A newly added Responses API message content part. */
interface ResponsesAPIContentPartAddedEvent extends ResponsesAPIEvent {
  type: "response.content_part.added";
  part: { type: "output_text" | "output_refusal" | "refusal"; [key: string]: unknown };
  [key: string]: unknown;
}
/** An incremental Responses API output-text event. */
interface ResponsesAPIOutputTextDeltaEvent extends ResponsesAPIEvent {
  type: "response.output_text.delta";
  delta: string;
  [key: string]: unknown;
}
/** An incremental Responses API reasoning-summary event. */
interface ResponsesAPIReasoningSummaryTextDeltaEvent extends ResponsesAPIEvent {
  type: "response.reasoning_summary_text.delta";
  delta: string;
  [key: string]: unknown;
}
/** A JSON event emitted by a Responses API-compatible endpoint. */
interface ResponsesAPIEvent { type: string; [key: string]: unknown }
/** Every source value accepted by ResponsesAPIConverter. */
export type ResponsesAPISourceEvent = ResponsesAPIEvent | "[DONE]";

/** Converts requests and streaming events for Responses API-compatible endpoints. */
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
   * Converts a Responses API source event to the new normalized ResponseEvent model.
   * @param event Provider-specific streaming event.
   * @returns A normalized event, or undefined when the source event is unsupported.
   */
  public fromEvent(event: ResponsesAPISourceEvent): ResponseEvent | undefined {
    if (event === "[DONE]") return undefined;
    switch (event.type) {
      case "response.created":
      case "response.completed":
      case "response.failed":
      case "response.incomplete":
        return this.fromLifecycleEvent(event as ResponsesAPILifecycleEvent);
      case "response.output_item.added":
        return (event as ResponsesAPIOutputItemAddedEvent).item.type === "message"
          ? { type: "response.message_text.delta", delta: "" }
          : { type: "response.reasoning_summary_text.delta", delta: "" };
      case "response.content_part.added": {
        const partType = (event as ResponsesAPIContentPartAddedEvent).part.type;
        return partType === "output_text"
          ? { type: "response.message_text.delta", delta: "" }
          : { type: "response.message_refusal.delta", delta: "" };
      }
      case "response.output_text.delta":
        return { type: "response.message_text.delta", delta: (event as ResponsesAPIOutputTextDeltaEvent).delta };
      case "response.reasoning_summary_part.added":
        return { type: "response.reasoning_summary_text.delta", delta: "" };
      case "response.reasoning_summary_text.delta":
        return {
          type: "response.reasoning_summary_text.delta",
          delta: (event as ResponsesAPIReasoningSummaryTextDeltaEvent).delta,
        };
      default:
        console.log(event);
        return undefined;
    }
  }

  /**
   * Converts a Responses API lifecycle event.
   * @param event Provider lifecycle event.
   * @returns The corresponding normalized lifecycle event.
   */
  private fromLifecycleEvent(event: ResponsesAPILifecycleEvent): ResponseEvent {
    const response: Response = {
      id: event.response.id,
      created_at: event.response.created_at,
      status: event.response.status ?? this.defaultStatus(event.type),
      output: event.response.output ?? [],
    };
    if (event.type === "response.incomplete") {
      return { type: event.type, sequence_number: event.sequence_number ?? 0, response };
    }
    return { type: event.type, response };
  }

  /**
   * Supplies the lifecycle status when a compatible service omits it.
   * @param type Lifecycle event type.
   * @returns Status implied by the lifecycle event.
   */
  private defaultStatus(type: ResponsesAPILifecycleEvent["type"]): ResponseStatus {
    if (type === "response.completed") return "completed";
    if (type === "response.failed") return "failed";
    if (type === "response.incomplete") return "incomplete";
    return "in_progress";
  }
}
