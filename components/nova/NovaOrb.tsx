"use client";

import { useEffect, useRef } from "react";

/**
 * Nova's face: an animated wireframe sphere that reacts to what she is doing.
 *
 * Ported from RideBy's NovaMeshOrb — the maths is the original, retinted from
 * cyan/pink to Sere's violet. It is canvas rather than a GIF so the motion can
 * carry state: it turns faster while thinking and pulses while speaking, which
 * is the only feedback you get during a voice turn with no text on screen.
 */

export type OrbPhase = "idle" | "listening" | "thinking" | "speaking";

type Vec3 = { x: number; y: number; z: number };

function rotateY(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}

function rotateX(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
}

const VIOLET: [number, number, number] = [124, 92, 255];
const SKY: [number, number, number] = [86, 200, 255];

function mixColor(a: [number, number, number], b: [number, number, number], t: number): number[] {
  const u = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * u),
    Math.round(a[1] + (b[1] - a[1]) * u),
    Math.round(a[2] + (b[2] - a[2]) * u),
  ];
}

export function NovaOrb({
  phase,
  onClick,
  ariaLabel,
}: {
  phase: OrbPhase;
  onClick: () => void;
  ariaLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLButtonElement | null>(null);
  const phaseRef = useRef(phase);
  const rafRef = useRef(0);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    const rings = 22;
    const segs = 36;
    const base: Vec3[][] = [];
    for (let i = 0; i <= rings; i += 1) {
      const theta = (i / rings) * Math.PI;
      const row: Vec3[] = [];
      for (let j = 0; j <= segs; j += 1) {
        const phi = (j / segs) * Math.PI * 2;
        row.push({
          x: Math.sin(theta) * Math.cos(phi),
          y: Math.cos(theta),
          z: Math.sin(theta) * Math.sin(phi),
        });
      }
      base.push(row);
    }

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);

    const start = performance.now();

    const draw = (now: number) => {
      const t = reduceMotion ? 0 : (now - start) / 1000;
      const p = phaseRef.current;

      let rotSpeed = 0.2;
      let waveAmp = 0.04;
      let waveFreq = 2.2;
      let glow = 0.5;
      let lineAlpha = 0.5;
      if (p === "listening") {
        rotSpeed = 0.34;
        waveAmp = 0.07;
        waveFreq = 2.8;
        glow = 0.85;
        lineAlpha = 0.68;
      } else if (p === "thinking") {
        rotSpeed = 0.52;
        waveAmp = 0.1;
        waveFreq = 3.4;
        glow = 1;
        lineAlpha = 0.74;
      } else if (p === "speaking") {
        rotSpeed = 0.4;
        waveAmp = 0.11 + Math.sin(t * 8) * 0.035;
        waveFreq = 3.6;
        glow = 1.05;
        lineAlpha = 0.82;
      }

      const rotY = t * rotSpeed;
      const rotX = Math.sin(t * 0.35) * 0.3 + 0.25;
      const radius = Math.min(width, height) * 0.37;
      const cx = width / 2;
      const cy = height / 2;

      ctx.clearRect(0, 0, width, height);

      const halo = ctx.createRadialGradient(
        cx - radius * 0.25,
        cy - radius * 0.2,
        radius * 0.1,
        cx,
        cy,
        radius * 1.35,
      );
      halo.addColorStop(0, `rgba(124, 92, 255, ${0.24 * glow})`);
      halo.addColorStop(0.5, `rgba(86, 200, 255, ${0.09 * glow})`);
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, width, height);

      type Proj = { x: number; y: number; z: number; c: number };
      const projected: Proj[][] = [];
      for (let i = 0; i <= rings; i += 1) {
        const row: Proj[] = [];
        for (let j = 0; j <= segs; j += 1) {
          const b = base[i][j];
          const n =
            Math.sin(b.x * waveFreq * 3 + t * 2.1) *
            Math.cos(b.y * waveFreq * 2.4 - t * 1.7) *
            Math.sin(b.z * waveFreq * 2.8 + t * 1.3);
          const bulge = 1 + waveAmp * n + waveAmp * 0.35 * Math.sin(t * 1.5 + i * 0.2);
          let p3 = { x: b.x * bulge, y: b.y * bulge, z: b.z * bulge };
          p3 = rotateY(p3, rotY);
          p3 = rotateX(p3, rotX);
          const cool = Math.max(0, -p3.x * 0.55 - p3.y * 0.45 + p3.z * 0.15);
          const warm = Math.max(0, p3.x * 0.55 + p3.y * 0.35 - p3.z * 0.1);
          row.push({
            x: cx + p3.x * radius,
            y: cy + p3.y * radius,
            z: p3.z,
            c: warm / (cool + warm + 0.001),
          });
        }
        projected.push(row);
      }

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const segment = (a: Proj, b: Proj) => {
        const depth = (a.z + b.z) * 0.5;
        const alpha = (0.2 + (depth + 1) * 0.28) * lineAlpha;
        const [r, g, bl] = mixColor(SKY, VIOLET, (a.c + b.c) * 0.5);
        ctx.strokeStyle = `rgba(${r},${g},${bl},${alpha})`;
        ctx.lineWidth = 0.6 + (depth + 1) * 0.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      };

      // Front face first, then the far side faintly, so the sphere reads solid.
      for (const near of [true, false]) {
        ctx.globalAlpha = near ? 1 : 0.32;
        for (let i = 0; i < rings; i += 1) {
          for (let j = 0; j < segs; j += 1) {
            const a = projected[i][j];
            const b = projected[i][j + 1];
            const c = projected[i + 1][j];
            const frontAB = (a.z + b.z) * 0.5 > -0.15;
            const frontAC = (a.z + c.z) * 0.5 > -0.15;
            if (frontAB === near) segment(a, b);
            if (frontAC === near) segment(a, c);
          }
        }
      }
      ctx.globalAlpha = 1;

      for (let i = 0; i <= rings; i += 2) {
        for (let j = 0; j <= segs; j += 2) {
          const pt = projected[i][j];
          if (pt.z < -0.2) continue;
          const [r, g, bl] = mixColor([180, 225, 255], [190, 170, 255], pt.c);
          ctx.fillStyle = `rgba(${r},${g},${bl},${0.22 + (pt.z + 1) * 0.32})`;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 0.7 + (pt.z + 1) * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (!reduceMotion) rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
    };
  }, []);

  return (
    <button
      ref={wrapRef}
      type="button"
      className={`nova-orb nova-orb-${phase}`}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <canvas ref={canvasRef} className="nova-orb-canvas" />
    </button>
  );
}
