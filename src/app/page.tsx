"use client";

import { useEffect, useRef, useState } from "react";

interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function Home() {
  const [passcode, setPasscode] = useState("");
  const [isBooted, setIsBooted] = useState(false);
  const [inputText, setInputText] = useState("");
  const [subtitle, setSubtitle] = useState("SYSTEM STANDBY...");
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(false);
  const [isTestingMouth, setIsTestingMouth] = useState(false);
  const [isAutoLoop, setIsAutoLoop] = useState(true); // ハンズフリー連続会話（デフォルトON）
  const [history, setHistory] = useState<ChatMessage[]>([]);

  const recognitionRef = useRef<any>(null);
  const isAutoLoopRef = useRef(true);

  useEffect(() => {
    isAutoLoopRef.current = isAutoLoop;
  }, [isAutoLoop]);

  // 高品質音声を事前にブラウザへロード
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  // 話している間の口パクアニメーション
  const activeSpeaking = isSpeaking || isTestingMouth;
  useEffect(() => {
    if (!activeSpeaking) {
      setMouthOpen(false);
      return;
    }
    setMouthOpen(true);
    const timer = setInterval(() => {
      setMouthOpen((prev) => (Math.random() < 0.72 ? !prev : true));
    }, 110);
    return () => clearInterval(timer);
  }, [activeSpeaking]);

  // マイク認識の起動処理
  const startListening = () => {
    const win = window as unknown as IWindow;
    const SpeechRecognition =
      win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ja-JP";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => {
      setIsListening(true);
      setSubtitle("LISTENING... （話しかけてください）");
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setIsListening(false);
      if (transcript) {
        sendMessage(transcript);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      // 連続通話モードなら少し間を置いて再起動
      if (isAutoLoopRef.current) {
        setTimeout(() => startListening(), 1000);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      // ignore
    }
  };

  // 音声読み上げ（ハヤトが話し終わると自動でマイク再起動＝Google風ハンズフリー！）
  const speakText = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = 1.12; // クールでテンポの良い早口
    utterance.pitch = 1.22; // クールな青年の高めトーン

    const voices = window.speechSynthesis.getVoices();
    const naturalVoice =
      voices.find(
        (v) =>
          v.lang.includes("ja") &&
          v.name.includes("Keita") &&
          (v.name.includes("Natural") || v.name.includes("Online"))
      ) ||
      voices.find(
        (v) =>
          v.lang.includes("ja") &&
          (v.name.includes("Natural") || v.name.includes("Online"))
      ) ||
      voices.find((v) => v.lang.includes("ja") && v.name.includes("Google")) ||
      voices.find(
        (v) =>
          v.lang.includes("ja") &&
          (v.name.includes("Enhanced") || v.name.includes("Otoya"))
      ) ||
      voices.find((v) => v.lang.includes("ja"));

    if (naturalVoice) utterance.voice = naturalVoice;

    utterance.onstart = () => setIsSpeaking(true);

    // ★重要：ハヤトのセリフが終わったら、自動でマイクをONにする！
    utterance.onend = () => {
      setIsSpeaking(false);
      if (isAutoLoopRef.current) {
        setTimeout(() => {
          startListening();
        }, 350);
      }
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
      if (isAutoLoopRef.current) {
        setTimeout(() => {
          startListening();
        }, 350);
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  // メッセージ送信（会話履歴もサーバーへ送る）
  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    setErrorMsg("");
    setIsLoading(true);
    setSubtitle("ANALYZING DATA...");

    const newHistory: ChatMessage[] = [
      ...history,
      { role: "user", content: messageText },
    ];

    try {
      const res = await fetch("/api/talk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passcode,
          message: messageText,
          history: newHistory,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "通信エラーが発生しました。");
      }

      const replyText = data.reply;
      setSubtitle(replyText);
      setHistory([...newHistory, { role: "assistant", content: replyText }]);
      speakText(replyText);
      setInputText("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "エラーが発生しました。";
      setErrorMsg(msg);
      setSubtitle("ERROR OCCURRED");
    } finally {
      setIsLoading(false);
    }
  };

  // 起動（BOOT）
  const handleBoot = async () => {
    if (!passcode) {
      setErrorMsg("認証コードを入力してください。");
      return;
    }
    setErrorMsg("");
    setIsBooted(true);
    await sendMessage("システムが起動した。短くカッコよく挨拶してくれ。");
  };

  // 連続会話モードのON/OFF切り替え
  const toggleAutoLoop = () => {
    const next = !isAutoLoop;
    setIsAutoLoop(next);
    if (!next) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else if (!isSpeaking && !isLoading) {
      startListening();
    }
  };

  const visualVolume = activeSpeaking
    ? mouthOpen
      ? 0.65
      : 0.25
    : isListening
    ? 0.4
    : 0;

  return (
    <main className="min-h-dvh bg-slate-950 text-cyan-100 flex flex-col items-center justify-between p-5 font-mono select-none overflow-hidden">
      {/* ヘッダーHUD */}
      <header className="w-full max-w-md flex items-center justify-between border-b border-cyan-500/30 pb-3">
        <div>
          <p className="text-[10px] tracking-[0.25em] text-cyan-400/70">
            TACTICAL AI INTERFACE
          </p>
          <h1 className="text-xl font-bold tracking-widest text-cyan-300">
            HAYATO <span className="text-xs font-normal text-cyan-500">v3.3 GROQ</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              isBooted
                ? "bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]"
                : "bg-slate-600"
            }`}
          />
          <span className="uppercase tracking-wider text-cyan-200/80">
            {isBooted
              ? activeSpeaking
                ? "SPEAKING"
                : isListening
                ? "LISTENING"
                : isLoading
                ? "THINKING"
                : "ONLINE"
              : "OFFLINE"}
          </span>
        </div>
      </header>

      {/* アバター表示エリア */}
      <section className="flex-1 flex flex-col items-center justify-center w-full max-w-md my-3">
        <div
          className="relative w-full rounded-2xl overflow-hidden bg-black border border-cyan-400/50 transition-shadow duration-75"
          style={{
            boxShadow: `0 0 ${14 + visualVolume * 40}px rgba(34, 211, 238, ${
              0.25 + visualVolume * 0.65
            })`,
          }}
        >
          {/* キャラ本体 */}
          <div
            className="relative w-full transition-transform duration-75 ease-out will-change-transform"
            style={{
              transform: `translateY(${
                activeSpeaking ? -visualVolume * 10 : 0
              }px) scale(${1.02 + visualVolume * 0.03})`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/avatar/talk.png"
              alt="AI Hayato"
              className="w-full h-auto block"
            />

            {/* 口閉じカバー */}
            {!mouthOpen && (
              <div
                className="pointer-events-none absolute"
                style={{
                  left: "45.2%",
                  top: "51.2%",
                  width: "9.2%",
                  height: "6.4%",
                  backgroundColor: "#d9ecf7",
                  borderTop: "2px solid #132238",
                  borderRadius: "10% 10% 50% 50%",
                }}
              />
            )}
          </div>

          {/* ホログラム走査線 */}
          <div
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, rgba(0,0,0,0.45) 0px, rgba(0,0,0,0.45) 1px, transparent 1px, transparent 3px)",
            }}
          />

          {/* 右上インジケーター */}
          <div className="pointer-events-none absolute top-2.5 right-3 flex items-center gap-1.5 bg-slate-950/70 px-2 py-0.5 rounded border border-cyan-500/30 text-[10px] tracking-widest text-cyan-300">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                activeSpeaking
                  ? "bg-cyan-300 animate-ping"
                  : isListening
                  ? "bg-amber-400 animate-ping"
                  : "bg-cyan-700"
              }`}
            />
            {activeSpeaking
              ? "SPEAKING"
              : isListening
              ? "LISTENING"
              : "STANDBY"}
          </div>

          {/* 下部波形バー */}
          <div className="pointer-events-none absolute bottom-2 left-0 right-0 flex items-end justify-center gap-1 h-6 px-6">
            {[0.3, 0.6, 0.9, 1, 0.85, 1, 0.7, 0.45, 0.8, 0.5, 0.3].map(
              (weight, idx) => (
                <div
                  key={idx}
                  className="w-1.5 rounded-full bg-cyan-300/85 transition-all duration-75"
                  style={{
                    height: `${Math.max(3, visualVolume * 24 * weight)}px`,
                    boxShadow: "0 0 6px rgba(34,211,238,0.8)",
                  }}
                />
              )
            )}
          </div>
        </div>

        {/* 字幕エリア */}
        <div className="mt-5 w-full min-h-[76px] rounded-xl bg-slate-900/80 border border-cyan-500/25 p-3.5 text-center flex items-center justify-center">
          <p className="text-sm leading-relaxed text-cyan-100/90 line-clamp-3">
            {subtitle}
          </p>
        </div>

        {errorMsg && (
          <p className="mt-3 text-xs text-rose-400 bg-rose-950/60 border border-rose-500/40 rounded-lg px-3 py-2">
            {errorMsg}
          </p>
        )}
      </section>

      {/* 操作パネル */}
      <footer className="w-full max-w-md pb-2 space-y-3">
        {!isBooted ? (
          <div className="space-y-2.5">
            <input
              type="password"
              inputMode="numeric"
              placeholder="CLEARANCE CODE（認証コード）"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="w-full rounded-xl bg-slate-900 border border-cyan-500/40 px-4 py-3 text-center text-sm tracking-widest text-cyan-100 placeholder:text-cyan-500/40 focus:outline-none focus:border-cyan-300"
            />
            <button
              type="button"
              onClick={handleBoot}
              disabled={isLoading}
              className="w-full py-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98] disabled:opacity-50 text-slate-950 font-bold tracking-[0.2em] transition shadow-[0_0_20px_rgba(34,211,238,0.4)]"
            >
              {isLoading ? "BOOTING..." : "SYSTEM BOOT"}
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {/* 自動通話モードの切り替えボタン */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={toggleAutoLoop}
                className={`py-3 rounded-xl text-xs font-bold border transition ${
                  isAutoLoop
                    ? "bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.3)]"
                    : "bg-slate-900 border-slate-700 text-slate-400"
                }`}
              >
                {isAutoLoop ? "● 連続通話モード ON" : "○ 連続通話モード OFF"}
              </button>

              <button
                type="button"
                onClick={startListening}
                disabled={isLoading || isSpeaking}
                className={`py-3 rounded-xl text-xs font-bold border transition ${
                  isListening
                    ? "bg-rose-500/20 border-rose-400 text-rose-300 animate-pulse"
                    : "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                }`}
              >
                {isListening ? "マイク認識中..." : "🎤 手動マイク"}
              </button>
            </div>

            {/* 文字入力欄 */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="作戦指示または質問を入力..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage(inputText)}
                disabled={isLoading}
                className="flex-1 rounded-xl bg-slate-900 border border-cyan-500/40 px-3.5 py-2.5 text-xs text-cyan-100 placeholder:text-cyan-500/40 focus:outline-none focus:border-cyan-300"
              />
              <button
                type="button"
                onClick={() => sendMessage(inputText)}
                disabled={isLoading || !inputText.trim()}
                className="px-4 py-2.5 rounded-xl bg-cyan-600/30 hover:bg-cyan-500/40 border border-cyan-400/50 text-cyan-200 text-xs font-bold transition disabled:opacity-40"
              >
                送信
              </button>
            </div>
          </div>
        )}
      </footer>
    </main>
  );
}