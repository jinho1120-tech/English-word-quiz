export type OwlDirection = "left" | "right" | "up" | "down";

export function drawBlueOwl(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  direction: OwlDirection,
  doctorMode: boolean,
  frame: number,
) {
  const half = size / 2;
  ctx.save();
  ctx.translate(x, y);
  if (direction === "right") ctx.scale(-1, 1);
  const bob = Math.sin(frame) * size * 0.025;
  ctx.translate(0, bob);

  // Small ear tufts and rounded blue body.
  ctx.fillStyle = "#2563eb";
  ctx.beginPath();
  ctx.moveTo(-half * 0.72, -half * 0.35);
  ctx.lineTo(-half * 0.95, -half * 0.98);
  ctx.quadraticCurveTo(-half * 0.42, -half * 0.82, -half * 0.22, -half * 0.62);
  ctx.quadraticCurveTo(half * 0.42, -half * 0.82, half * 0.95, -half * 0.98);
  ctx.lineTo(half * 0.72, -half * 0.35);
  ctx.quadraticCurveTo(half * 0.98, half * 0.68, 0, half * 0.94);
  ctx.quadraticCurveTo(-half * 0.98, half * 0.68, -half * 0.72, -half * 0.35);
  ctx.fill();

  if (direction === "up") {
    // Back view: no face details.
    ctx.fillStyle = "#1d4ed8";
    ctx.beginPath();
    ctx.ellipse(0, half * 0.1, half * 0.48, half * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#93c5fd";
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.beginPath();
    ctx.moveTo(-half * 0.3, half * 0.28);
    ctx.quadraticCurveTo(0, half * 0.5, half * 0.3, half * 0.28);
    ctx.stroke();
  } else {
    // White face: full front or offset side profile.
    ctx.fillStyle = "#eff6ff";
    ctx.beginPath();
    if (direction === "left" || direction === "right") {
      ctx.ellipse(-half * 0.08, half * 0.02, half * 0.48, half * 0.57, -0.12, 0, Math.PI * 2);
    } else {
      ctx.ellipse(0, half * 0.02, half * 0.62, half * 0.57, 0, 0, Math.PI * 2);
    }
    ctx.fill();

    ctx.fillStyle = "#172554";
    const eyeY = -half * 0.12;
    if (direction === "down") {
      ctx.beginPath();
      ctx.arc(-half * 0.27, eyeY, Math.max(1, size * 0.095), 0, Math.PI * 2);
      ctx.arc(half * 0.27, eyeY, Math.max(1, size * 0.095), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.moveTo(-half * 0.12, half * 0.13);
      ctx.lineTo(half * 0.12, half * 0.13);
      ctx.lineTo(0, half * 0.32);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(-half * 0.22, eyeY, Math.max(1, size * 0.09), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.moveTo(-half * 0.03, half * 0.13);
      ctx.lineTo(half * 0.16, half * 0.2);
      ctx.lineTo(-half * 0.03, half * 0.27);
      ctx.closePath();
      ctx.fill();
    }
  }

  if (doctorMode) {
    // Glasses appear only in doctor mode and only where a face is visible.
    if (direction === "down" || direction === "left" || direction === "right") {
      ctx.strokeStyle = "#172033";
      ctx.lineWidth = Math.max(1, size * 0.055);
      ctx.beginPath();
      if (direction === "down") {
        ctx.roundRect(-half * 0.49, -half * 0.28, half * 0.43, half * 0.35, half * 0.1);
        ctx.roundRect(half * 0.06, -half * 0.28, half * 0.43, half * 0.35, half * 0.1);
        ctx.moveTo(-half * 0.06, -half * 0.1);
        ctx.lineTo(half * 0.06, -half * 0.1);
      } else {
        ctx.roundRect(-half * 0.48, -half * 0.27, half * 0.38, half * 0.34, half * 0.1);
      }
      ctx.stroke();
    }
    // Graduation cap only in doctor mode.
    ctx.fillStyle = "#172033";
    ctx.beginPath();
    ctx.moveTo(-half * 0.78, -half * 0.58);
    ctx.lineTo(0, -half * 0.98);
    ctx.lineTo(half * 0.78, -half * 0.58);
    ctx.lineTo(0, -half * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-half * 0.48, -half * 0.48, half * 0.96, half * 0.13);
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = Math.max(1, size * 0.04);
    ctx.beginPath();
    ctx.moveTo(half * 0.55, -half * 0.58);
    ctx.lineTo(half * 0.68, -half * 0.16);
    ctx.stroke();
  }
  ctx.restore();
}
