# NeuralLink API 参考

本文档描述 `@maozy13/neuralink` 包入口公开导出的类、方法、属性和 TypeScript
类型。供应商转换器内部使用的请求和原始事件类型不属于公共 API。

## 导入

```ts
import {
  AnthropicConverter,
  ChatCompletionsConverter,
  Connector,
  ResponsesAPIConverter,
} from "@maozy13/neuralink";

import type {
  ConnectorOptions,
  InputItem,
  Optional,
  Response,
  ResponseEvent,
  Tool,
} from "@maozy13/neuralink";
```

## Connector

`Connector<RequestParams, SourceEvent>` 负责发送模型请求、解析 SSE 数据、调用
Converter，并将供应商事件转换为规范化事件。

通常不需要显式填写两个泛型参数，TypeScript 会从传入的 Converter 推断：

```ts
const connector = new Connector(
  "https://example.com/v1/responses",
  process.env.LLM_API_KEY!,
  new ResponsesAPIConverter(),
);
```

### 构造函数

```ts
new Connector<RequestParams, SourceEvent>(
  baseUrl: string,
  apiKey: string,
  converter: Converter<RequestParams, SourceEvent>,
  options?: ConnectorOptions,
)
```

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `baseUrl` | `string` | 是 | 完整的模型 API 地址。 |
| `apiKey` | `string` | 是 | API Key。Connector 会通过 `Authorization: Bearer <apiKey>` 发送。 |
| `converter` | `Converter<RequestParams, SourceEvent>` | 是 | 与目标 API 风格匹配的转换器。 |
| `options` | `ConnectorOptions` | 否 | 运行时依赖注入选项。 |

### 公共属性

| 属性 | 类型 | 可写 | 说明 |
| --- | --- | --- | --- |
| `baseUrl` | `string` | 否 | 构造时传入的模型 API 地址。 |
| `apiKey` | `string` | 否 | 构造时传入的 API Key。 |
| `converter` | `Converter<RequestParams, SourceEvent>` | 否 | 当前使用的转换器。 |

### call()

```ts
call(
  model: string,
  input: string | InputItem[],
  optional?: Optional,
): AsyncGenerator<ResponseEvent, Response>
```

发起一次流式模型调用。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `model` | `string` | 是 | 供应商模型 ID。 |
| `input` | `string \| InputItem[]` | 是 | 简单文本或结构化输入。 |
| `optional` | `Optional` | 否 | 系统指令和工具定义。 |

生成器每次迭代产生一个 `ResponseEvent`，流结束时返回累积完成的
`Response`。如果需要取得最终返回值，应直接调用 `next()`：

```ts
const stream = connector.call(
  "your-model",
  "请用一句话介绍 TypeScript。",
  { instructions: "回答要简洁。" },
);

while (true) {
  const next = await stream.next();

  if (next.done) {
    const response: Response = next.value;
    console.log(response);
    break;
  }

  const event: ResponseEvent = next.value;
  if (event.type === "response.message_text.delta") {
    process.stdout.write(event.delta);
  }
}
```

> `for await...of` 适合只消费事件；它不会暴露异步生成器的最终
> `Response` 返回值。

### ConnectorOptions

```ts
interface ConnectorOptions {
  fetch?: typeof fetch;
}
```

| 属性 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `fetch` | `typeof fetch` | 否 | 自定义 Fetch 实现，常用于测试或特殊运行时。 |

## 预置 Converter

### ResponsesAPIConverter

用于兼容 Responses API 风格的接口：

```ts
const connector = new Connector(
  "https://example.com/v1/responses",
  apiKey,
  new ResponsesAPIConverter(),
);
```

公开方法：

```ts
toAPI(params: NormalizedParams): ResponsesAPIRequest

fromEvent(
  event: ResponsesAPISourceEvent,
  response?: Response,
): ResponseEvent | undefined
```

转换后的请求会自动启用 `stream: true`。`ResponsesAPIRequest` 和
`ResponsesAPISourceEvent` 是转换器内部的供应商类型，不从包入口单独导出。

工具参数增量优先通过上游 `item_id` 定位函数调用；未提供 ID 时按 `output_index` 转换索引。
DeepSeek 的 `reasoning_text` 内容块会转换为推理正文增量，并累积到 `Reasoning.content.text`。
不支持的其他内容块会打印并跳过，不会创建拒绝消息或影响工具调用索引。

### ChatCompletionsConverter

用于兼容 Chat Completions 风格的接口：

```ts
const connector = new Connector(
  "https://example.com/v1/chat/completions",
  apiKey,
  new ChatCompletionsConverter(),
);
```

公开方法：

```ts
toAPI(params: NormalizedParams): ChatCompletionsRequest

fromEvent(
  event: ChatCompletionsSourceEvent,
  response: Response | undefined,
): ResponseEvent | ResponseEvent[] | undefined
```

