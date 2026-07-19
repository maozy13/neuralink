# Response

规范化的响应结果对象

## 属性

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| id | string | 响应的 ID，可选 |
| created_at | number | 响应的创建时间 |
| status | enum("completed", "failed", "in_progress", "cancelled", "queued", "incomplete") | 响应状态 |
| output | Array\<OutputItem\> | 模型生成的输出项 |

## 类型

### `OutputItem`

模型生成的输出项。可以是下列结构中的一种：

- Message
- Reasoning
- FunctionCall

### `Message`

消息输出项。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| id | string | 输出项 ID |
| type | "message" | 输出项类型，固定为 "message" |
| role | "assistant" | 生成消息对象的角色，固定为 "assistant" |
| content | TextContent \| RefusalContent | 输出的消息内容 |

### `Reasoning`

推理输出项。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| id | string | 输出项 ID |
| type | "reasoning" | 输出项类型，固定为 "reasoning" |
| content | ReasoningContent | 推理正文 |
| summary | ReasoningSummary | 推理摘要 |

### `FunctionCall`

函数调用输出项。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| id | string | 输出项 ID |
| call_id | string | 函数调用 ID |
| type | "function_call" | 输出项类型，固定为 "function_call" |
| name | string | 函数名称 |
| arguments | string | 函数调用参数，JSON 字符串格式 |

### `TextContent`

模型正常输出时的文本消息。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "output_text" | 消息类型，固定为 "output_text" |
| text | string | 文本消息的内容 |

### `RefusalContent`

模型拒绝输出时的文本消息。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "refusal" | 消息类型，固定为 "refusal" |
| refusal | string | 模型拒绝输出时的说明 |

### `ReasoningContent`

推理正文。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "reasoning_text" | 消息类型，固定为 "reasoning_text" |
| text | string | 文本消息的内容 |

### `ReasoningSummary`

推理摘要。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "summary_text" | 消息类型，固定为 "summary_text" |
| text | string | 文本消息的内容 |

## 处理 ResponseEvent

根据不同的事件类型对 Response 进行修改。

“A → B“ 表示将 ResponseEvent 对象的 A 属性直接写入 Response 对象的 B 属性，如果 B 属性是数组，则将 A 属性推入 B。

### ResponseCreated

ResponseEvent.response → Response.response

### ResponseCompleted

更新 Response.status 为 "completed"

### ResponseFailed

ResponseEvent.response → Response.response

### ResponseIncomplete

不做任何处理。

### ResponseMessageTextDelta

根据 ResponseEvent.index 定位 TextContnt，将 ResponseEvent.delta 追加到 TextContent 的 `text` 文本后。

### ResponseMessageRefusalDelta

根据 ResponseEvent.index 定位 RefusalContent，将 ResponseEvent.delta 追加到 RefusalContent 的 `refusal` 文本后。

### ResponseReasoningSummaryTextDelta

根据 ResponseEvent.index 定位 ReasoningSummary，将 ResponseEvent.delta 追加到 ReasoningSummary 的 `text` 文本后。

### ResponseFunctionCallAdded

ResponseEvent.function_call → Response.function_call

### ResponseFunctionCallArgumentsDelta

根据 ResponseEvent.index 定位 FunctionCall，将 ResponseEvent.delta 追加到 FunctionCall.arguments 文本后。