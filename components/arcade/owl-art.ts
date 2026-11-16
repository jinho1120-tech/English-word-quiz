export type OwlDirection = "left" | "right" | "up" | "down";

/**
 * Shared directional character renderer for the maze owl.
 * The doctor outfit is an overlay: the base owl silhouette and colors stay
 * identical in both modes.
 */
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
  const bob = Math.sin(frame) * size * 0.018;
  const stroke = Math.max(0.8, size * 0.035);

  ctx.save();
  ctx.translate(x, y + bob);

  // Draw the right-facing profile once and mirror it for left movement.
  if (direction === "left") ctx.scale(-1, 1);

  const fillBody = () => {
    ctx.fillStyle = "#2563eb";
    ctx.beginPath();
    ctx.moveTo(-half * 0.68, -half * 0.42);
    ctx.quadraticCurveTo(-half * 0.9, -half * 0.92, -half * 0.28, -half * 0.7);
    ctx.quadraticCurveTo(0, -half * 0.82, half * 0.28, -half * 0.7);
    ctx.quadraticCurveTo(half * 0.9, -half * 0.92, half * 0.68, -half * 0.42);
    ctx.quadraticCurveTo(half * 1.02, half * 0.58, 0, half * 0.91);
    ctx.quadraticCurveTo(-half * 1.02, half * 0.58, -half * 0.68, -half * 0.42);
    ctx.closePath();
    ctx.fill();
  };

  fillBody();

  if (direction === "up") {
    // Rear view: blue head/back, paired wings and a small layered tail.
    ctx.fillStyle = "#1d4ed8";
    ctx.beginPath();
    ctx.ellipse(0, -half * 0.02, half * 0.43, half * 0.53, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.ellipse(-half * 0.57, half * 0.25, half * 0.22, half * 0.43, -0.28, 0, Math.PI * 2);
    ctx.ellipse(half * 0.57, half * 0.25, half * 0.22, half * 0.43, 0.28, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1e40af";
    ctx.beginPath();
    ctx.moveTo(-half * 0.24, half * 0.53);
    ctx.quadraticCurveTo(0, half * 0.38, half * 0.24, half * 0.53);
    ctx.lineTo(0, half * 0.83);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#93c5fd";
    ctx.lineWidth = stroke;
    ctx.beginPath();
    ctx.moveTo(0, -half * 0.28);
    ctx.lineTo(0, half * 0.42);
    ctx.stroke();
  } else if (direction === "left" || direction === "right") {
    // Side view: one visible eye, a projecting beak, cheek and folded wing.
    ctx.fillStyle = "#eff6ff";
    ctx.beginPath();
    ctx.ellipse(-half * 0.1, half * 0.04, half * 0.39, half * 0.48, -0.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#172554";
    ctx.beginPath();
    ctx.ellipse(half * 0.22, -half * 0.18, half * 0.075, half * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.moveTo(half * 0.48, -half * 0.02);
    ctx.lineTo(half * 0.98, half * 0.1);
    ctx.lineTo(half * 0.48, half * 0.23);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#60a5fa";
    ctx.beginPath();
    ctx.ellipse(-half * 0.2, half * 0.48, half * 0.39, half * 0.19, -0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1d4ed8";
    ctx.lineWidth = stroke;
    ctx.stroke();
  } else {
    // Front view: two bright eyes, a white heart-shaped face and orange beak.
    ctx.fillStyle = "#eff6ff";
    ctx.beginPath();
    ctx.moveTo(-half * 0.56, -half * 0.18);
    ctx.quadraticCurveTo(-half * 0.52, -half * 0.65, 0, -half * 0.38);
    ctx.quadraticCurveTo(half * 0.52, -half * 0.65, half * 0.56, -half * 0.18);
    ctx.quadraticCurveTo(half * 0.65, half * 0.55, 0, half * 0.67);
    ctx.quadraticCurveTo(-half * 0.65, half * 0.55, -half * 0.56, -half * 0.18);
    ctx.fill();

    ctx.fillStyle = "#172554";
    ctx.beginPath();
    ctx.ellipse(-half * 0.25, -half * 0.12, half * 0.085, half * 0.13, 0, 0, Math.PI * 2);
    ctx.ellipse(half * 0.25, -half * 0.12, half * 0.085, half * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(-half * 0.27, -half * 0.17, half * 0.025, 0, Math.PI * 2);
    ctx.arc(half * 0.23, -half * 0.17, half * 0.025, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.moveTo(-half * 0.12, half * 0.08);
    ctx.lineTo(half * 0.12, half * 0.08);
    ctx.lineTo(0, half * 0.3);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#60a5fa";
    ctx.beginPath();
    ctx.ellipse(-half * 0.72, half * 0.32, half * 0.16, half * 0.3, -0.45, 0, Math.PI * 2);
    ctx.ellipse(half * 0.72, half * 0.32, half * 0.16, half * 0.3, 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  // Small orange feet are visible from front and side, not from behind.
  if (direction !== "up") {
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.ellipse(-half * 0.27, half * 0.78, half * 0.17, half * 0.075, 0, 0, Math.PI * 2);
    ctx.ellipse(half * 0.27, half * 0.78, half * 0.17, half * 0.075, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (doctorMode) {
    // Glasses are fitted to the visible face only.
    if (direction === "down") {
      ctx.strokeStyle = "#172033";
      ctx.lineWidth = Math.max(0.9, size * 0.045);
      ctx.beginPath();
      ctx.roundRect(-half * 0.46, -half * 0.3, half * 0.4, half * 0.31, half * 0.1);
      ctx.roundRect(half * 0.06, -half * 0.3, half * 0.4, half * 0.31, half * 0.1);
      ctx.moveTo(-half * 0.06, -half * 0.15);
      ctx.lineTo(half * 0.06, -half * 0.15);
      ctx.stroke();
    } else if (direction === "left" || direction === "right") {
      ctx.strokeStyle = "#172033";
      ctx.lineWidth = Math.max(0.9, size * 0.045);
      ctx.beginPath();
      ctx.roundRect(half * 0.06, -half * 0.31, half * 0.34, half * 0.3, half * 0.09);
      ctx.stroke();
    }

    // Graduation cap is the only costume difference between the two modes.
    ctx.fillStyle = "#172033";
    ctx.beginPath();
    ctx.moveTo(-half * 0.82, -half * 0.57);
    ctx.lineTo(0, -half * 1.02);
    ctx.lineTo(half * 0.82, -half * 0.57);
    ctx.lineTo(0, -half * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-half * 0.49, -half * 0.49, half * 0.98, half * 0.12);
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = Math.max(0.8, size * 0.04);
    ctx.beginPath();
    ctx.moveTo(half * 0.55, -half * 0.57);
    ctx.lineTo(half * 0.68, -half * 0.12);
    ctx.stroke();
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(half * 0.68, -half * 0.1, Math.max(0.8, size * 0.035), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
