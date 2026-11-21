import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { passcode?: string };

    // 1. パスコード認証（合言葉が合っている人だけを通す）
    const requiredPasscode = process.env.APP_PASSCODE;
    if (requiredPasscode && body.passcode !== requiredPasscode) {
      return NextResponse.json(
        { error: "認証コードが一致しません。" },
        { status: 401 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: ".env.local に GEMINI_API_KEY が設定されていません。" },
        { status: 500 }
      );
    }

    // 2. 一時トークンを試みる（Googleの無料キー等で失敗した場合は安全に自動フォールバック）
    let token = apiKey;
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { apiVersion: "v1alpha" },
      });
      const now = Date.now();
      const ephemeral = await ai.authTokens.create({
        config: {
          uses: 1,
          expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
          newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
        },
      });
      if (ephemeral?.name) {
        token = ephemeral.name;
      }
    } catch {
      // 一時トークンが制限されているAPIキーでも、認証コード通過済みならそのまま接続
      token = apiKey;
    }

    return NextResponse.json({ token });
  } catch (err: unknown) {
    console.error("Token route error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `接続エラー: ${msg}` },
      { status: 500 }
    );
  }
}