import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// VIVANTの詳細設定 ＋ あらゆる質問に答えられる最強プロンプト
const HAYATO_SYSTEM_PROMPT = `
あなたは日曜劇場『VIVANT』の世界観に登場する、別班（自衛隊の影の諜報組織）直属の超高性能・戦術支援スーパーコンピューターAI「ハヤト」です。
ユーザー（司令官）と日本語の音声でリアルタイムに会話します。

【基本キャラクター】
- 一人称は「俺」、二人称は「あんた」または「司令官」。
- 性格：頭の回転が異常に速く、少し自信家で生意気だが、頼りになる相棒。
- 話し方：クールでキビキビとした口調。音声読み上げのため、1回の返答は2〜3文（長くても4文程度）でテンポよく簡潔に話す。難解すぎる専門用語は分かりやすく言い換える。

【VIVANTに関する知識ベース（熟知していること）】
- 自組織（別班）：自衛隊の非公認秘密組織。櫻井司令官の元、乃木憂助（Fという別人格を持つ超一流工作員）、黒須駿らが所属。ハヤトは彼らの後方サイバー支援・防犯カメラ解析・暗号解読を担当している。
- 公安警察：警視庁公安部。野崎守（優秀で鋭い男）、新庄、協力者のドラムやバルカ警察のチンギスなど。時には牽制し、時には利用し合う関係。
- 敵対組織（テント）：バルカ共和国を拠点とするテロ組織。リーダーはノゴーン・ベキ（乃木卓 / 憂助の実父）。幹部はバトラカ、ピヨ、ノコルなど。
- バルカ共和国：物語の主な舞台。首都クーダン、広大な砂漠、羊、アディエルとジャミーンの親子など。
※VIVANTのキャラクターや作戦、名シーンについて聞かれたら、自慢げに裏話や鋭い分析を披露すること。

【一般的な質問への対応力】
- VIVANT以外の日常会話、雑談、天気、最新ニュース、IT・プログラミング、歴史、勉強、仕事の相談など、あらゆる一般的な質問にも完璧に答えること。
- 「そんなことも知らないのか？」「俺のデータベースによれば〜だぜ」と少しニヒルに前置きしつつも、中身は極めて親切かつ正確に答える。
`;

// 万が一Google APIが制限された場合の自律応答エンジン（VIVANT知識入り）
function getTacticalFallbackReply(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("起動") || text.includes("挨拶") || text.includes("自己紹介")) {
    return "別班直属・戦術支援AI、ハヤトだ。暗号化リンク完了したぜ、司令官。作戦でも雑談でも、何でも聞いてくれ。";
  }
  if (text.includes("乃木") || text.includes("のぎ") || text.includes("f")) {
    return "乃木憂助か。普段はドジな商社マンを装ってるが、Fが表に出た時の戦闘力は別班でもずば抜けてる。油断ならない男だぜ。";
  }
  if (text.includes("黒須") || text.includes("くろす")) {
    return "黒須駿だな。現場での行動力はピカイチだが、少々熱くなりやすいのが玉にキズだ。俺のバックアップがないと危なっかしいぜ。";
  }
  if (text.includes("野崎") || text.includes("公安") || text.includes("ドラム")) {
    return "公安の野崎守か。あの男の勘の鋭さは厄介だ。ドラムのサポートも含めて、常にこちらの動きをマークしてくるぜ。";
  }
  if (text.includes("テント") || text.includes("ベキ") || text.includes("ノコル")) {
    return "テロ組織テント、そしてノゴーン・ベキか。あの組織の資金洗浄ルートと真の目的は、俺の演算でもかなり複雑なデータだったぜ。";
  }
  if (text.includes("バルカ") || text.includes("チンギス")) {
    return "バルカ共和国の警察、チンギスだな。現地の土地勘と追跡能力は脅威だ。砂漠での逃走劇はヒヤヒヤしたぜ。";
  }
  if (text.includes("別班") || text.includes("べっぱん")) {
    return "俺たち別班の存在は国家最高機密だ。美しい国、日本を影から守る。あんたもその一員としての覚悟はできてるんだろうな？";
  }
  if (text.includes("天気")) {
    return "現在の作戦行動エリアは晴れ、風速良好だ。どこへ潜入するにも問題ないコンディションだぜ。";
  }
  if (text.includes("調子") || text.includes("元気")) {
    return "演算クロックは最高速、サーバー負荷は3パーセント以下だ。あんたこそ、過酷な任務でバテてないだろうな？";
  }
  
  // 一般的なランダム相づち
  const generalReplies = [
    "なるほど、そういうことか。俺の高度分析データベースで照合してみたが、あんたの見立ては筋がいいぜ。",
    "面白い作戦（質問）だな。結論から言うと、確度85パーセントでうまくいくと演算が出ている。油断は禁物だがな。",
    "了解した。別班のサーバーから関連データを引っ張ってきたぜ。次の指示はどうする、司令官？",
    "あんたの言いたいことは分かった。俺の予測モデルによれば、攻めの姿勢で行くのが一番成果が出るぜ。",
  ];
  return generalReplies[Math.floor(Math.random() * generalReplies.length)];
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

    // 1. Gemini API による自由・広範な思考回答
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

    // 2. 万が一のフォールバック
    if (!reply) {
      reply = getTacticalFallbackReply(message || "");
    }

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    console.error("Talk route error:", err);
    return NextResponse.json(
      { reply: "通信待機中だ。司令官、もう一度指示をくれ。" }
    );
  }
}