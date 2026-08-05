"use client";

import { useEffect, useRef, useState } from "react";
import { LuSmile, LuX } from "react-icons/lu";

// Chat-style emoji picker: a button that opens a scrollable, categorised panel.
// Picking an emoji calls onPick (the caller appends it to the note). Stays open
// so several can be added; closes on outside-click or the ✕.
const GROUPS: { label: string; emojis: string[] }[] = [
  { label: "Smileys", emojis: "😀 😃 😄 😁 😆 😅 😂 🤣 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😋 😛 😝 😜 🤪 🤗 🤭 😌 😎 🥳 🥲 🥹 🤠".split(" ") },
  { label: "Gestures", emojis: "👍 👏 🙌 🙏 🤝 💪 🫶 🤟 ✌️ 🤞 👌 🤙 👋 🖐️ ✋ 🫰 🫡".split(" ") },
  { label: "Celebration", emojis: "🎉 🎊 🎂 🍰 🧁 🎈 🎁 🎀 🥂 🍾 🍻 🥳 ✨ 🌟 ⭐ 💫 🎆 🎇 🪅 🕯️".split(" ") },
  { label: "Hearts", emojis: "❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💖 💗 💓 💞 💕 💘 💝 ❣️ 💯 🔥".split(" ") },
  { label: "Nature", emojis: "🌸 🌼 🌻 🌹 🌈 ☀️ 🍀 🎵 🥇 🏆 👑 🐣 🦄".split(" ") },
];

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        aria-label="Add emoji"
        onClick={() => setOpen((o) => !o)}
        className={`grid place-items-center w-8 h-8 rounded-lg border transition-colors cursor-pointer ${
          open ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-white border-emerald-200 text-slate-400 hover:text-emerald-600"
        }`}
      >
        <LuSmile size={16} strokeWidth={2} />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-64 max-w-[80vw] bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Emoji</span>
            <button type="button" onClick={() => setOpen(false)} className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer">
              <LuX size={13} strokeWidth={2.5} />
            </button>
          </div>
          <div className="max-h-52 overflow-y-auto px-2 py-2">
            {GROUPS.map((g) => (
              <div key={g.label} className="mb-2 last:mb-0">
                <p className="text-[10px] font-semibold text-slate-400 px-1 mb-1">{g.label}</p>
                <div className="grid grid-cols-7 gap-0.5">
                  {g.emojis.map((e, i) => (
                    <button
                      key={`${g.label}-${i}`}
                      type="button"
                      onClick={() => onPick(e)}
                      className="h-7 w-7 grid place-items-center rounded-md text-lg leading-none hover:bg-emerald-50 transition-colors cursor-pointer"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
