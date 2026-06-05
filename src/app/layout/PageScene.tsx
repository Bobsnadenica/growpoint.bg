import { useEffect, useRef } from "react";
import type { PropsWithChildren } from "react";

export type PageSceneTone =
  | "home"
  | "directory"
  | "consultant"
  | "company"
  | "support"
  | "auth"
  | "dashboard"
  | "fallback";

type PageSceneProps = PropsWithChildren<{
  tone: PageSceneTone;
  pageKey: string;
}>;

const PARTICLE_TONES = new Set<PageSceneTone>(["home", "directory", "company", "support", "auth"]);

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
};

function SceneParticles({ tone }: { tone: PageSceneTone }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === "undefined") return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
    const context = canvas.getContext("2d", { alpha: true });

    if (!context || motionQuery.matches) {
      canvas.hidden = true;
      return;
    }

    canvas.hidden = false;

    let animationFrame = 0;
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let lastTime = performance.now();

    const createParticle = (): Particle => {
      const isMobile = coarsePointerQuery.matches;
      const speed = isMobile ? 0.018 : 0.028;
      const angle = Math.random() * Math.PI * 2;

      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: isMobile ? 1 + Math.random() * 1.2 : 1.2 + Math.random() * 1.8,
        alpha: 0.16 + Math.random() * 0.18
      };
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);

      const isMobile = coarsePointerQuery.matches || width < 720;
      const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.35 : 1.8);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      const density = isMobile ? 30000 : 24000;
      const minimum = isMobile ? 14 : 32;
      const maximum = isMobile ? 28 : 70;
      const targetCount = Math.max(minimum, Math.min(maximum, Math.round((width * height) / density)));

      if (particles.length > targetCount) {
        particles = particles.slice(0, targetCount);
      }

      while (particles.length < targetCount) {
        particles.push(createParticle());
      }
    };

    const draw = (time: number) => {
      const delta = Math.min(48, time - lastTime);
      lastTime = time;

      context.clearRect(0, 0, width, height);

      const isDark = document.documentElement.dataset.theme === "dark";
      const dotColor = isDark ? "196, 216, 205" : "75, 106, 96";
      const lineColor = isDark ? "143, 181, 168" : "127, 143, 137";
      const linkDistance = coarsePointerQuery.matches ? 92 : 132;

      particles.forEach((particle) => {
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;

        if (particle.x < -8) particle.x = width + 8;
        if (particle.x > width + 8) particle.x = -8;
        if (particle.y < -8) particle.y = height + 8;
        if (particle.y > height + 8) particle.y = -8;

        context.beginPath();
        context.fillStyle = `rgba(${dotColor}, ${particle.alpha})`;
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
      });

      for (let leftIndex = 0; leftIndex < particles.length; leftIndex += 1) {
        const left = particles[leftIndex];
        for (let rightIndex = leftIndex + 1; rightIndex < particles.length; rightIndex += 1) {
          const right = particles[rightIndex];
          const distance = Math.hypot(left.x - right.x, left.y - right.y);

          if (distance > linkDistance) continue;

          context.beginPath();
          context.strokeStyle = `rgba(${lineColor}, ${0.08 * (1 - distance / linkDistance)})`;
          context.lineWidth = 1;
          context.moveTo(left.x, left.y);
          context.lineTo(right.x, right.y);
          context.stroke();
        }
      }

      animationFrame = window.requestAnimationFrame(draw);
    };

    const start = () => {
      if (animationFrame || document.hidden || motionQuery.matches) return;
      lastTime = performance.now();
      animationFrame = window.requestAnimationFrame(draw);
    };

    const stop = () => {
      if (!animationFrame) return;
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    };

    const handleMotionChange = () => {
      if (motionQuery.matches) {
        stop();
        context.clearRect(0, 0, width, height);
        canvas.hidden = true;
        return;
      }

      canvas.hidden = false;
      resize();
      start();
    };

    resize();
    start();

    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);
    motionQuery.addEventListener("change", handleMotionChange);

    return () => {
      stop();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibility);
      motionQuery.removeEventListener("change", handleMotionChange);
    };
  }, [tone]);

  return <canvas ref={canvasRef} className="page-scene__particles" aria-hidden="true" />;
}

export default function PageScene({ tone, pageKey, children }: PageSceneProps) {
  return (
    <div className={`page-scene page-scene--${tone}`} data-page={pageKey}>
      {PARTICLE_TONES.has(tone) ? <SceneParticles tone={tone} /> : null}
      {children}
    </div>
  );
}
