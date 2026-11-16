export type OwlDirection = "left" | "right" | "up" | "down";

/**
 * Directional artwork follows the supplied eight-pose character sheet:
 * row one is the plain owl, row two adds glasses and the graduation cap.
 * The same body proportions are used in all four directions.
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
  const s = size;
  const h = s / 2;
  const line = Math.max(0.9, s * 0.045);
  const phase = isMoving ? Math.sin(frame * 1.7) : 0;
  const bob = isMoving ? Math.abs(Math.cos(frame * 1.7)) * s * 0.025 : 0;
  const side = direction === "left" || direction === "right";

  ctx.save();
  ctx.translate(x, y + bob);
  if (direction === "left") ctx.scale(-1, 1);

  const outline = (fill: string, stroke = "#124b9b", width = line) => {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
  };

  const drawFeet = (axis: "front" | "side" | "back") => {
    const liftA = isMoving ? Math.max(0, phase) * h * 0.22 : 0;
    const liftB = isMoving ? Math.max(0, -phase) * h * 0.22 : 0;
    const strideA = isMoving ? phase * h * 0.13 : 0;
    const strideB = -strideA;
    outline("#f8b51b", "#a85c08", Math.max(0.8, s * 0.025));
    ctx.beginPath();
    if (axis === "side") {
      ctx.ellipse(-h * 0.12 + strideA, h * 0.77 - liftA, h * 0.22, h * 0.085, -0.08 - phase * 0.12, 0, Math.PI * 2);
      ctx.ellipse(h * 0.35 + strideB, h * 0.77 - liftB, h * 0.22, h * 0.085, 0.08 + phase * 0.12, 0, Math.PI * 2);
    } else {
      ctx.ellipse(-h * 0.28 + strideA, h * 0.79 - liftA, h * 0.19, h * 0.075, axis === "back" ? -phase * 0.08 : 0, 0, Math.PI * 2);
      ctx.ellipse(h * 0.28 + strideB, h * 0.79 - liftB, h * 0.19, h * 0.075, axis === "back" ? phase * 0.08 : 0, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
    // Three short toe marks make the yellow shapes read clearly as feet.
    ctx.strokeStyle = "#a85c08";
    ctx.lineWidth = Math.max(0.65, s * 0.018);
    ctx.beginPath();
    if (axis === "side") {
      ctx.moveTo(-h * 0.2 + strideA, h * 0.77 - liftA); ctx.lineTo(-h * 0.2 + strideA, h * 0.84 - liftA);
      ctx.moveTo(-h * 0.08 + strideA, h * 0.77 - liftA); ctx.lineTo(-h * 0.08 + strideA, h * 0.84 - liftA);
      ctx.moveTo(h * 0.28 + strideB, h * 0.77 - liftB); ctx.lineTo(h * 0.28 + strideB, h * 0.84 - liftB);
    } else {
      ctx.moveTo(-h * 0.33 + strideA, h * 0.77 - liftA); ctx.lineTo(-h * 0.33 + strideA, h * 0.83 - liftA);
      ctx.moveTo(-h * 0.25 + strideA, h * 0.77 - liftA); ctx.lineTo(-h * 0.25 + strideA, h * 0.83 - liftA);
      ctx.moveTo(h * 0.23 + strideB, h * 0.77 - liftB); ctx.lineTo(h * 0.23 + strideB, h * 0.83 - liftB);
    }
    ctx.stroke();
  };

  if (side) {
    // Side profile: round blue body, prominent white facial disk, one eye and beak.
    outline("#3299f5");
    ctx.beginPath();
    ctx.ellipse(0, 0, h * 0.91, h * 0.94, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Two swept-back feather tufts, like the reference's distinct owl ears.
    outline("#3299f5");
    ctx.beginPath();
    ctx.moveTo(-h * 0.48, -h * 0.64);
    ctx.lineTo(-h * 0.88, -h * 1.13);
    ctx.quadraticCurveTo(-h * 0.42, -h * 1.02, -h * 0.12, -h * 0.86);
    ctx.quadraticCurveTo(-h * 0.02, -h * 0.7, -h * 0.48, -h * 0.64);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-h * 0.28, -h * 0.68);
    ctx.quadraticCurveTo(-h * 0.12, -h * 0.92, h * 0.1, -h * 0.78);
    ctx.quadraticCurveTo(h * 0.02, -h * 0.58, -h * 0.28, -h * 0.68);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // Large white face patch with the characteristic inward notch near the beak.
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(-h * 0.88, -h * 0.47);
    ctx.quadraticCurveTo(-h * 0.58, -h * 0.9, -h * 0.04, -h * 0.68);
    ctx.quadraticCurveTo(h * 0.55, -h * 0.66, h * 0.67, -h * 0.1);
    ctx.quadraticCurveTo(h * 0.72, h * 0.47, h * 0.2, h * 0.78);
    ctx.lineTo(-h * 0.42, h * 0.74);
    ctx.quadraticCurveTo(-h * 0.08, h * 0.55, -h * 0.3, h * 0.31);
    ctx.quadraticCurveTo(-h * 0.64, h * 0.13, -h * 0.88, -h * 0.47);
    ctx.fill();

    // One large glossy eye.
    ctx.fillStyle = "#123f86";
    ctx.beginPath(); ctx.ellipse(-h * 0.58, -h * 0.13, h * 0.12, h * 0.19, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-h * 0.62, -h * 0.2, h * 0.045, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-h * 0.55, -h * 0.08, h * 0.022, 0, Math.PI * 2); ctx.fill();

    // Golden beak protrudes from the front edge.
    outline("#f8b51b", "#a85c08", Math.max(0.8, s * 0.025));
    ctx.beginPath();
    ctx.moveTo(-h * 0.96, -h * 0.02);
    ctx.quadraticCurveTo(-h * 1.22, h * 0.02, -h * 1.13, h * 0.2);
    ctx.quadraticCurveTo(-h * 1.02, h * 0.32, -h * 0.88, h * 0.2);
    ctx.lineTo(-h * 0.87, h * 0.02);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // Folded wing with a scalloped feather edge.
    outline("#3999f2");
    ctx.beginPath();
    ctx.moveTo(-h * 0.04, h * 0.15);
    ctx.quadraticCurveTo(h * 0.42, h * 0.02, h * 0.67, h * 0.35);
    ctx.quadraticCurveTo(h * 0.84, h * 0.62, h * 0.56, h * 0.76);
    ctx.quadraticCurveTo(h * 0.3, h * 0.86, h * 0.13, h * 0.68);
    ctx.quadraticCurveTo(-h * 0.12, h * 0.67, -h * 0.04, h * 0.15);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#124b9b"; ctx.lineWidth = Math.max(0.7, s * 0.022);
    ctx.beginPath(); ctx.moveTo(h * 0.15, h * 0.49); ctx.quadraticCurveTo(h * 0.38, h * 0.63, h * 0.55, h * 0.49); ctx.stroke();

    // Two little tail feathers at the back.
    outline("#3299f5");
    ctx.beginPath();
    ctx.moveTo(h * 0.67, h * 0.43);
    ctx.quadraticCurveTo(h * 1.05, h * 0.28, h * 1.1, h * 0.48);
    ctx.quadraticCurveTo(h * 0.97, h * 0.65, h * 0.73, h * 0.6);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(h * 0.69, h * 0.55);
    ctx.quadraticCurveTo(h * 1.03, h * 0.57, h * 0.96, h * 0.75);
    ctx.quadraticCurveTo(h * 0.77, h * 0.81, h * 0.63, h * 0.66);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    drawFeet("side");
    if (doctorMode) {
      // Side-view round lens and temple arm.
      ctx.strokeStyle = "#172554"; ctx.lineWidth = Math.max(0.9, s * 0.045);
      ctx.beginPath(); ctx.ellipse(-h * 0.58, -h * 0.13, h * 0.2, h * 0.27, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-h * 0.4, -h * 0.12); ctx.lineTo(-h * 0.17, -h * 0.1); ctx.stroke();
    }
  } else if (direction === "down") {
    // Front view: twin feather ears, round owl face, belly feathers and both wings.
    outline("#3299f5");
    ctx.beginPath(); ctx.ellipse(0, 0, h * 0.9, h * 0.94, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    outline("#3299f5");
    ctx.beginPath();
    ctx.moveTo(-h * 0.62, -h * 0.62);
    ctx.quadraticCurveTo(-h * 1.12, -h * 1.1, -h * 0.38, -h * 0.83);
    ctx.quadraticCurveTo(-h * 0.18, -h * 0.7, -h * 0.62, -h * 0.62);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(h * 0.62, -h * 0.62);
    ctx.quadraticCurveTo(h * 1.12, -h * 1.1, h * 0.38, -h * 0.83);
    ctx.quadraticCurveTo(h * 0.18, -h * 0.7, h * 0.62, -h * 0.62);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(-h * 0.78, -h * 0.38);
    ctx.quadraticCurveTo(-h * 0.5, -h * 0.82, 0, -h * 0.56);
    ctx.quadraticCurveTo(h * 0.5, -h * 0.82, h * 0.78, -h * 0.38);
    ctx.quadraticCurveTo(h * 0.9, h * 0.42, 0, h * 0.68);
    ctx.quadraticCurveTo(-h * 0.9, h * 0.42, -h * 0.78, -h * 0.38);
    ctx.fill();

    ctx.fillStyle = "#123f86";
    ctx.beginPath();
    ctx.ellipse(-h * 0.3, -h * 0.08, h * 0.13, h * 0.19, 0, 0, Math.PI * 2);
    ctx.ellipse(h * 0.3, -h * 0.08, h * 0.13, h * 0.19, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-h * 0.34, -h * 0.15, h * 0.05, 0, Math.PI * 2); ctx.arc(h * 0.26, -h * 0.15, h * 0.05, 0, Math.PI * 2); ctx.fill();

    outline("#f8b51b", "#a85c08", Math.max(0.8, s * 0.025));
    ctx.beginPath(); ctx.moveTo(-h * 0.13, h * 0.04); ctx.quadraticCurveTo(0, -h * 0.03, h * 0.13, h * 0.04); ctx.lineTo(0, h * 0.31); ctx.closePath(); ctx.fill(); ctx.stroke();

    // Small blue teardrop chest feathers.
    ctx.fillStyle = "#83c4ff";
    for (const [fx, fy, angle] of [[-h * 0.22, h * 0.42, -0.25], [0, h * 0.43, 0], [h * 0.22, h * 0.42, 0.25], [-h * 0.11, h * 0.61, -0.12], [h * 0.11, h * 0.61, 0.12]] as const) {
      ctx.save(); ctx.translate(fx, fy); ctx.rotate(angle);
      ctx.beginPath(); ctx.moveTo(0, -h * 0.09); ctx.quadraticCurveTo(h * 0.16, h * 0.04, 0, h * 0.15); ctx.quadraticCurveTo(-h * 0.16, h * 0.04, 0, -h * 0.09); ctx.fill(); ctx.restore();
    }

    // Wings are drawn over the sides of the white body.
    outline("#3999f2");
    ctx.beginPath();
    ctx.moveTo(-h * 0.68, -h * 0.08);
    ctx.quadraticCurveTo(-h * 0.98, -h * 0.2, -h * 0.92, h * 0.48);
    ctx.quadraticCurveTo(-h * 0.88, h * 0.84, -h * 0.7, h * 0.7);
    ctx.quadraticCurveTo(-h * 0.54, h * 0.88, -h * 0.5, h * 0.65);
    ctx.quadraticCurveTo(-h * 0.39, h * 0.84, -h * 0.34, h * 0.6);
    ctx.lineTo(-h * 0.42, h * 0.02); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(h * 0.68, -h * 0.08);
    ctx.quadraticCurveTo(h * 0.98, -h * 0.2, h * 0.92, h * 0.48);
    ctx.quadraticCurveTo(h * 0.88, h * 0.84, h * 0.7, h * 0.7);
    ctx.quadraticCurveTo(h * 0.54, h * 0.88, h * 0.5, h * 0.65);
    ctx.quadraticCurveTo(h * 0.39, h * 0.84, h * 0.34, h * 0.6);
    ctx.lineTo(h * 0.42, h * 0.02); ctx.closePath(); ctx.fill(); ctx.stroke();
    drawFeet("front");

    if (doctorMode) {
      ctx.strokeStyle = "#172554"; ctx.lineWidth = Math.max(1, s * 0.045);
      ctx.beginPath();
      ctx.arc(-h * 0.3, -h * 0.08, h * 0.23, 0, Math.PI * 2);
      ctx.arc(h * 0.3, -h * 0.08, h * 0.23, 0, Math.PI * 2);
      ctx.moveTo(-h * 0.07, -h * 0.08); ctx.lineTo(h * 0.07, -h * 0.08);
      ctx.stroke();
    }
  } else {
    // Back view: smooth blue head, swept ear tufts, folded wings and central tail.
    outline("#3299f5");
    ctx.beginPath(); ctx.ellipse(0, 0, h * 0.9, h * 0.94, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    outline("#3299f5");
    ctx.beginPath();
    ctx.moveTo(-h * 0.62, -h * 0.62);
    ctx.quadraticCurveTo(-h * 1.1, -h * 1.04, -h * 0.36, -h * 0.82);
    ctx.quadraticCurveTo(-h * 0.18, -h * 0.7, -h * 0.62, -h * 0.62);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(h * 0.62, -h * 0.62);
    ctx.quadraticCurveTo(h * 1.1, -h * 1.04, h * 0.36, -h * 0.82);
    ctx.quadraticCurveTo(h * 0.18, -h * 0.7, h * 0.62, -h * 0.62);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // Gentle back feathers and folded wings.
    ctx.strokeStyle = "#2a7fd6"; ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.beginPath(); ctx.moveTo(-h * 0.42, -h * 0.02); ctx.quadraticCurveTo(-h * 0.18, h * 0.06, 0, h * 0.02); ctx.quadraticCurveTo(h * 0.18, h * 0.06, h * 0.42, -h * 0.02); ctx.stroke();
    outline("#3999f2");
    ctx.beginPath();
    ctx.moveTo(-h * 0.68, -h * 0.02);
    ctx.quadraticCurveTo(-h * 0.98, h * 0.12, -h * 0.88, h * 0.56);
    ctx.quadraticCurveTo(-h * 0.78, h * 0.83, -h * 0.62, h * 0.65);
    ctx.quadraticCurveTo(-h * 0.42, h * 0.83, -h * 0.35, h * 0.56);
    ctx.lineTo(-h * 0.42, h * 0.02); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(h * 0.68, -h * 0.02);
    ctx.quadraticCurveTo(h * 0.98, h * 0.12, h * 0.88, h * 0.56);
    ctx.quadraticCurveTo(h * 0.78, h * 0.83, h * 0.62, h * 0.65);
    ctx.quadraticCurveTo(h * 0.42, h * 0.83, h * 0.35, h * 0.56);
    ctx.lineTo(h * 0.42, h * 0.02); ctx.closePath(); ctx.fill(); ctx.stroke();

    outline("#2782e8");
    ctx.beginPath(); ctx.ellipse(0, h * 0.72, h * 0.17, h * 0.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    drawFeet("back");
  }

  if (doctorMode) {
    // The same navy mortarboard and gold tassel in all four directions.
    ctx.save();
    ctx.translate(0, -h * 0.72);
    outline("#172554", "#101f4d", Math.max(0.9, s * 0.025));
    ctx.beginPath();
    ctx.moveTo(-h * 0.78, -h * 0.02);
    ctx.lineTo(0, -h * 0.39);
    ctx.lineTo(h * 0.78, -h * 0.02);
    ctx.lineTo(0, h * 0.29);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#263b70";
    ctx.beginPath(); ctx.moveTo(-h * 0.55, -h * 0.01); ctx.lineTo(0, -h * 0.27); ctx.lineTo(h * 0.55, -h * 0.01); ctx.lineTo(0, h * 0.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#172554";
    ctx.beginPath(); ctx.moveTo(-h * 0.48, h * 0.12); ctx.quadraticCurveTo(0, h * 0.42, h * 0.48, h * 0.12); ctx.lineTo(h * 0.48, h * 0.25); ctx.quadraticCurveTo(0, h * 0.53, -h * 0.48, h * 0.25); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#a16207"; ctx.lineWidth = Math.max(0.9, s * 0.025);
    ctx.beginPath(); ctx.moveTo(h * 0.57, -h * 0.01); ctx.lineTo(h * 0.7, h * 0.48); ctx.stroke();
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath(); ctx.arc(h * 0.7, h * 0.49, Math.max(1.2, s * 0.045), 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(h * 0.63, h * 0.48); ctx.lineTo(h * 0.77, h * 0.48); ctx.lineTo(h * 0.82, h * 0.85); ctx.quadraticCurveTo(h * 0.7, h * 0.96, h * 0.58, h * 0.85); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}
