# ResponseEvent

规范化的事件对象，所有 Converter 都必须将从模型 API 服务中接收到的 SourceEvent 转换为 ResponseEvent

## ResponseEvent 数据结构

ResponseEvent 可以是下列结构中的一种：

- ResponseCreated
- ResponseCompleted
- ResponseFailed
- ResponseIncomplete
- ResponseMessageTextDelta
- ResponseMessageRefusalDelta
- ResponseReasoningTextDelta
- ResponseReasoningSummaryTextDelta
- ResponseFunctionCallAdded
- ResponseFunctionCallArgumentsDelta
- ResponseCustomToolCallAdded
- ResponseCustomToolCallInputDelta

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

增量生成正文消息。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.message_text.delta" | 事件类型，固定为 "response.message_text.delta" |
| index | number | 增量文本所属正文消息的索引，当模型输出多个正文消息时用于定位 |
| delta | string | 正文消息增量文本 |

### ResponseMessageRefusalDelta

增量生成拒绝消息。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.message_refusal.delta" | 事件类型，固定为 "response.message_refusal.delta" |
| index | number | 增量文本所属拒绝消息的索引，当模型输出多个拒绝消息时用于定位 |
| delta | string | 拒绝消息增量文本 |

### ResponseReasoningTextDelta

增量生成推理正文。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.reasoning_text.delta" | 事件类型，固定为 "response.reasoning_text.delta" |
| index | number | 增量文本所属推理正文的索引，当模型输出多个推理正文时用于定位 |
| delta | string | 推理正文增量文本 |

### ResponseReasoningSummaryTextDelta

增量生成推理摘要。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.reasoning_summary_text.delta" | 事件类型，固定为 "response.reasoning_summary_text.delta" |
| index | number | 增量文本所属推理摘要的索引，当模型输出多个推理摘要时用于定位 |
| delta | string | 推理摘要增量文本 |

### ResponseFunctionCallAdded

模型从 tools 中选择了自定义函数。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.function_call.added" | 事件类型，固定为 "response.function_call.added" |
| function_call | FunctionCall | 模型选择的函数。 `arguments` 初始为空字符串，在后续 ResponseFunctionCallArgumentsDelta 中进行增量拼接。 |

### ResponseCustomToolCallAdded

模型从 tools 中选择了自定义代码执行工具。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.custom_tool_call.added" | 事件类型，固定为 "response.custom_tool_call.added" |
| custom_tool_call | CustomToolCall | 模型选择的执行方法。 `input` 初始为空字符串，在后续 ResponseCustomToolCallInputDelta 中进行增量拼接。 |

### ResponseFunctionCallArgumentsDelta

增量生成函数调用参数。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.function_call_arguments.delta" | 事件类型，固定为 "response.function_call_arguments.delta" |
| index | number | 增量文本所属的函数的索引，当模型输出多个函数时用于定位 |
| delta | string | 函数调用参数增量文本 |

### ResponseCustomToolCallInputDelta

增量生成可执行代码。

**属性：**

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| type | "response.custom_tool_call_input.delta" | 事件类型，固定为 "response.custom_tool_call_input.delta" |
| index | number | 增量代码所属的代码块索引，当模型输出多段代码时用于定位 |
| delta | string | 模型生成的增量代码 |

## 类型

### Response

规范化的响应结果对象，参考[response.md](response.md)。