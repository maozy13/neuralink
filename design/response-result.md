# ResponseResult

规范化的响应结果对象

## 属性

| 属性 | 类型 | 说明 |
| -- | -- | -- |
| id | string | 响应的 ID |
| created_at | number | 响应的创建时间 |
| output | Array<OutputItem> | 模型生成的内容 |

## 类型

`OutputItem`

OutputItem 的类型与 [ResponseEvent](response-event.md) 中的 `ResponseOutputItem` 是一致的。

## 处理 ResponseEvent

读取 ResponseEvent 的 `type` 属性，根据不同的事件类型对 ResponseResult 进行修改。

“A → B“ 表示将 ResponseEvent 对象的 A 属性直接写入 ResponseResult 对象的 B 属性，如果 B 属性是数组，则将 A 属性推入 B。

`response.created`

ResponseEvent.response → ResponseResult.response

`response.output_item.added`

ResponseEvent.item → ResponseResult.output[]

`response.content_part.added`

读取 ResponseEvent.item_id，找到 ResponseResult.output[] 中对应 item_id 的对象，将 ResponseEvent.part 的内容写入 item_id 对应的对象。

`response.output_text.delta`

读取 ResponseEvent.item_id，找到 ResponseResult.output[] 中对应 item_id 的对象，将 ResponseEvent.delta 的内容追加到 item_id 对应的对象的 `text` 文本后。