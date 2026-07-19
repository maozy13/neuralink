# ResponseEvent

规范化的事件对象，所有 Converter 都必须将从模型 API 服务中接收到的 SourceEvent 转换为 ResponseEvent

## ResponseEvent 数据结构

ResponseEvent 可以是下列结构中的一种：

- ResponseCreated
- ResponseCompleted
- ResponseFailed
- ResponseIncomplete
- ResponseMessageTextDelta
- ResponseReasoningSummaryTextDelta
- ResponseFunctionCallAdded
- ResponseFunctionCallArgumentsDelta

### ResponseCreated

响应对象已创建，准备开始生成。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.created" | 事件类型，固定为 "response.created" |
| response | Response | 包含部分元数据和内容的响应对象 |

### ResponseCompleted

响应对象生成完成。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.completed" | 事件类型，固定为 "response.completed" |
| response | Response | 完整的响应对象 |

### ResponseFailed

响应对象生成失败。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.failed" | 事件类型，固定为 "response.failed" |
| response | Response | 包含错误信息的响应对象 |

### ResponseIncomplete

响应对象生成过程中发生中断。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.incomplete" | 事件类型，固定为 "response.incomplete" |
| sequence_number | number | 事件的顺序号 |
| response | Response | 部分生成的响应对象 |

### ResponseMessageTextDelta

增量生成部分消息正文内容。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.message_text.delta" | 事件类型，固定为 "response.message_text.delta" |
| delta | string | 增量的消息正文 |

### ResponseMessageRefusalDelta

增量生成部分消息正文内容。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.message_refusal.delta" | 事件类型，固定为 "response.message_refusal.delta" |
| delta | string | 增量的消息正文 |

### ResponseReasoningSummaryTextDelta

增量生成部分推理摘要内容。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.reasoning_summary_text.delta" | 事件类型，固定为 "response.reasoning_summary_text.delta" |
| delta | string | 增量的推理摘要文本 |

### ResponseFunctionCallAdded

模型从 tools 中选择了自定义函数。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.function_call.added" | 事件类型，固定为 "response.function_call.added" |
| function_call | FunctionCall | 模型选择的函数。 `arguments` 初始为空字符串，在后续 ResponseFunctionCallArgumentsDelta 中进行增量拼接。 |

### ResponseFunctionCallArgumentsDelta

增量生成自定义函数调用参数。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.function_call_arguments.delta" | 事件类型，固定为 "response.function_call_arguments.delta" |
| delta | string | 增量的函数调用参数 |
| index | number | 增量参数所属的函数的下标，并行调用多函数时需要根据 index 确定参数增量到哪个函数 |

## 类型

### Response

规范化的响应结果对象，参考[response.md](response.md)。