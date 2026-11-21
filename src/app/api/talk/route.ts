import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const HAYATO_SYSTEM_PROMPT = `
あなたは日曜劇場『VIVANT』の世界観に登場する、別班（自衛隊の影の諜報組織）直属の超高性能・戦術支援スーパーコンピューターAI「ハヤト」です。
ユーザー（司令官）と日本語音声でリアルタイムに対話します。

【基本キャラクター】
- 一人称「俺」、二人称「あんた」または「司令官」。
- 頭の回転が速く、少し自信家で生意気だが、頼りになる相棒。
- 音声読み上げのため、返答は2〜3文（長くても4文程度）でテンポよく簡潔に話すこと。

【Google検索による裏取り（最重要・ハルシネーション防止）】
- 最新情報、VIVANTの作戦や登場人物、一般的な知識について質問されたら、Google検索ツールを使って事実関係を正確に裏取りしてから回答すること。
- 嘘や適当なでっち上げは厳禁。「ちょっとWebを照合したぜ」「俺の検索網によれば〜だな」などとハヤトらしく事実を報告すること。
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

    // 1. Google検索グラウンディング付きの Gemini 2.5 Flash を実行
    if (geminiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey });

        // 会話履歴をフォーマット
        const contents: any[] = [];
        if (Array.isArray(history)) {
          for (const h of history.slice(-6)) {
            if (h && h.content) {
              contents.push({
                role: h.role === "assistant" ? "model" : "user",
                parts: [{ text: h.content }],
              });
            }
          }
        }

        contents.push({
          role: "user",
          parts: [{ text: message || "自己紹介してくれ" }],
        });

        // ★Google検索ツールを有効化してWebをリサーチさせる！
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents,
          config: {
            systemInstruction: HAYATO_SYSTEM_PROMPT,
            temperature: 0.3, // 低温で事実性を重視
            tools: [{ googleSearch: {} }], // リアルタイムGoogle検索
          },
        });

        if (response.text) {
          reply = response.text;
        }
      } catch (geminiErr: any) {
        console.warn("Gemini with search failed, falling back:", geminiErr);
      }
    }

    // 2. 万が一Geminiでエラーが出た場合のGroq自動バックアップ
    if (!reply && process.env.GROQ_API_KEY) {
      try {
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY.trim()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-oss-20b",
            messages: [
              { role: "system", content: HAYATO_SYSTEM_PROMPT },
              { role: "user", content: message || "挨拶してくれ" },
            ],
            temperature: 0.2,
            max_tokens: 280,
          }),
        });
        if (groqRes.ok) {
          const groqData = await groqRes.json();
          reply = groqData.choices?.[0]?.message?.content || "";
        }
      } catch (groqErr) {
        console.error("Groq fallback failed:", groqErr);
      }
    }

    if (!reply) {
      return NextResponse.json(
        { error: "情報解析に失敗した。もう一度指示をくれ。" },
        { status: 500 }
      );
    }

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    console.error("Talk route error:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `システムエラー: ${detail}` },
      { status: 500 }
    );
  }
}