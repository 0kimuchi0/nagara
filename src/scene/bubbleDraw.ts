import type { RGB } from "../palette";

const rgba = (c: RGB, a: number): string =>
  `rgba(${c[0]},${c[1]},${c[2]},${Math.min(1, Math.max(0, a)).toFixed(3)})`;

/**
 * 泡を 1 つ描く: ほとんど透明な中身、光る縁、左上の明るいハイライト、右下の小さな照り返し。
 * wobble (-1..1) で、上がりながらわずかに横長・縦長にゆらぐ。
 */
export function drawBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  light: RGB,
  wobble: number,
  alpha = 1,
): void {
  const rx = r * (1 + 0.08 * wobble);
  const ry = r * (1 - 0.08 * wobble);
  // 中身: 中心ほど透明、縁に向かって少しだけ色がつく
  const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
  g.addColorStop(0, rgba(light, 0.02 * alpha));
  g.addColorStop(0.8, rgba(light, 0.1 * alpha));
  g.addColorStop(1, rgba(light, 0.22 * alpha));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  // 縁
  ctx.lineWidth = Math.max(0.6, r * 0.12);
  ctx.strokeStyle = rgba([255, 255, 255], 0.5 * alpha);
  ctx.stroke();
  // ハイライト (左上)
  ctx.fillStyle = rgba([255, 255, 255], 0.75 * alpha);
  ctx.beginPath();
  ctx.ellipse(x - rx * 0.35, y - ry * 0.38, Math.max(0.5, rx * 0.28), Math.max(0.4, ry * 0.16), -0.6, 0, Math.PI * 2);
  ctx.fill();
  // 照り返し (右下)
  if (r > 2.5) {
    ctx.fillStyle = rgba([255, 255, 255], 0.3 * alpha);
    ctx.beginPath();
    ctx.ellipse(x + rx * 0.4, y + ry * 0.45, rx * 0.18, ry * 0.08, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}
