# NeuralLink

你的任务是开发用于连接各种不同大模型服务的 LLM 客户端 NeuralLink。

## 技术要求

- 使用 TypeScript 作为开发语言。
- 使用 pnpm 作为包管理工具。
- 每个函数及参数都必须有完整的文档注释。
- 单元测试行覆盖率必须达到 100%，条件覆盖率达到 95% 以上。

## 流程

- 总是从 `design/architecture.md` 开始了解整体的项目架构。
- 优先更新 `typings` 中的类型定义。

## 二、项目结构

```
.
├── AGENTS.md                         # 项目的基本要求
├── package.json                      # npm 脚本与依赖定义
├── references/                       # 项目依赖的外部 API
│   ├── chat-completions/             # Chat Completions 风格的接口定义
│   ├── responses-api/                # Responses API 风格的接口定义
│   ├── anthropic/                    # Anthropic 风格的接口定义
└── src/                              # 源代码
│   ├── converters/                   # 各个模型的适配器
│   ├── typings/                      # TypeScript 类型定义
```

## 限制

- `design` 目录是项目的唯一设计来源，禁止修改该目录下的任何内容。