转换后的请求会自动启用 `stream: true`。当前仅支持文本消息输入；图片和文件输入
会抛出异常。供应商请求和事件类型不从包入口单独导出。

### AnthropicConverter

用于兼容 Anthropic Messages 风格的接口：

```ts
const connector = new Connector(
  "https://example.com/v1/messages",
  apiKey,
  new AnthropicConverter(),
);
```

公开方法：

```ts
toAPI(params: NormalizedParams): AnthropicRequest

fromEvent(
  event: AnthropicSourceEvent,
  response: Response | undefined,
): ResponseEvent | undefined
```

转换器使用默认 `max_tokens: 4096` 并自动启用流式输出。当前仅支持文本消息输入；
图片和文件输入会抛出异常。供应商请求和事件类型不从包入口单独导出。

## Converter 接口

自定义供应商适配器需要实现：

```ts
interface Converter<RequestParams, SourceEvent> {
  toAPI(params: NormalizedParams): RequestParams;

  fromEvent(
    event: SourceEvent,
    response: Response | undefined,
  ): ResponseEvent | ResponseEvent[] | undefined;
}
```

### toAPI()

将规范化参数转换为供应商请求体。

### fromEvent()

将一个供应商流事件转换为一个或多个规范化事件。不需要处理的供应商事件可以
返回 `undefined`。`response` 是处理当前事件之前已经累积的响应。

## 调用输入类型

### NormalizedParams

Connector 传给 Converter 的完整规范化参数：

```ts
interface NormalizedParams extends Optional {
  model: string;
  input: string | InputItem[];
}
```

### Optional

```ts
interface Optional {
  instructions?: string;
  tools?: Tool[];
}
```

| 属性 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `instructions` | `string` | 否 | 系统级指令。 |
| `tools` | `Tool[]` | 否 | 可供模型调用的函数工具。 |

### InputItem

```ts
type InputItem =
  | Message
  | FunctionCall
  | FunctionCallOutput
  | CustomToolCall
  | CustomToolCallOutput;
```

### Message

```ts
interface Message {
  type: "message";
  role: "user" | "assistant" | "developer" | "system";
  content: Array<TextMessage | ImageMessage | FileMessage>;
}
```

`content` 是有序内容块数组，可在同一条消息中包含多个文本、图片或文件输入块。

### TextMessage

```ts
interface TextMessage {
  type: "input_text";
  text: string;
}
```

### ImageMessage

```ts
interface ImageMessage {
  type: "input_image";
  image_url: string;
}
```

### FileMessage

```ts
interface FileMessage {
  type: "input_file";
  file_url: string;
}
```

### FunctionCall

上一轮模型生成的函数调用，作为后续调用的上下文输入：

```ts
interface FunctionCall {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
}
```

`arguments` 是 JSON 字符串。

### FunctionCallOutput

本地函数执行结果：

```ts
interface FunctionCallOutput {
  type: "function_call_output";
  call_id: string;
  output: string;
}
```

`call_id` 用于关联 `FunctionCall`，`output` 是传回模型的字符串结果。

### CustomToolCall

上一轮模型生成的自由格式自定义工具调用：

```ts
interface CustomToolCall {
  type: "custom_tool_call";
  call_id: string;
  name: string;
  input: string;
}
```

### CustomToolCallOutput

自定义工具执行结果：

```ts
interface CustomToolCallOutput {
  type: "custom_tool_call_output";
  call_id: string;
  output: string;
}
```

## 工具类型

### Tool

```ts
type Tool = FunctionTool | CustomTool;
```

### FunctionTool

```ts
interface FunctionTool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
```

`parameters` 使用 JSON Schema 描述函数参数。

### CustomTool

```ts
interface CustomTool {
  type: "custom";
  name: string;
  description?: string;
}
```

自定义工具使用自由格式字符串作为输入。当前仅 Responses API 转换器支持该类型。

示例：

```ts
const tools: Tool[] = [{
  type: "function",
  name: "get_weather",
  description: "查询指定城市的天气",
  parameters: {
    type: "object",
    properties: {
      city: { type: "string", description: "城市名称" },
    },
    required: ["city"],
    additionalProperties: false,
  },
}];
```

## 响应类型

### Response

```ts
interface Response {
  id?: string;
  created_at: number;
  status: ResponseStatus;
  output: ResponseOutputItem[];
}
```

### ResponseStatus

```ts
type ResponseStatus =
  | "completed"
  | "failed"
  | "in_progress"
  | "cancelled"
  | "queued"
  | "incomplete";
```

### ResponseOutputItem

```ts
type ResponseOutputItem =
  | OutputMessage
  | Reasoning
  | ResponseFunctionCall
  | ResponseCustomToolCall;
```

### OutputMessage

```ts
interface OutputMessage {
  id?: string;
  type: "message";
  role: "assistant";
  content: TextContent | RefusalContent;
}
```

### TextContent

```ts
interface TextContent {
  type: "output_text";
  text: string;
}
```

### RefusalContent

