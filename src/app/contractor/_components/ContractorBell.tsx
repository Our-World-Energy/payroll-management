"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchCurrentMonthBirthdays } from "../profile/actions";
import { fetchWishState } from "../dashboard/wishes";
import { LuBell, LuCake, LuX } from "react-icons/lu";

type BdayItem = { name: string; email: string; isMe: boolean };

function todayIsoLocal(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

// Contractor topbar bell — surfaces today's birthdays so wishes get seen even
// without scrolling the dashboard, and flags wishes received on your own day.
export function ContractorBell({ dark = false }: { dark?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [birthdays, setBirthdays] = useState<BdayItem[]>([]);
  const [myWishes, setMyWishes] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email?.trim().toLowerCase() ?? "";
      if (!email) return;

      const iso = todayIsoLocal();
      const md = iso.slice(5, 10);
      const all = await fetchCurrentMonthBirthdays().catch(() => []);
      const todays = all
        .filter((b) => b.dob.slice(5, 10) === md)
        .map((b) => ({ name: b.fullName, email: b.email.trim().toLowerCase(), isMe: b.email.trim().toLowerCase() === email }));
      setBirthdays(todays);

      if (todays.some((b) => b.isMe)) {
        const { received } = await fetchWishState(email, iso).catch(() => ({ received: [] as { fromName: string }[], sentTo: [] }));
        setMyWishes(received.length);
      }
    })();
  }, []);

  const count = birthdays.length;
  const iconColor = dark ? "text-white/80" : "text-slate-600";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className={`relative p-2 rounded-full transition-colors hover:bg-black/5 ${iconColor} cursor-pointer`}
      >
        <LuBell size={20} strokeWidth={1.75} />
        {count > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-teal-500 ring-2 ring-white" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-2xl border border-slate-200 shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-bold text-[#003527]">Notifications</p>
            <button onClick={() => setOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer">
              <LuX size={15} strokeWidth={2} />
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {count === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">No birthdays today.</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {birthdays.map((b) => (
                  <button
                    key={b.email || b.name}
                    onClick={() => { setOpen(false); router.push("/contractor/dashboard"); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-emerald-50/60 transition-colors cursor-pointer"
                  >
                    <span className="grid place-items-center w-9 h-9 rounded-full bg-teal-100 text-teal-700 shrink-0">
                      <LuCake size={16} strokeWidth={2} />
                    </span>
                    <span className="min-w-0">
                      {b.isMe ? (
                        <>
                          <span className="block text-sm font-semibold text-[#003527]">It&apos;s your birthday! 🎉</span>
                          <span className="block text-xs text-slate-400">{myWishes > 0 ? `${myWishes} colleague${myWishes !== 1 ? "s" : ""} wished you` : "See who's celebrating with you"}</span>
                        </>
                      ) : (
                        <>
                          <span className="block text-sm font-semibold text-[#003527] truncate">{b.name}&apos;s birthday today</span>
                          <span className="block text-xs text-teal-700 font-medium">Tap to send wishes →</span>
                        </>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
