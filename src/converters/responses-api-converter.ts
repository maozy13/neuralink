import type {
  Converter,
  NormalizedParams,
  Response,
  ResponseEvent,
  ResponseOutputItem,
  ResponseStatus,
} from "../typings/index.js";

/** Request body accepted by a Responses API-compatible endpoint. */
interface ResponsesAPIRequest extends NormalizedParams { stream: true }
/** Minimal response object used while normalizing lifecycle events. */
interface ResponsesAPIResponse {
  id: string;
  created_at: number;
  status?: ResponseStatus;
  output?: ResponsesAPIOutputItem[];
  [key: string]: unknown;
}
/** Text or refusal content returned inside an upstream message item. */
type ResponsesAPIMessageContent =
  | { type: "output_text"; text: string; [key: string]: unknown }
  | { type: "refusal"; refusal: string; [key: string]: unknown };
/** An upstream Responses API message output item. */
interface ResponsesAPIMessageItem {
  id: string;
  type: "message";
  role: "assistant";
  content: ResponsesAPIMessageContent[];
  [key: string]: unknown;
}
/** An upstream Responses API reasoning output item. */
interface ResponsesAPIReasoningItem {
  id: string;
  type: "reasoning";
  content?: Array<{ type: "reasoning_text"; text: string; [key: string]: unknown }>;
  summary?: Array<{ type: "summary_text"; text: string; [key: string]: unknown }>;
  [key: string]: unknown;
}
/** An upstream Responses API function-call output item. */
interface ResponsesAPIFunctionCallItem {
  id: string;
  type: "function_call";
  call_id: string;
  name: string;
  arguments?: string;
  [key: string]: unknown;
}
/** An upstream Responses API custom-tool-call output item. */
interface ResponsesAPICustomToolCallItem {
  id: string;
  type: "custom_tool_call";
  call_id: string;
  name: string;
  input?: string;
  [key: string]: unknown;
}
/** An output item carried by an upstream lifecycle response. */
type ResponsesAPIOutputItem =
  | ResponsesAPIMessageItem
  | ResponsesAPIReasoningItem
  | ResponsesAPIFunctionCallItem
  | ResponsesAPICustomToolCallItem;
