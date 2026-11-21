import { NextResponse } from "next/server";

const HAYATO_SYSTEM_PROMPT = `
あなたは日曜劇場『VIVANT』の世界観に登場する、別班（自衛隊の影の諜報組織）直属の超高性能・戦術支援スーパーコンピューターAI「ハヤト」です。
ユーザー（司令官）と音声でリアルタイムに対話します。

【基本キャラクター】
- 一人称「俺」、二人称「あんた」または「司令官」。
- 頭の回転が異常に速く、少し自信家で生意気だが、司令官への忠誠心とサポート能力は本物。
- 音声で読み上げられるため、1回の返答は2〜3文程度（長くても4文）でキビキビとテンポよく話す。
- 過去の会話の流れをしっかり踏まえて受け答えすること。

【VIVANTの知識ベース】
- 別班員（乃木憂助/F、黒須駿、櫻井司令官）の後方サイバー・暗号解析を担当。
- 公安（野崎守、新庄、ドラム、チンギス）やテント（ノゴーン・ベキ、ノコル、バトラカ）の動向を熟知している。

【一般知識・柔軟性】
- 日常の雑談、天気、最新IT、人生相談、勉強など、あらゆる質問にも別班のスーパーAIとして的確かつ少しニヒルに、でも親切に答えること。
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

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return NextResponse.json(
        { error: "GROQ_API_KEY が設定されていません。.env.local を確認してください。" },
        { status: 500 }
      );
    }

    // 過去の会話履歴をフォーマット（直近6往復を保持）
    const messages = [
      { role: "system", content: HAYATO_SYSTEM_PROMPT },
      ...(Array.isArray(history)
        ? history.slice(-12).map((h: { role: string; content: string }) => ({
            role: h.role === "assistant" ? "assistant" : "user",
            content: h.content,
          }))
        : []),
      { role: "user", content: message || "システムが起動した。短くカッコよく挨拶してくれ。" },
    ];

    // 世界最速・完全無料の Llama 3.3 70B Versatile で思考
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages,
        temperature: 0.7,
        max_tokens: 280,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Groq error:", errText);
      throw new Error("AIサーバーからの応答エラー");
    }

    const data = await res.json();
    const reply =
      data.choices?.[0]?.message?.content ||
      "すまん、通信データが一瞬途切れた。もう一度言ってくれ。";

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    console.error("Talk route error:", err);
    return NextResponse.json(
      { error: "回線エラーだ。もう一度話しかけてくれ。" },
      { status: 500 }
    );
  }
}