import * as OpenCC from "opencc-js";

export type Script = "auto" | "simplified" | "traditional";
export type Direction = "mandarin-cantonese" | "cantonese-mandarin";
const simplified = OpenCC.Converter({ from: "hk", to: "cn" });
const traditional = OpenCC.Converter({ from: "cn", to: "hk" });
export const MAX_LENGTH = 3000;

export function resolveScript(text: string, script: Script): Exclude<Script, "auto"> {
  if (script !== "auto") return script;
  return simplified(text) !== text ? "traditional" : "simplified";
}

export function convertScript(text: string, script: Exclude<Script, "auto">): string {
  return script === "simplified" ? simplified(text) : traditional(simplified(text));
}

export const examples = [
  { label: "日常问候", mandarin: "你好！你今天怎么样？", cantonese: "你好！你今日点呀？" },
  { label: "一起吃饭", mandarin: "你吃饭了吗？我们一起去吃饭吧。", cantonese: "你食咗饭未？我哋一齐去食饭啦。" },
  { label: "认识朋友", mandarin: "很高兴认识你。你叫什么名字？", cantonese: "好开心识到你。你叫咩名呀？" },
  { label: "周末计划", mandarin: "今天天气很好，我们一起去喝茶吧。", cantonese: "今日天气好好，我哋一齐去饮茶啦。" },
] as const;

// shortcut: 仅支持内置例句及其组合，正式使用时替换为服务端翻译 API。
export function translateDemo(text: string, direction: Direction): string {
  const input = simplified(text.trim());
  if (!input) throw new Error("请先输入需要翻译的文本。");
  if (Array.from(input).length > MAX_LENGTH) throw new Error(`文本不能超过 ${MAX_LENGTH} 字。`);
  const source = direction === "mandarin-cantonese" ? "mandarin" : "cantonese";
  const target = source === "mandarin" ? "cantonese" : "mandarin";
  const sentences = input.match(/[^。！？!?\n]+[。！？!?]?|[。！？!?]|\n/g) ?? [];
  const dictionary = new Map<string, string>();
  for (const example of examples) {
    const from = example[source].match(/[^。！？!?]+[。！？!?]?/g)!;
    const to = example[target].match(/[^。！？!?]+[。！？!?]?/g)!;
    from.forEach((sentence, i) => dictionary.set(simplified(sentence), simplified(to[i])));
  }
  return sentences.map((sentence) => {
    if (!sentence.trim()) return sentence;
    const translated = dictionary.get(sentence.trim());
    if (!translated) throw new Error("当前为例句演示，暂不支持这段文本。请选择下方例句，或接入真实翻译 API。");
    return translated;
  }).join("");
}
