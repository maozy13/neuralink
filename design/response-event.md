# ResponseEvent

规范化的事件对象，所有 Converter 都必须将从模型 API 服务中接收到的 SourceEvent 转换为 ResponseEvent

## ResponseEvent 数据结构

ResponseEvent 可以是下列结构中的一种：

- ResponseCreated
- ResponseCompleted
- ResponseFailed
- ResponseIncomplete
- ResponseOutputItemAdded
- ResponseOutputItemDone
- ResponseContentPartAdded
- ResponseContentPartDone
- ResponseOutputTextDelta
- ResponseOutputTextDone

`ResponseCreated`

响应流已创建，准备开始输出。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.created" | 事件类型，固定为 "response.created" |
| sequence_number | number | 事件的顺序号 |
| response | ResponseMetadata | 响应的元数据 |

`ResponseCompleted`

响应流输出完成。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.completed" | 事件类型，固定为 "response.completed" |
| sequence_number | number | 事件的顺序号 |
| response | ResponseMetadata | 响应的元数据 |

`ResponseFailed`

响应流输出失败。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.failed" | 事件类型，固定为 "response.failed" |
| sequence_number | number | 事件的顺序号 |
| response | ResponseMetadata | 响应的元数据 |

`ResponseIncomplete`

响应流输出中断

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.incomplete" | 事件类型，固定为 "response.incomplete" |
| sequence_number | number | 事件的顺序号 |
| response | ResponseMetadata | 响应的元数据 |

`ResponseOutputItemAdded`

增加新的输出对象。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.output_item.added" | 事件类型，固定为 "response.output_item.added" |
| sequence_number | number | 事件的顺序号 |
| item | ResponseOutputItem | 输出对象 |

`ResponseOutputItemDone`

对象输出完成，`item` 属性将一次返回该对象的完整信息。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.output_item.done" | 事件类型，固定为 "response.output_item.done" |
| sequence_number | number | 事件的顺序号 |
| item | ResponseOutputItem | 输出对象 |

`ResponseContentPartAdded`

向某个对象中新增部分属性。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.content_part.added" | 事件类型，固定为 "response.content_part.added" |
| sequence_number | number | 事件的顺序号 |
| item_id | string | 目标对象的 ID |
| part | TextContent \| RefusalContent | 对象的内容 |

`ResponseContentPartDone`

对象新增部分内容生成完成。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.content_part.done" | 事件类型，固定为 "response.content_part.done" |
| sequence_number | number | 事件的顺序号 |
| item_id | string | 目标对象的 ID |
| part | TextContent \| RefusalContent | 对象的新增部分的完整内容 |

`ResponseOutputTextDelta`

文本增量输出。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.output_text.delta" | 事件类型，固定为 "response.output_text.delta" |
| sequence_number | number | 事件的顺序号 |
| item_id | string | 目标对象的 ID |
| delta | string | 增量的文本内容 |

`ResponseOutputTextDone`

文本增量输出完成。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.output_text.done" | 事件类型，固定为 "response.output_text.done" |
| sequence_number | number | 事件的顺序号 |
| item_id | string | 目标对象的 ID |
| text | string | 完整的文本内容 |

`ResponseMetadata`

响应的元数据。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| id | string | 响应的 ID，属于同一次响应的一连串事件共享同一个 ID |
| created_at | number | 响应的创建时间 |
| error | ResponseError | 响应的创建时间 |

`ResponseError`

响应的错误信息。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| code | string | 错误码 |
| message | string | 错误信息 |

`ResponseOutputItem`

输出对象的类型。可以是下列结构中的一种：

- Message
- Reasoning

`Message`

输出的消息对象

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| id | string | 消息 ID |
| type | "message" | 对象类型，固定为 "message" |
| role | "assistant" | 生成消息对象的角色，固定为 "assistant" |
| content | TextContent \| RefusalContent | 输出的文本内容 |

`Reasoning`

推理消息。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| id | string | 消息 ID |
| type | "reasoning" | 对象类型，固定为 "reasoning" |
| content | ReasoningContent | 输出的推理内容 |
| summary | ReasoningSummary | 输出的推理摘要 |

`TextContent`

输出的文本消息。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "output_text" | 消息类型，固定为 "output_text" |
| text | string | 文本消息的内容 |

`ReasoningContent`

输出的推理消息。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "reasoning_text" | 消息类型，固定为 "reasoning_text" |
| text | string | 文本消息的内容 |

`ReasoningSummary`

输出的推理摘要消息。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "summary_text" | 消息类型，固定为 "summary_text" |
| text | string | 文本消息的内容 |

`RefusalContent`

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "refusal" | 消息类型，固定为 "refusal" |
| refusal | string | 模型拒绝输出时的说明 |