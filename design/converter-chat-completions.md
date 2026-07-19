# ChatCompletionsConverter

ChatCompletionsConverter 负责在 Connector 和 Chat Completions 风格的接口之间进行请求/响应的转换。

## toAPI(params: NormalizedParams) RequestParams

### tools

Chat Completions 的 tools 结构和规范化的 Function 结构有所不同。

Chat Completions 接收的 tools 示例如下：

```json
[
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "查询各地天气",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string"
                    }
                }
            }
        }
    }
]
```

在调用 API 时，需要增加一层 `function` 对象，将 `name`、`description`、`parameters` 映射到 `function` 内。

### 工具结果回传

工具调用结果回传时，必须带上 function_call 阶段生成的 `call_id`，且 `role` 必须设置为 "tool"。

结构示例：

```json
{
    "role": "tool",
    "tool_call_id": "call_00_68O2roBu1oQa8DGWCvft7758",
    "content": "{ \"weather\": \"clear\", ... }"
}
```

## fromEvent(event: SourceEvent, response: Response) ResponseEvent

Chat Completions 的事件没有 type 标识不同的事件类型，因此需要根据 `choices[0]` 的**内容**来判断事件类型。根据不同的事件类型我们需要定义对应的映射算子，每个算子接收 SourceEvent 并返回规范化后的 ResponseEvent。

如果事件类型没有对应的处理算子，则该事件类型暂不需要进行转换，打印原始的 SourceEvent 并跳过处理逻辑。

注意：算子只应该处理 SourceEvent 并返回 ResponseEvent，更新 Response 的操作应该在 Connector 中进行。

## SourceEvent 映射规则

### 正文和推理

SourceEvent 示例：

```json
{
    "choices": [
        {
            "delta": {
                "reasoning_content": "用户",
                "role": "assistant"
            },
            "index": 0
        }
    ],
    "created": 1784279490,
    "id": "021784279488422b686cf77507a74aa4905f351832e6617ebd482"
}
```

映射规则：

1. 如果是 event 序列的第一条，输出一次 ResponseCreated 事件。
2. 对所有序列（包括第一条）：
    - 如果存在 choices[0].delta.reasoning_content 则映射为 ResponseReasoningSummaryTextDelta。
    - 如果存在 choices[0].delta.content 则映射为 ResponseMessageTextDelta。
3. 将 [DONE] 事件映射为 ResponseCompleted

### 工具调用

Chat Completions 根据 SourceEvent 是否存在 `choices[0].delta.tool_calls[].id` 来区分是 ResponseFunctionCallAdded 事件还是 ResponseFunctionCallArgumentsDelta 事件：

- 当存在 `choices[0].delta.tool_calls[].id` 时，将以下 SourceEvent 示例结构映射到 ResponseFunctionCallAdded ：

```json
{
    "choices": [
        {
            "delta": {
                "content": "",
                "role": "assistant",
                "tool_calls": [
                    {
                        "function": {
                            "arguments": "",
                            "name": "get_weather"
                        },
                        "id": "call_536wgcee2opxixsakr10gq0y",
                        "index": 0,
                        "type": "function"
                    }
                ]
            },
            "index": 0
        }
    ]
}
```

- 当不存在 `choices[0].delta.tool_calls[].id` 时，将以下 SourceEvent 示例结构映射到 ResponseFunctionCallArgumentsDelta ：

```json
{
    "choices": [
        {
            "delta": {
                "content": "",
                "role": "assistant",
                "tool_calls": [
                    {
                        "function": {
                            "arguments": "{\"city\": \""
                        },
                        "index": 0
                    }
                ]
            },
            "index": 0
        }
    ]
}
```

