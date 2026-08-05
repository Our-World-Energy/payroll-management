"use client";

import { useEffect, useRef } from "react";

// Dependency-free confetti: three bursts — from the left edge, the right edge,
// and raining from the top — in a mix of festive colours. Honours
// prefers-reduced-motion.
export function Confetti({ durationMs = 5000 }: { durationMs?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    // Festive multi-colour mix.
    const colors = [
      "#ef4444", "#f97316", "#fbbf24", "#22c55e", "#14b8a6",
      "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4", "#facc15",
    ];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

    type P = { x: number; y: number; vx: number; vy: number; size: number; rot: number; vr: number; color: string; shape: number };
    const make = (x: number, y: number, vx: number, vy: number): P => ({
      x, y, vx, vy,
      size: rnd(6, 12),
      rot: Math.random() * Math.PI,
      vr: rnd(-0.3, 0.3),
      color: pick(colors),
      shape: Math.random() < 0.35 ? 1 : 0, // some circles, mostly ribbons
    });

    const DEG = Math.PI / 180;
    const parts: P[] = [];
    const perSide = 170;
    const topCount = 200;

    // One volley = both side cannons firing + a top shower.
    const spawnVolley = () => {
      for (let i = 0; i < perSide; i++) {
        const ang = rnd(-82, -6) * DEG;
        const sp = rnd(12, 26);
        parts.push(make(rnd(-15, 55), rnd(H() * 0.28, H() * 0.9), Math.cos(ang) * sp, Math.sin(ang) * sp));
      }
      for (let i = 0; i < perSide; i++) {
        const ang = rnd(-174, -98) * DEG;
        const sp = rnd(12, 26);
        parts.push(make(rnd(W() - 55, W() + 15), rnd(H() * 0.28, H() * 0.9), Math.cos(ang) * sp, Math.sin(ang) * sp));
      }
      for (let i = 0; i < topCount; i++) {
        parts.push(make(rnd(0, W()), rnd(-H() * 0.7, 0), rnd(-3, 3), rnd(2, 7)));
      }
    };

    // Fire several volleys in quick succession so it keeps pumping.
    const volleyTimes = [0, 300, 650, 1050, 1500];
    let nextVolley = 0;
    spawnVolley();
    nextVolley = 1;

    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      while (nextVolley < volleyTimes.length && elapsed >= volleyTimes[nextVolley]) {
        spawnVolley();
        nextVolley++;
      }
      ctx.clearRect(0, 0, W(), H());
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.18;   // gravity
        p.vx *= 0.995;  // slight air drag
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        // Full opacity through the pumping phase, fade only in the last 30%.
        const fadeStart = durationMs * 0.7;
        ctx.globalAlpha = elapsed < fadeStart ? 1 : Math.max(0, 1 - (elapsed - fadeStart) / (durationMs - fadeStart));
        if (p.shape === 1) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.5);
        }
        ctx.restore();
      }
      if (elapsed < durationMs) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, W(), H());
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [durationMs]);

  return <canvas ref={canvasRef} className="fixed inset-0 z-60 pointer-events-none" aria-hidden="true" />;
}
