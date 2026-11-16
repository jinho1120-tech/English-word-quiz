export type ArcadeMonsterMood = "mischievous" | "angry" | "surprised" | "worried" | "sleepy";

export const ARCADE_MONSTER_COLORS = [
  "#8b5cf6",
  "#38bdf8",
  "#22c55e",
  "#f97316",
  "#ec4899",
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
  const r = radius;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(wobble) * 0.07);
  ctx.shadowColor = flash ? "#ffffff" : color;
  ctx.shadowBlur = flash ? 24 : Math.max(7, r * 0.28);
  ctx.fillStyle = flash ? "#ffffff" : color;
  ctx.beginPath();
  ctx.moveTo(-r, r * 0.72);
  ctx.lineTo(-r, -r * 0.12);
  ctx.bezierCurveTo(-r, -r * 1.25, r, -r * 1.25, r, -r * 0.12);
  ctx.lineTo(r, r * 0.72);
  ctx.quadraticCurveTo(r * 0.65, r * 0.42, r * 0.32, r * 0.72);
  ctx.quadraticCurveTo(0, r * 1.12, -r * 0.32, r * 0.72);
  ctx.quadraticCurveTo(-r * 0.65, r * 0.42, -r, r * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(-r * 0.34, -r * 0.08, r * 0.19, r * (mood === "surprised" ? 0.27 : 0.22), 0, 0, Math.PI * 2);
  ctx.ellipse(r * 0.34, -r * 0.08, r * 0.19, r * (mood === "surprised" ? 0.27 : 0.22), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#172033";
  ctx.beginPath();
  ctx.arc(-r * 0.31, -r * 0.07, Math.max(1, r * 0.09), 0, Math.PI * 2);
  ctx.arc(r * 0.37, -r * 0.07, Math.max(1, r * 0.09), 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#172033";
  ctx.fillStyle = "#172033";
  ctx.lineWidth = Math.max(1.4, r * 0.07);
  ctx.lineCap = "round";
  ctx.beginPath();
  if (mood === "angry") {
    ctx.moveTo(-r * 0.52, -r * 0.42);
    ctx.lineTo(-r * 0.2, -r * 0.29);
    ctx.moveTo(r * 0.52, -r * 0.42);
    ctx.lineTo(r * 0.2, -r * 0.29);
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
