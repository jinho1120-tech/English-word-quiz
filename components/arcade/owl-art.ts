export type OwlDirection = "left" | "right" | "up" | "down";

/**
 * Shared directional character renderer for the maze owl.
 * Doctor mode adds glasses and a graduation cap to the same base owl.
 */
export function drawBlueOwl(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  direction: OwlDirection,
  doctorMode: boolean,
  frame: number,
  isMoving = false,
) {
  const half = size / 2;
  const bob = isMoving ? Math.sin(frame * 0.8) * size * 0.025 : 0;
  const stroke = Math.max(0.8, size * 0.035);
  const sideView = direction === "left" || direction === "right";
  const step = isMoving ? Math.sin(frame * 1.7) : 0;

  ctx.save();
  ctx.translate(x, y + bob);

  // Draw a right-facing profile and mirror it for left movement.
  // The white face and beak are at the front; the feather tufts are at the back.
  if (direction === "left") ctx.scale(-1, 1);

  const fillBody = () => {
    ctx.fillStyle = "#3290f5";
    ctx.strokeStyle = "#124b9b";
    ctx.lineWidth = stroke;
    ctx.beginPath();
    ctx.moveTo(-half * 0.76, -half * 0.28);
    ctx.quadraticCurveTo(-half * 0.82, -half * 0.92, -half * 0.22, -half * 0.9);
    ctx.quadraticCurveTo(half * 0.62, -half * 1.02, half * 0.86, -half * 0.34);
    ctx.quadraticCurveTo(half * 1.08, half * 0.48, half * 0.36, half * 0.83);
    ctx.quadraticCurveTo(-half * 0.56, half * 1.02, -half * 0.78, half * 0.34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
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
  } else if (sideView) {
    // Owl ear tufts: two distinct swept-back feather points, visible in normal mode.
    ctx.fillStyle = "#2782e8";
    ctx.strokeStyle = "#124b9b";
    ctx.lineWidth = stroke;
    ctx.beginPath();
    ctx.moveTo(-half * 0.48, -half * 0.62);
    ctx.quadraticCurveTo(-half * 0.78, -half * 1.02, -half * 0.12, -half * 0.83);
    ctx.quadraticCurveTo(-half * 0.02, -half * 0.98, half * 0.06, -half * 0.91);
    ctx.quadraticCurveTo(-half * 0.12, -half * 0.56, -half * 0.48, -half * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-half * 0.42, -half * 0.58);
    ctx.quadraticCurveTo(-half * 0.2, -half * 0.9, half * 0.18, -half * 0.72);
    ctx.quadraticCurveTo(half * 0.04, -half * 0.48, -half * 0.42, -half * 0.58);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // White facial disk, large single eye, and projecting golden beak.
    ctx.fillStyle = "#f8fbff";
    ctx.beginPath();
    ctx.ellipse(half * 0.43, -half * 0.08, half * 0.43, half * 0.51, -0.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(half * 0.43, -half * 0.12, half * 0.24, half * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#123f86";
    ctx.lineWidth = Math.max(1, size * 0.055);
    ctx.stroke();

    ctx.fillStyle = "#123f86";
    ctx.beginPath();
    ctx.ellipse(half * 0.48, -half * 0.14, half * 0.105, half * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(half * 0.45, -half * 0.21, half * 0.035, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f8b51b";
    ctx.strokeStyle = "#a85c08";
    ctx.lineWidth = Math.max(0.8, size * 0.025);
    ctx.beginPath();
    ctx.moveTo(half * 0.78, -half * 0.01);
    ctx.quadraticCurveTo(half * 1.18, half * 0.02, half * 1.03, half * 0.24);
    ctx.quadraticCurveTo(half * 0.9, half * 0.34, half * 0.72, half * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Folded wing and three feather scallops.
    ctx.fillStyle = "#3c9af5";
    ctx.strokeStyle = "#124b9b";
    ctx.lineWidth = stroke;
    ctx.beginPath();
    ctx.moveTo(-half * 0.18, half * 0.22);
    ctx.quadraticCurveTo(half * 0.26, half * 0.12, half * 0.53, half * 0.4);
    ctx.quadraticCurveTo(half * 0.83, half * 0.72, half * 0.44, half * 0.72);
    ctx.quadraticCurveTo(half * 0.23, half * 0.82, half * 0.05, half * 0.65);
    ctx.quadraticCurveTo(-half * 0.3, half * 0.66, -half * 0.18, half * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Two tail feathers extend behind the body.
    ctx.fillStyle = "#2782e8";
    ctx.beginPath();
    ctx.moveTo(-half * 0.62, half * 0.43);
    ctx.quadraticCurveTo(-half * 1.05, half * 0.48, -half * 0.9, half * 0.72);
    ctx.quadraticCurveTo(-half * 0.56, half * 0.73, -half * 0.36, half * 0.6);
    ctx.closePath();
    ctx.fill();
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

  // Walking feet: alternate lift and stride only while the owl is moving.
  if (direction !== "up") {
    const footLiftA = sideView && isMoving ? Math.max(0, step) * half * 0.16 : 0;
    const footLiftB = sideView && isMoving ? Math.max(0, -step) * half * 0.16 : 0;
    const footStrideA = sideView && isMoving ? step * half * 0.12 : 0;
    const footStrideB = sideView && isMoving ? -step * half * 0.12 : 0;

    ctx.fillStyle = "#f7a914";
    ctx.strokeStyle = "#b9680a";
    ctx.lineWidth = Math.max(0.7, size * 0.02);
    ctx.beginPath();
    if (sideView) {
      ctx.ellipse(-half * 0.02 + footStrideA, half * 0.79 - footLiftA, half * 0.19, half * 0.075, -0.08 - step * 0.12, 0, Math.PI * 2);
      ctx.ellipse(half * 0.38 + footStrideB, half * 0.79 - footLiftB, half * 0.2, half * 0.075, 0.08 + step * 0.12, 0, Math.PI * 2);
    } else {
      ctx.ellipse(-half * 0.27, half * 0.78, half * 0.17, half * 0.075, 0, 0, Math.PI * 2);
      ctx.ellipse(half * 0.27, half * 0.78, half * 0.17, half * 0.075, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
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
    } else if (sideView) {
      ctx.strokeStyle = "#172033";
      ctx.lineWidth = Math.max(0.9, size * 0.045);
      ctx.beginPath();
      ctx.ellipse(half * 0.48, -half * 0.14, half * 0.15, half * 0.22, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(half * 0.62, -half * 0.13);
      ctx.lineTo(half * 0.82, -half * 0.1);
      ctx.stroke();
    }

    // Graduation cap sits above the same feathered head silhouette.
    ctx.fillStyle = "#172554";
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
