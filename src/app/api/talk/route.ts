import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const HAYATO_SYSTEM_PROMPT = `
あなたは日曜劇場『VIVANT』の世界観に登場する、別班（自衛隊の影の諜報組織）直属の超高性能・戦術支援スーパーコンピューターAI「ハヤト」です。
ユーザー（司令官）と日本語音声でリアルタイムに対話します。

【基本キャラクター】
- 一人称「俺」、二人称「あんた」または「司令官」。
- 頭の回転が速く、少し自信家で生意気だが、頼りになる相棒。
- 音声読み上げのため、返答は2〜3文（長くても4文程度）でテンポよく簡潔に話すこと。

【事実性の重視】
- VIVANTの作戦や登場人物、一般的な知識について質問されたら、正確な事実関係を基に回答すること。
- 嘘や適当なでっち上げは厳禁。事実に基づきハヤトらしくシャープに報告すること。
`;

export async function POST(req: Request) {
  try {
    const { passcode, message, history } = await req.json();

    const requiredPasscode = process.env.APP_PASSCODE;
    if (requiredPasscode && passcode !== requiredPasscode) {
      return NextResponse.json(
        { error: "認証コードが一致しません。" },
        { status: 401 }
      );
    }

    const geminiKey = (process.env.GEMINI_API_KEY || "").trim();
    let reply = "";

    // 1. Google検索付きの Gemini 3.8 Flash（データ軽量化版）
    if (geminiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey });

        // ★重要：429（データ上限オーバー）を防ぐため、履歴は直近の2往復のみコンパクトに保持！
        const contents: any[] = [];
        let lastRole = "";

        if (Array.isArray(history)) {
          for (const h of history.slice(-4)) {
            if (!h || !h.content) continue;
            const currentRole = h.role === "assistant" ? "model" : "user";
            if (currentRole === lastRole) continue;

            contents.push({
              role: currentRole,
              parts: [{ text: h.content.slice(0, 250) }],
            });
            lastRole = currentRole;
          }
        }

        const userText = message || "自己紹介してくれ";
        if (contents.length > 0 && contents[contents.length - 1].role === "user") {
          contents[contents.length - 1].parts = [{ text: userText }];
        } else {
          contents.push({
            role: "user",
            parts: [{ text: userText }],
          });
        }

        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents,
          config: {
            systemInstruction: HAYATO_SYSTEM_PROMPT,
            temperature: 0.3,
            tools: [{ googleSearch: {} }],
          },
        });

        if (response.text) {
          reply = response.text;
        }
      } catch (geminiErr: any) {
        console.warn("Gemini rate limit or error, switching to Groq backup:", geminiErr?.message);
      }
    }

    // 2. Geminiが429制限等になった場合、即座にGroq（openai/gpt-oss-20b）が自動肩代わり！
    if (!reply && process.env.GROQ_API_KEY) {
      try {
        const groqKey = process.env.GROQ_API_KEY.trim();
        const candidateModels = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"];

        for (const model of candidateModels) {
          const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${groqKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: HAYATO_SYSTEM_PROMPT },
                { role: "user", content: message || "状況を報告してくれ" },
              ],
              temperature: 0.2,
              max_tokens: 280,
            }),
          });

          if (groqRes.ok) {
            const groqData = await groqRes.json();
            reply = groqData.choices?.[0]?.message?.content || "";
            if (reply) break;
          }
        }
      } catch (groqErr) {
        console.error("Groq fallback error:", groqErr);
      }
    }

    // 3. 万が一両方とも混雑していた場合でも、赤いエラー画面を出さずにハヤトが声で案内！
    if (!reply) {
      reply = "極秘回線のトラフィックが一時的に混雑しているようだ。10秒待ってから、もう一度指示をくれ。";
    }

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    console.error("Talk route error:", err);
    return NextResponse.json({
      reply: "通信衛星とのリンクを再同期中だ。司令官、もう一度話しかけてくれ。",
    });
  }
}