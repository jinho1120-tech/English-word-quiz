export type ArcadeMonsterMood = "mischievous" | "angry" | "surprised" | "worried" | "sleepy";
export type OwlDirection = "left" | "right" | "up" | "down";

export const ARCADE_MONSTER_COLORS = [
  "#8b5cf6",
  "#0ea5e9",
  "#ec4899",
  "#f97316",
  "#22c55e",
] as const;

export function drawArcadeMonster(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  wobble: number,
  flash: boolean,
  mood: ArcadeMonsterMood,
  color: string,
) {
  if (radius <= 0) return;

  const r = radius;
  const ink = "#26324b";
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(wobble) * 0.07);
  ctx.shadowColor = flash ? "#ffffff" : color;
  ctx.shadowBlur = flash ? Math.max(8, r * 0.42) : Math.max(3, r * 0.18);
  ctx.fillStyle = flash ? "#ffffff" : color;
  ctx.strokeStyle = flash ? "#ffffff" : "rgba(15, 23, 42, 0.62)";
  ctx.lineWidth = Math.max(0.8, r * 0.075);
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-r * 0.92, r * 0.7);
  ctx.lineTo(-r * 0.88, -r * 0.12);
  ctx.quadraticCurveTo(-r * 0.86, -r * 0.92, -r * 0.28, -r * 0.98);
  ctx.lineTo(-r * 0.43, -r * 1.18);
  ctx.quadraticCurveTo(-r * 0.1, -r * 1.1, 0, -r * 0.98);
  ctx.quadraticCurveTo(r * 0.16, -r * 1.22, r * 0.43, -r * 1.16);
  ctx.lineTo(r * 0.3, -r * 0.94);
  ctx.quadraticCurveTo(r * 0.9, -r * 0.76, r * 0.9, -r * 0.08);
  ctx.lineTo(r * 0.92, r * 0.7);
  ctx.quadraticCurveTo(r * 0.65, r * 0.43, r * 0.34, r * 0.7);
  ctx.quadraticCurveTo(0, r * 1.04, -r * 0.34, r * 0.7);
  ctx.quadraticCurveTo(-r * 0.65, r * 0.43, -r * 0.92, r * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  if (!flash) {
    ctx.fillStyle = "rgba(255,255,255,0.24)";
    ctx.beginPath();
    ctx.ellipse(-r * 0.28, -r * 0.55, r * 0.16, r * 0.28, -0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  const eyeY = mood === "surprised" ? -r * 0.12 : -r * 0.08;
  if (mood === "sleepy") {
    ctx.lineWidth = Math.max(1.1, r * 0.085);
    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, eyeY);
    ctx.quadraticCurveTo(-r * 0.34, eyeY + r * 0.1, -r * 0.2, eyeY);
    ctx.moveTo(r * 0.2, eyeY);
    ctx.quadraticCurveTo(r * 0.34, eyeY + r * 0.1, r * 0.5, eyeY);
    ctx.stroke();
  } else {
    const eyeHeight = mood === "surprised" ? r * 0.25 : mood === "worried" ? r * 0.14 : r * 0.2;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(-r * 0.34, eyeY, r * 0.17, eyeHeight * 1.18, 0, 0, Math.PI * 2);
    ctx.ellipse(r * 0.34, eyeY, r * 0.17, eyeHeight * 1.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(-r * 0.32, eyeY + r * 0.015, r * 0.075, eyeHeight * 0.75, 0, 0, Math.PI * 2);
    ctx.ellipse(r * 0.36, eyeY + r * 0.015, r * 0.075, eyeHeight * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = Math.max(1.1, r * 0.07);
  ctx.lineCap = "round";
  ctx.beginPath();
  if (mood === "angry") {
    ctx.moveTo(-r * 0.5, -r * 0.38);
    ctx.lineTo(-r * 0.2, -r * 0.25);
    ctx.moveTo(r * 0.5, -r * 0.38);
    ctx.lineTo(r * 0.2, -r * 0.25);
    ctx.moveTo(-r * 0.18, r * 0.34);
    ctx.lineTo(r * 0.18, r * 0.34);
    ctx.stroke();
  } else if (mood === "surprised") {
    ctx.beginPath();
    ctx.ellipse(0, r * 0.31, r * 0.13, r * 0.19, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (mood === "worried") {
    ctx.moveTo(-r * 0.18, r * 0.42);
    ctx.quadraticCurveTo(0, r * 0.18, r * 0.18, r * 0.42);
    ctx.stroke();
  } else if (mood === "sleepy") {
    ctx.moveTo(-r * 0.12, r * 0.3);
    ctx.lineTo(r * 0.12, r * 0.3);
    ctx.stroke();
  } else {
    ctx.moveTo(-r * 0.2, r * 0.2);
    ctx.quadraticCurveTo(-r * 0.02, r * 0.48, r * 0.2, r * 0.2);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawOwl(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  direction: OwlDirection,
  doctorMode: boolean,
  animationTime: number,
) {
  const r = radius;
  ctx.save();
  ctx.translate(x, y + Math.sin(animationTime * 5) * 0.28);
  if (direction === "left") ctx.scale(-1, 1);

  if (doctorMode) {
    const aura = ctx.createRadialGradient(0, 0, r * 0.35, 0, 0, r * 2.8);
    aura.addColorStop(0, "rgba(59,130,246,0.34)");
    aura.addColorStop(1, "rgba(59,130,246,0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#2563eb";
  ctx.strokeStyle = "#123c75";
  ctx.lineWidth = Math.max(0.9, r * 0.12);
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-r * 0.82, r * 0.58);
  ctx.quadraticCurveTo(-r * 1.06, -r * 0.1, -r * 0.74, -r * 0.65);
  ctx.lineTo(-r * 0.48, -r * 0.47);
  ctx.quadraticCurveTo(0, -r * 1.12, r * 0.48, -r * 0.47);
  ctx.lineTo(r * 0.74, -r * 0.65);
  ctx.quadraticCurveTo(r * 1.06, -r * 0.1, r * 0.82, r * 0.58);
  ctx.quadraticCurveTo(0, r * 1.05, -r * 0.82, r * 0.58);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (direction === "up") {
    ctx.fillStyle = "#1d4ed8";
    ctx.beginPath();
    ctx.ellipse(-r * 0.42, r * 0.12, r * 0.25, r * 0.46, -0.28, 0, Math.PI * 2);
    ctx.ellipse(r * 0.42, r * 0.12, r * 0.25, r * 0.46, 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#93c5fd";
    ctx.lineWidth = Math.max(0.7, r * 0.08);
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, r * 0.42);
    ctx.quadraticCurveTo(0, r * 0.62, r * 0.2, r * 0.42);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#eff6ff";
    ctx.beginPath();
    if (direction === "down") {
      ctx.ellipse(0, r * 0.02, r * 0.64, r * 0.62, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(r * 0.22, r * 0.02, r * 0.52, r * 0.55, 0, 0, Math.PI * 2);
    }
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    if (direction === "down") {
      ctx.ellipse(-r * 0.27, -r * 0.1, r * 0.21, r * 0.25, 0, 0, Math.PI * 2);
      ctx.ellipse(r * 0.27, -r * 0.1, r * 0.21, r * 0.25, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(r * 0.34, -r * 0.12, r * 0.2, r * 0.24, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.fillStyle = "#172554";
    ctx.beginPath();
    if (direction === "down") {
      ctx.arc(-r * 0.24, -r * 0.08, r * 0.085, 0, Math.PI * 2);
      ctx.arc(r * 0.3, -r * 0.08, r * 0.085, 0, Math.PI * 2);
    } else {
      ctx.arc(r * 0.39, -r * 0.1, r * 0.085, 0, Math.PI * 2);
    }
    ctx.fill();

    ctx.fillStyle = "#f59e0b";
    ctx.strokeStyle = "#92400e";
    ctx.lineWidth = Math.max(0.5, r * 0.06);
    ctx.beginPath();
    if (direction === "down") {
      ctx.moveTo(-r * 0.13, r * 0.18);
      ctx.lineTo(r * 0.13, r * 0.18);
      ctx.lineTo(0, r * 0.43);
    } else {
      ctx.moveTo(r * 0.48, r * 0.1);
      ctx.lineTo(r * 0.83, r * 0.2);
      ctx.lineTo(r * 0.48, r * 0.34);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  if (doctorMode) {
    // The cap appears from every direction; glasses are visible from the front and side only.
    ctx.fillStyle = "#172033";
    ctx.beginPath();
    ctx.moveTo(-r * 0.86, -r * 0.73);
    ctx.lineTo(0, -r * 1.25);
    ctx.lineTo(r * 0.86, -r * 0.73);
    ctx.lineTo(0, -r * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-r * 0.5, -r * 0.7, r, r * 0.18);
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = Math.max(0.65, r * 0.08);
    ctx.beginPath();
    ctx.moveTo(r * 0.58, -r * 0.72);
    ctx.lineTo(r * 0.78, -r * 0.15);
    ctx.stroke();

    if (direction !== "up") {
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = Math.max(0.8, r * 0.1);
      ctx.beginPath();
      if (direction === "down") {
        ctx.roundRect(-r * 0.58, -r * 0.28, r * 0.48, r * 0.4, r * 0.12);
        ctx.roundRect(r * 0.1, -r * 0.28, r * 0.48, r * 0.4, r * 0.12);
        ctx.moveTo(-r * 0.1, -r * 0.08);
        ctx.lineTo(r * 0.1, -r * 0.08);
      } else {
        ctx.roundRect(r * 0.12, -r * 0.3, r * 0.5, r * 0.42, r * 0.12);
      }
      ctx.stroke();
    }
  }

  ctx.restore();
}

export function drawStarCollectible(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(120, 53, 15, 0.55)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let point = 0; point < 10; point++) {
    const angle = (point * Math.PI) / 5;
    const pointRadius = point % 2 === 0 ? radius : radius * 0.46;
    const px = Math.cos(angle) * pointRadius;
    const py = Math.sin(angle) * pointRadius;
    if (point === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawBookCollectible(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  const half = size / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = "#1e3a8a";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, -half * 0.78);
  ctx.quadraticCurveTo(-half * 0.58, -half, -half, -half * 0.62);
  ctx.lineTo(-half, half * 0.68);
  ctx.quadraticCurveTo(-half * 0.42, half * 0.45, 0, half * 0.82);
  ctx.quadraticCurveTo(half * 0.42, half * 0.45, half, half * 0.68);
  ctx.lineTo(half, -half * 0.62);
  ctx.quadraticCurveTo(half * 0.58, -half, 0, -half * 0.78);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -half * 0.7);
  ctx.lineTo(0, half * 0.75);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-half * 0.7, -half * 0.25);
  ctx.quadraticCurveTo(-half * 0.36, -half * 0.38, -half * 0.12, -half * 0.16);
  ctx.moveTo(half * 0.7, -half * 0.25);
  ctx.quadraticCurveTo(half * 0.36, -half * 0.38, half * 0.12, -half * 0.16);
  ctx.stroke();
  ctx.restore();
}

export function drawPencilBonus(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = "#facc15";
  ctx.strokeStyle = "#78350f";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.roundRect(-size * 0.18, -size * 0.65, size * 0.36, size * 1.2, size * 0.08);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fda4af";
  ctx.fillRect(-size * 0.18, -size * 0.65, size * 0.36, size * 0.2);
  ctx.fillStyle = "#fef3c7";
  ctx.beginPath();
  ctx.moveTo(-size * 0.18, size * 0.55);
  ctx.lineTo(size * 0.18, size * 0.55);
  ctx.lineTo(0, size * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
