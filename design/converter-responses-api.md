# ResponsesAPIConverter

ResponsesAPIConverter 负责在 Connector 和 Response API 风格的接口之间进行请求/响应的转换。

## 概述

Response API 的事件会返回 `type` 属性用来标识不同的事件类型。根据不同的事件类型我们需要定义对应的处理算子，每个算子接收 SourceEvent 并返回规范化后的 ResponseEvent。

- ResponseEvent 的定义参考：[response-event.md](response-event.md)
- Response API 风格接口参考： [OpenAI 官方文档](https://developers.openai.com/api/reference/resources/responses/index.md) 

## 处理算子

```mermaid
flowchart LR

Start([开始])
HandleEvent[处理 SourceEvent]
HasOperator{event.type 是否有对应算子}
CallOperator[调用算子]
YieldResult[返回 ResponseEvent]
HasMore{是否还有更多 SourceEvent}
End([结束])

Start --> HandleEvent --> HasOperator
HasOperator -- 是 --> CallOperator --> YieldResult
HasOperator -- 否 --> YieldResult
YieldResult --> HasMore
HasMore -- 是 --> HandleEvent
HasMore -- 否 --> End

```

如果事件类型没有对应的处理算子，则该事件类型暂不需要进行转换，打印原始的 SourceEvent 并跳过处理逻辑。

注意：算子只应该处理 SourceEvent 并返回 ResponseEvent，更新 ResponseEvent 的操作应该在 Connector 中进行。

以下处理算子根据 SourceEvent 的 `type` 属性来进行分类。

- `responses.created`

SourceEvent 示例：

```json
{
  "type": "response.created",
  "response": {
    "id": "resp_67ccfcdd16748190a91872c75d38539e09e4d4aac714747c",
    "created_at": 1741487325,
    "status": "in_progress",
  },
  "sequence_number": 1
}
```

映射方式：映射到 ResponseCreated 类型。

- `response.output_item.added`

SourceEvent 示例：

```json
{
  "type": "response.output_item.added",
  "output_index": 0,
  "item": {
    "id": "rs_6806bfca0b2481918a5748308061a2600d3ce51bdffd5476",
    "status": "in_progress",
    "type": "message",
    "role": "assistant",
    "content": []
  },
  "sequence_number": 1
}
```

映射方式：映射到 ResponseOutputItemAdded 类型。

- `response.content_part.added`

SourceEvent 示例：

```json
{
  "type": "response.content_part.added",
  "item_id": "rs_6806bfca0b2481918a5748308061a2600d3ce51bdffd5476",
  "part": {
    "type": "output_text",
    "text": ""
  },
  "sequence_number": 1
}
```

映射方式：映射到 ResponseContentPartAdded 类型。

- `response.output_text.delta`

SourceEvent 示例：

```json
{
  "type": "response.output_text.delta",
  "item_id": "rs_6806bfca0b2481918a5748308061a2600d3ce51bdffd5476",
  "delta": "好的",
  "sequence_number": 1
}
```

映射方式：映射到 ResponseOutputTextDelta 类型。

- `response.reasoning_summary_part.added`

SourceEvent 示例：

```json
{
  "type": "response.reasoning_summary_part.added",
  "item_id": "rs_6806bfca0b2481918a5748308061a2600d3ce51bdffd5476",
  "part": {
    "type": "summary_text",
    "text": ""
  },
  "sequence_number": 1
}
```

映射方式：映射到 ResponseReasoningSummaryPartAdded 类型。

- `response.reasoning_summary_text.delta`

SourceEvent 示例：

```json
{
  "type": "response.reasoning_summary_text.delta",
  "item_id": "rs_6806bfca0b2481918a5748308061a2600d3ce51bdffd5476",
  "delta": "用户",
  "sequence_number": 1
}
```

映射方式：映射到 ResponseReasoningSummaryTextDelta 类型。