/** A Responses API lifecycle event carrying a response object. */
interface ResponsesAPILifecycleEvent extends ResponsesAPIEvent {
  type: "response.created" | "response.completed" | "response.failed" | "response.incomplete";
  sequence_number?: number;
  response: ResponsesAPIResponse;
}
/** A newly added Responses API output item. */
interface ResponsesAPIOutputItemAddedEvent extends ResponsesAPIEvent {
  type: "response.output_item.added";
  output_index?: number;
  item: ResponsesAPIEvent;
  [key: string]: unknown;
}
/** A newly added Responses API message content part. */
interface ResponsesAPIContentPartAddedEvent extends ResponsesAPIEvent {
  type: "response.content_part.added";
  output_index?: number;
  part: { type: string; [key: string]: unknown };
  [key: string]: unknown;
}
/** An incremental Responses API output-text event. */
interface ResponsesAPIOutputTextDeltaEvent extends ResponsesAPIEvent {
  type: "response.output_text.delta";
  output_index?: number;
  delta: string;
  [key: string]: unknown;
}
/** An incremental Responses API reasoning-summary event. */
interface ResponsesAPIReasoningSummaryTextDeltaEvent extends ResponsesAPIEvent {
  type: "response.reasoning_summary_text.delta";
  output_index?: number;
  delta: string;
  [key: string]: unknown;
}
/** An incremental Responses API reasoning-text event. */
interface ResponsesAPIReasoningTextDeltaEvent extends ResponsesAPIEvent {
  type: "response.reasoning_text.delta";
  output_index?: number;
  delta: string;
  [key: string]: unknown;
}
/** An incremental Responses API function-call arguments event. */
interface ResponsesAPIFunctionCallArgumentsDeltaEvent extends ResponsesAPIEvent {
  type: "response.function_call_arguments.delta";
  delta: string;
  output_index: number;
  /** Stable upstream output-item identity, when supplied. */
  item_id?: string;
  [key: string]: unknown;
}
/** An incremental Responses API custom-tool input event. */
interface ResponsesAPICustomToolCallInputDeltaEvent extends ResponsesAPIEvent {
  type: "response.custom_tool_call_input.delta";
  delta: string;
  output_index: number;
  /** Stable upstream output-item identity, when supplied. */
  item_id?: string;
  [key: string]: unknown;
}
/** A JSON event emitted by a Responses API-compatible endpoint. */
interface ResponsesAPIEvent { type: string; [key: string]: unknown }
/** Every source value accepted by ResponsesAPIConverter. */
type ResponsesAPISourceEvent = ResponsesAPIEvent | "[DONE]";

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
   * @param response Response accumulated before the event.
   * @returns A normalized event, or undefined when the source event is unsupported.
   */
  public fromEvent(event: ResponsesAPISourceEvent, response?: Response): ResponseEvent | undefined {
    if (event === "[DONE]") return undefined;
    switch (event.type) {
      case "response.created":
      case "response.completed":
      case "response.failed":
      case "response.incomplete":
        return this.fromLifecycleEvent(event as ResponsesAPILifecycleEvent);
      case "response.output_item.added":
        return this.fromOutputItemAdded(event as ResponsesAPIOutputItemAddedEvent, response);
      case "response.content_part.added": {
        const partEvent = event as ResponsesAPIContentPartAddedEvent;
        const partType = partEvent.part.type;
        if (partType === "reasoning_text") {
          return {
            type: "response.reasoning_text.delta",
            index: this.existingReasoningIndex(response, partEvent.output_index),
            delta: "",
          };
        }
        if (partType !== "output_text" && partType !== "output_refusal" && partType !== "refusal") {
          console.log(event);
          return undefined;
        }
        return partType === "output_text"
          ? { type: "response.message_text.delta", index: this.existingContentIndex(response, "output_text", partEvent.output_index), delta: "" }
          : { type: "response.message_refusal.delta", index: this.contentIndex(response, "refusal"), delta: "" };
      }
      case "response.output_text.delta":
        return {
          type: "response.message_text.delta",
          index: this.existingContentIndex(response, "output_text", (event as ResponsesAPIOutputTextDeltaEvent).output_index),
          delta: (event as ResponsesAPIOutputTextDeltaEvent).delta,
        };
      case "response.reasoning_summary_part.added":
        return {
          type: "response.reasoning_summary_text.delta",
          index: this.existingReasoningIndex(response, undefined),
          delta: "",
        };
      case "response.reasoning_summary_text.delta":
        return {
          type: "response.reasoning_summary_text.delta",
          index: this.existingReasoningIndex(response, (event as ResponsesAPIReasoningSummaryTextDeltaEvent).output_index),
          delta: (event as ResponsesAPIReasoningSummaryTextDeltaEvent).delta,
        };
      case "response.reasoning_text.delta":
        return {
          type: "response.reasoning_text.delta",
          index: this.existingReasoningIndex(response, (event as ResponsesAPIReasoningTextDeltaEvent).output_index),
          delta: (event as ResponsesAPIReasoningTextDeltaEvent).delta,
        };
      case "response.function_call_arguments.delta":
        return this.fromFunctionCallArgumentsDelta(
          event as ResponsesAPIFunctionCallArgumentsDeltaEvent,
          response,
        );
      case "response.custom_tool_call_input.delta":
        return this.fromCustomToolCallInputDelta(
          event as ResponsesAPICustomToolCallInputDeltaEvent,
          response,
        );
      default:
        console.log(event);
        return undefined;
    }
  }

  /**
   * Converts an upstream output index to the normalized function-call index.
   * @param event Upstream function-call arguments fragment.
   * @param response Response accumulated before the fragment.
   * @returns A normalized function-call arguments delta event.
   */
  private fromFunctionCallArgumentsDelta(
    event: ResponsesAPIFunctionCallArgumentsDeltaEvent,
    response: Response | undefined,
  ): ResponseEvent {
    if (response === undefined) {
      throw new Error("Responses API emitted function-call arguments before response.created");
    }
    const index = event.item_id === undefined ? response.output
      .slice(0, event.output_index + 1)
      .filter((item) => item.type === "function_call")
      .length - 1 : response.output
        .filter((item) => item.type === "function_call")
        .findIndex((item) => item.id === event.item_id);
    return { type: "response.function_call_arguments.delta", delta: event.delta, index };
  }

  /**
   * Converts an upstream output index to the normalized custom-tool-call index.
   * @param event Upstream custom-tool input fragment.
   * @param response Response accumulated before the fragment.
   * @returns A normalized custom-tool input delta event.
   */
  private fromCustomToolCallInputDelta(
    event: ResponsesAPICustomToolCallInputDeltaEvent,
    response: Response | undefined,
  ): ResponseEvent {
    if (response === undefined) {
      throw new Error("Responses API emitted custom-tool input before response.created");
    }
    const index = event.item_id === undefined ? response.output
      .slice(0, event.output_index + 1)
      .filter((item) => item.type === "custom_tool_call")
      .length - 1 : response.output
        .filter((item) => item.type === "custom_tool_call")
        .findIndex((item) => item.id === event.item_id);
    return { type: "response.custom_tool_call_input.delta", delta: event.delta, index };
  }

  /**
   * Converts a newly selected output item into its normalized initialization event.
   * @param event Upstream output-item-added event.
   * @param response Response accumulated before the event.
   * @returns A normalized initialization event, or undefined for an unsupported output item.
   */
  private fromOutputItemAdded(event: ResponsesAPIOutputItemAddedEvent, response: Response | undefined): ResponseEvent | undefined {
    if (event.item.type === "message") {
      return { type: "response.message_text.delta", index: this.contentIndex(response, "output_text"), delta: "" };
    }
    if (event.item.type === "reasoning") {
      return {
        type: "response.reasoning_summary_text.delta",
        index: response?.output.filter((item) => item.type === "reasoning").length ?? 0,
        delta: "",
      };
    }
    if (event.item.type === "custom_tool_call") {
      const item = event.item as ResponsesAPICustomToolCallItem;
      return {
        type: "response.custom_tool_call.added",
        custom_tool_call: {
          id: item.id,
          type: "custom_tool_call",
          call_id: item.call_id,
          name: item.name,
          input: item.input ?? "",
        },
      };
    }
    if (event.item.type !== "function_call") {
      console.log(event);
      return undefined;
    }
    const item = event.item as ResponsesAPIFunctionCallItem;
    return {
      type: "response.function_call.added",
      function_call: {
        id: item.id,
        type: "function_call",
        call_id: item.call_id,
        name: item.name,
        arguments: item.arguments ?? "",
      },
    };
  }

  /**
   * Returns the next index for a normalized message content type.
   * @param response Response accumulated before the event.
   * @param type Normalized message content type.
   * @returns Next same-type message index.
   */
  private contentIndex(response: Response | undefined, type: "output_text" | "refusal"): number {
    return response?.output.filter(
      (item) => item.type === "message" && item.content.type === type,
    ).length ?? 0;
  }

  /**
   * Returns the existing normalized message-content index for an upstream output position.
   * @param response Response accumulated before the event.
   * @param type Normalized message content type.
   * @param outputIndex Upstream all-output position, when available.
   * @returns Existing same-type message index.
   */
  private existingContentIndex(
    response: Response | undefined,
    type: "output_text" | "refusal",
    outputIndex: number | undefined,
  ): number {
    if (response === undefined) return 0;
    const output = outputIndex === undefined ? response.output : response.output.slice(0, outputIndex + 1);
    return Math.max(0, output.filter(
      (item) => item.type === "message" && item.content.type === type,
    ).length - 1);
  }

  /**
   * Returns the existing normalized reasoning index for an upstream output position.
   * @param response Response accumulated before the event.
   * @param outputIndex Upstream all-output position, when available.
   * @returns Existing reasoning index.
   */
  private existingReasoningIndex(response: Response | undefined, outputIndex: number | undefined): number {
    if (response === undefined) return 0;
    const output = outputIndex === undefined ? response.output : response.output.slice(0, outputIndex + 1);
    return Math.max(0, output.filter((item) => item.type === "reasoning").length - 1);
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
      output: (event.response.output ?? []).map((item) => this.fromOutputItem(item)),
    };
    if (event.type === "response.incomplete") {
      return { type: event.type, sequence_number: event.sequence_number ?? 0, response };
    }
    return { type: event.type, response };
  }

  /**
   * Converts an upstream output item to NeuralLink's normalized single-content shape.
   * @param item Upstream Responses API output item.
   * @returns A normalized response output item.
   */
  private fromOutputItem(item: ResponsesAPIOutputItem): ResponseOutputItem {
    if (item.type === "function_call") {
      return {
        id: item.id,
        type: "function_call",
        call_id: item.call_id,
        name: item.name,
        arguments: item.arguments ?? "",
      };
    }
    if (item.type === "custom_tool_call") {
      return {
        id: item.id,
        type: "custom_tool_call",
        call_id: item.call_id,
        name: item.name,
        input: item.input ?? "",
      };
    }
    if (item.type === "reasoning") {
      return {
        id: item.id,
        type: "reasoning",
        content: item.content?.[0] === undefined
          ? { type: "reasoning_text", text: "" }
          : { type: "reasoning_text", text: item.content[0].text },
        summary: item.summary?.[0] === undefined
          ? { type: "summary_text", text: "" }
          : { type: "summary_text", text: item.summary[0].text },
      };
    }
    const content = item.content[0];
    return {
      id: item.id,
      type: "message",
      role: "assistant",
      content: content?.type === "refusal"
        ? { type: "refusal", refusal: content.refusal }
        : { type: "output_text", text: content?.text ?? "" },
    };
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
