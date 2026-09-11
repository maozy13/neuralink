import { Connector, ResponsesAPIConverter, type FunctionCallOutput, type ResponseFunctionCall } from "@maozy13/neuralink";

/** Node.js runtime values used by the demo without requiring Node type declarations. */
interface DemoRuntime {
  process?: {
    env: Record<string, string | undefined>;
    exitCode?: number;
  };
}

const runtime = globalThis as typeof globalThis & DemoRuntime;
const apiKey = runtime.process?.env.ARK_API_KEY;

/**
 * Calls the configured Responses API and prints each event and the final result.
 * @returns A promise that resolves after the response stream has ended.
 */
async function main(): Promise<void> {
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("请先设置 ARK_API_KEY 环境变量");
  }

  const connector = new Connector(
    "https://ark.cn-beijing.volces.com/api/v3/responses",
    apiKey,
    new ResponsesAPIConverter(),
  );
  const tools = createWeatherTools();
  const firstResponse = await consume(connector.call(
    "doubao-seed-evolving",
    "请并行调用两个天气工具，分别查询上海和北京天气，然后汇总回答。",
    { tools },
  ));
  const functionCalls = firstResponse.output.filter(
    (item): item is ResponseFunctionCall => item.type === "function_call",
  );
  if (functionCalls.length !== 2) throw new Error(`预期两个天气工具调用，实际收到 ${functionCalls.length} 个`);
  const functionOutputs = functionCalls.map((call): FunctionCallOutput => ({
    type: "function_call_output", call_id: call.call_id, output: JSON.stringify(getWeather(call.name)),
  }));
  const finalResponse = await consume(connector.call(
    "doubao-seed-evolving",
    [...functionCalls, ...functionOutputs],
    { tools },
  ));
  console.log("\nResponses API 最终 Response:");
  console.log(JSON.stringify(finalResponse, null, 2));
}

/**
 * Consumes and prints one model response stream.
 * @param response Response stream to consume.
 * @returns The accumulated response returned by the stream.
 */
async function consume(
  response: ReturnType<Connector<unknown, unknown>["call"]>,
): Promise<import("@maozy13/neuralink").Response> {
  let eventCount = 0;

  while (true) {
    const next = await response.next();
    if (next.done) {
      console.log(`\n完成，共收到 ${eventCount} 个规范化事件。`);
      console.log("Response:");
      console.log(JSON.stringify(next.value, null, 2));
      return next.value;
    }

    eventCount += 1;
    if ("delta" in next.value) {
      console.log(`${next.value.type}: ${JSON.stringify(next.value.delta)}`);
    } else if (next.value.type === "response.function_call.added") {
      console.log(`${next.value.type}: ${JSON.stringify(next.value.function_call)}`);
    } else {
      console.log(`${next.value.type}: ${JSON.stringify(next.value.response)}`);
    }
  }
}

/**
 * Provides deterministic mock weather data for the model-selected city.
 * @param name Name of the selected city-specific weather tool.
 * @returns A simple weather query result.
 */
function getWeather(name: string): { city: string; weather: string; temperature: string } {
  if (name === "get_shanghai_weather") return { city: "上海", weather: "多云", temperature: "28°C" };
  if (name === "get_beijing_weather") return { city: "北京", weather: "晴", temperature: "26°C" };
  throw new Error(`未知天气工具：${name}`);
}

/**
 * Creates the two no-argument weather tools used by the parallel-call demo.
 * @returns Shanghai and Beijing weather tool definitions.
 */
function createWeatherTools(): Array<{ type: "function"; name: string; description: string; parameters: Record<string, unknown> }> {
  const parameters = { type: "object", properties: {}, additionalProperties: false };
  return [
    { type: "function", name: "get_shanghai_weather", description: "查询上海当前天气", parameters },
    { type: "function", name: "get_beijing_weather", description: "查询北京当前天气", parameters },
  ];
}

try {
  await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  if (runtime.process !== undefined) runtime.process.exitCode = 1;
}
