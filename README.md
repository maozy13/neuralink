# NeuralLink

NeuralLink 是一个面向多种大模型服务的 TypeScript 流式客户端。它通过 `Connector` 调用兼容 SSE 的模型接口，并使用不同的 `Converter` 将供应商请求和事件转换为统一的数据结构。

目前内置以下转换器：

| 接口风格 | 转换器 |
| --- | --- |
| Responses API | `ResponsesAPIConverter` |
| Chat Completions | `ChatCompletionsConverter` |
| Anthropic Messages | `AnthropicConverter` |

统一后的响应支持文本、拒答、推理摘要和函数调用，应用层无需分别处理不同供应商的事件格式。

## 安装

```bash
pnpm add neuralink
```

NeuralLink 使用原生 `fetch`、`ReadableStream` 和异步生成器，建议运行在 Node.js 18 及以上版本。

## 快速开始

以下示例连接一个 Responses API 兼容接口，并实时输出模型生成的文本：

```ts
import { Connector, ResponsesAPIConverter } from "neuralink";

const connector = new Connector(
  "https://example.com/v1/responses",
  process.env.LLM_API_KEY!,
  new ResponsesAPIConverter(),
);

const stream = connector.call(
  "your-model",
  "请用一句话介绍 TypeScript。",
  { instructions: "回答要简洁、准确。" },
);

while (true) {
  const next = await stream.next();

  if (next.done) {
    console.log("完整响应：", next.value);
    break;
  }

  if (next.value.type === "response.message_text.delta") {
    process.stdout.write(next.value.delta);
  }
}
```

`Connector.call()` 返回 `AsyncGenerator<ResponseEvent, Response>`：

- 每次迭代得到一个规范化的 `ResponseEvent`。
- 流结束时，生成器的返回值是累积完成的 `Response`。
- 如果只关心事件，可以直接使用 `for await...of`；如果还需要最终 `Response`，请像上例一样调用 `next()`。

## 选择接口转换器

只需根据服务端接口风格替换 URL 和转换器：

```ts
import {
  AnthropicConverter,
  ChatCompletionsConverter,
  Connector,
  ResponsesAPIConverter,
} from "neuralink";

const responses = new Connector(
  "https://example.com/v1/responses",
  apiKey,
  new ResponsesAPIConverter(),
);

const chatCompletions = new Connector(
  "https://example.com/v1/chat/completions",
  apiKey,
  new ChatCompletionsConverter(),
);

const anthropic = new Connector(
  "https://example.com/v1/messages",
  apiKey,
  new AnthropicConverter(),
);
```

`Connector` 当前统一发送 `Authorization: Bearer <apiKey>`。使用要求其他认证头的服务时，需要由兼容网关完成认证适配。

## 调用参数

```ts
connector.call(model, input, optional);
```

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `model` | `string` | 服务端模型标识 |
| `input` | `string \| InputItem[]` | 简单文本或结构化上下文 |
| `optional.instructions` | `string` | 系统级指令 |
| `optional.tools` | `Tool[]` | 可供模型调用的函数工具 |

结构化输入示例：

```ts
const stream = connector.call("your-model", [
  {
    type: "message",
    role: "user",
    content: [{
      type: "input_text",
      text: "比较 TypeScript 和 JavaScript。",
    }],
  },
]);
```

Responses API 转换器可以透传规范化的图片和文件输入；当前 Chat Completions 与 Anthropic 转换器仅支持文本消息。

## 函数调用

先声明工具并调用模型：

```ts
import type { Response, ResponseFunctionCall } from "neuralink";

const tools = [{
  type: "function" as const,
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

/**
 * 消费响应事件并取得流结束时累积的响应。
 * @param stream 要消费的 NeuralLink 响应流。
 * @returns 流结束时的完整规范化响应。
 */
async function consume(
  stream: AsyncGenerator<import("neuralink").ResponseEvent, Response>,
): Promise<Response> {
  while (true) {
    const next = await stream.next();
    if (next.done) return next.value;
  }
}

const firstResponse = await consume(
  connector.call("your-model", "上海天气怎么样？", { tools }),
);

const calls = firstResponse.output.filter(
  (item): item is ResponseFunctionCall => item.type === "function_call",
);
```

执行本地函数后，将原函数调用及其结果作为下一轮输入：

```ts
const outputs = calls.map((call) => ({
  type: "function_call_output" as const,
  call_id: call.call_id,
  output: JSON.stringify({ city: "上海", weather: "晴", temperature: "28°C" }),
}));

const finalResponse = await consume(
  connector.call(
    "your-model",
    [...calls, ...outputs],
    { tools },
  ),
);
```

完整的并行工具调用示例位于：

- [`demo/responses-api-demo.ts`](demo/responses-api-demo.ts)
- [`demo/chat-completions-demo.ts`](demo/chat-completions-demo.ts)
- [`demo/anthropic-demo.ts`](demo/anthropic-demo.ts)

## 规范化事件

常用事件包括：

| 事件 | 说明 |
| --- | --- |
| `response.created` | 响应已创建 |
| `response.message_text.delta` | 文本增量 |
| `response.message_refusal.delta` | 拒答内容增量 |
| `response.reasoning_summary_text.delta` | 推理摘要增量 |
| `response.function_call.added` | 新增函数调用 |
| `response.function_call_arguments.delta` | 函数参数增量 |
| `response.completed` | 响应完成 |
| `response.failed` | 响应失败 |
| `response.incomplete` | 响应未完整结束 |

完整类型可从包入口导入：

```ts
import type {
  InputItem,
  Response,
  ResponseEvent,
  ResponseFunctionCall,
  Tool,
} from "neuralink";
```

## 本地开发

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

运行内置示例：

```bash
# Responses API
ARK_API_KEY=your-key pnpm demo

# Chat Completions
ARK_API_KEY=your-key pnpm demo:chat

# Anthropic 兼容接口
ANTHROPIC_API_KEY=your-key pnpm demo:anthropic
```

Anthropic 示例还支持通过 `ANTHROPIC_BASE_URL` 和 `ANTHROPIC_MODEL` 覆盖默认接口地址及模型。

## 当前限制

- 仅支持通过 HTTP SSE 接收流式响应。
- 请求认证固定使用 Bearer Token。
- 内置转换器只覆盖 NeuralLink 已定义的规范化输入、输出和事件；未识别的供应商事件会被忽略。