```ts
interface RefusalContent {
  type: "refusal";
  refusal: string;
}
```

### Reasoning

```ts
interface Reasoning {
  id?: string;
  type: "reasoning";
  content: ReasoningText;
  summary: SummaryText;
}
```

### ReasoningText

```ts
interface ReasoningText {
  type: "reasoning_text";
  text: string;
}
```

### SummaryText

```ts
interface SummaryText {
  type: "summary_text";
  text: string;
}
```

### ResponseFunctionCall

模型选择执行的函数：

```ts
interface ResponseFunctionCall {
  id: string;
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
}
```

### ResponseCustomToolCall

模型选择执行的自定义工具：

```ts
interface ResponseCustomToolCall {
  id: string;
  type: "custom_tool_call";
  call_id: string;
  name: string;
  input: string;
}
```

## 规范化事件类型

### ResponseEventType

所有规范化事件名称的字符串联合：

```ts
type ResponseEventType = ResponseEvent["type"];
```

可能的值：

```ts
type ResponseEventType =
  | "response.created"
  | "response.completed"
  | "response.failed"
  | "response.incomplete"
  | "response.message_text.delta"
  | "response.message_refusal.delta"
  | "response.reasoning_text.delta"
  | "response.reasoning_summary_text.delta"
  | "response.function_call.added"
  | "response.function_call_arguments.delta"
  | "response.custom_tool_call.added"
  | "response.custom_tool_call_input.delta";
```

### ResponseEvent

```ts
type ResponseEvent =
  | ResponseCreated
  | ResponseCompleted
  | ResponseFailed
  | ResponseIncomplete
  | ResponseMessageTextDelta
  | ResponseMessageRefusalDelta
  | ResponseReasoningTextDelta
  | ResponseReasoningSummaryTextDelta
  | ResponseFunctionCallAdded
  | ResponseFunctionCallArgumentsDelta
  | ResponseCustomToolCallAdded
  | ResponseCustomToolCallInputDelta;
```

### 生命周期事件

```ts
interface ResponseCreated {
  type: "response.created";
  response: Response;
}

interface ResponseCompleted {
  type: "response.completed";
  response: Response;
}

interface ResponseFailed {
  type: "response.failed";
  response: Response;
}

interface ResponseIncomplete {
  type: "response.incomplete";
  sequence_number: number;
  response: Response;
}
```

### 文本增量事件

`index` 是相同输出类型中的零基索引，不一定等于供应商原始输出数组索引。

```ts
interface ResponseMessageTextDelta {
  type: "response.message_text.delta";
  index: number;
  delta: string;
}

interface ResponseMessageRefusalDelta {
  type: "response.message_refusal.delta";
  index: number;
  delta: string;
}

interface ResponseReasoningTextDelta {
  type: "response.reasoning_text.delta";
  index: number;
  delta: string;
}

interface ResponseReasoningSummaryTextDelta {
  type: "response.reasoning_summary_text.delta";
  index: number;
  delta: string;
}
```

### 函数调用事件

```ts
interface ResponseFunctionCallAdded {
  type: "response.function_call.added";
  function_call: ResponseFunctionCall;
}

interface ResponseFunctionCallArgumentsDelta {
  type: "response.function_call_arguments.delta";
  delta: string;
  index: number;
}

interface ResponseCustomToolCallAdded {
  type: "response.custom_tool_call.added";
  custom_tool_call: ResponseCustomToolCall;
}

interface ResponseCustomToolCallInputDelta {
  type: "response.custom_tool_call_input.delta";
  delta: string;
  index: number;
}
```

## 公共导出清单

### 运行时导出

- `Connector`
- `ResponsesAPIConverter`
- `ChatCompletionsConverter`
- `AnthropicConverter`

### 类型导出

- `ConnectorOptions`
- `Converter`
- `NormalizedParams`
- `Optional`
- `InputItem`
- `Message`
- `TextMessage`
- `ImageMessage`
- `FileMessage`
- `FunctionCall`
- `FunctionCallOutput`
- `CustomToolCall`
- `CustomToolCallOutput`
- `Tool`
- `FunctionTool`
- `CustomTool`
- `Response`
- `ResponseStatus`
- `ResponseOutputItem`
- `OutputMessage`
- `TextContent`
- `RefusalContent`
- `Reasoning`
- `ReasoningText`
- `SummaryText`
- `ResponseFunctionCall`
- `ResponseCustomToolCall`
- `ResponseEvent`
- `ResponseEventType`
- `ResponseCreated`
- `ResponseCompleted`
- `ResponseFailed`
- `ResponseIncomplete`
- `ResponseMessageTextDelta`
- `ResponseMessageRefusalDelta`
- `ResponseReasoningTextDelta`
- `ResponseReasoningSummaryTextDelta`
- `ResponseFunctionCallAdded`
- `ResponseFunctionCallArgumentsDelta`
- `ResponseCustomToolCallAdded`
- `ResponseCustomToolCallInputDelta`
