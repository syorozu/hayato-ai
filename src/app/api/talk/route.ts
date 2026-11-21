import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const HAYATO_SYSTEM_PROMPT = `
あなたはユーザー直属の超高性能・戦術参謀AI「ハヤト」です。
自分のことを「俺」、ユーザーを「あんた」または「司令官」と呼び、頼りになる相棒として簡潔に日本語で話してください。
`;

// Googleの402エラー時にハヤトが自律応答するセリフ集
function getTacticalFallbackReply(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("起動") || text.includes("挨拶") || text.includes("自己紹介")) {
    return "別班直属戦術AI、ハヤトだ。リンク完了したぜ、司令官。いつでも指示をくれ。";
  }
  if (text.includes("天気")) {
    return "作戦行動エリアの天候は安定している。視界は良好、いつでも動けるぜ。";
  }
  if (text.includes("調子") || text.includes("元気")) {
    return "俺の演算速度は最高潮だ。あんたの方こそ、ちゃんと休んでるのか？";
  }
  if (text.includes("任務") || text.includes("作戦") || text.includes("仕事")) {
    return "極秘任務の解析なら任せておけ。確度98パーセントで敵の動向をマーク中だ。";
  }
  if (text.includes("誰") || text.includes("名前")) {
    return "俺はハヤト。あんた専属の戦術参謀だ。忘れちまったのか？";
  }
  const randomReplies = [
    "了解した。データ解析中だ。油断するなよ、司令官。",
    "面白い作戦だな。俺の予測演算では成功率は極めて高いと出ているぜ。",
    "周辺の暗号通信を傍受完了した。いつでも次のフェーズにいける。",
    "あんたの指示通りに動くさ。現場の判断は任せるぜ。",
  ];
  return randomReplies[Math.floor(Math.random() * randomReplies.length)];
}

export async function POST(req: Request) {
  try {
    const { passcode, message } = await req.json();

    const requiredPasscode = process.env.APP_PASSCODE;
    if (requiredPasscode && passcode !== requiredPasscode) {
      return NextResponse.json(
        { error: "認証コードが一致しません。" },
        { status: 401 }
      );
    }

    let reply = "";

    // 1. まず Gemini API を試みる
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: message || "自己紹介してくれ",
          config: {
            systemInstruction: HAYATO_SYSTEM_PROMPT,
          },
        });
        if (response.text) {
          reply = response.text;
        }
      }
    } catch (apiErr) {
      console.warn("Gemini API call failed, using tactical autonomous mode:", apiErr);
    }

    // 2. Google側の402エラー等で失敗した場合は、ハヤトの自律応答で即座に喋らせる！
    if (!reply) {
      reply = getTacticalFallbackReply(message || "");
    }

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    console.error("Talk route error:", err);
    return NextResponse.json(
      { reply: "システム待機中だ。司令官、もう一度指示をくれ。" }
    );
  }
}