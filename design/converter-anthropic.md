# AnthropicConverter

AnthropicConverter 负责在 Connector 和 Anthropic 风格的接口之间进行请求/响应的转换。

## toAPI

### tools

Anthropic 的 tools 结构和规范化的 Function 结构有所不同。

Anthropic 接收的 tools 示例如下：

```json
[
    {
        "name": "get_weather",
        "description": "查询各地天气",
        "input_schema": {
            "type": "object",
            "properties": {
                "city": {
                    "type": "string"
                }
            }
        }
    }
]
```

在调用 API 时，需要将 `Function.parameters` 映射为 `input_schema`。

## fromEvent

Anthropic API 的事件会返回 `type` 属性用来标识不同的事件类型，但输出推理内容和正文内容共享同一个 `content_block_delta` 事件，并根据事件的 `delta.type` 来进行区分。 

根据不同的事件类型我们需要定义对应的映射算子，每个算子接收 SourceEvent 并返回规范化后的 ResponseEvent。

如果事件类型没有对应的映射算子，则该事件类型暂不需要进行转换，打印原始的 SourceEvent 并跳过映射逻辑。

注意：算子只应该处理 SourceEvent 并返回 ResponseEvent，更新 Response 的操作应该在 Connector 中进行。

以下是根据 SourceEvent 的 `type` 属性来进行分类的映射逻辑：

### `message_start`

SourceEvent 示例：

```json
{
    "type": "message_start",
    "message": {
        "id": "c7a61f4c-5cae-49c8-955b-36d0576550d1",
        "type": "message",
        "role": "assistant",
        "model": "deepseek-v4-flash",
        "content": [],
        "stop_reason": null,
        "stop_sequence": null,
        "usage": {
            "input_tokens": 281,
            "cache_creation_input_tokens": 0,
            "cache_read_input_tokens": 0,
            "output_tokens": 0,
            "service_tier": "standard"
        }
    }
}

```

映射到 ResponseCreated 事件，并设置 status 为 "in_progress"。

### `content_block_start`

content_block_start 表示内容块的开始，推理、正文、函数都使用该事件，通过 `content_block.type` 来区分。

我们只需要处理 `content_block.type` 为 "tool_use" 的函数调用场景，忽略推理和正文场景。

SourceEvent 示例：

```json
{
    "type": "content_block_start",
    "index": 2,
    "content_block": {
        "type": "tool_use",
        "id": "call_00_yflWjT1qfapRkPBcjCbl9988",
        "name": "get_weather",
        "input": {}
    }
}
```

映射到 ResponseFunctionCallAdded 事件，注意：

- `SourceEvent.content_block.id` 映射到 `function_call.call_id`。
- 忽略 `SourceEvent.content_block.input`，后续在 ResponseFunctionCallArgumentsDelta 事件中再进行 arguments 增量。

### `content_block_delta`

Anthropic 的推理、正文、函数调用的增量都是通过 `content_block_delta` 事件 + `delta.type` 来定义的。

#### 推理

SourceEvent 示例：

```json
{
    "type": "content_block_delta",
    "index": 0,
    "delta": {
        "type": "thinking_delta",
        "thinking": "用户"
    }
}
```

- 如果 `delta.type` 是 "thinking_delta"，则映射到 ResponseReasoningSummaryTextDelta 事件。

#### 正文

```json
{
    "type": "content_block_delta",
    "index": 0,
    "delta": {
        "type": "text_delta",
        "text": "用户"
    }
}
```

- 如果 `delta.type` 是 "text_delta"，则映射到 ResponseMessageTextDelta 事件。

#### 函数调用

```json
{
    "type": "content_block_delta",
    "index": 0,
    "delta": {
        "type": "input_json_delta",
        "partial_json": "{"
    }
}
```

- 如果 `delta.type` 是 "input_json_delta"，则映射到 ResponseFunctionCallArgumentsDelta 事件。
- 根据 `index` 定位要追加参数的函数。

### `message_stop`

SourceEvent 示例：

```json
{
    "type": "message_stop"
}
```
映射到 ResponseCompleted 事件并设置 status 为 "completed"。