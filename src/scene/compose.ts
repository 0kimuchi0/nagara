/** このキャンバスが ctx.filter (ぼかしなど) に対応しているか */
export function supportsFilter(ctx: CanvasRenderingContext2D): boolean {
  return typeof (ctx as unknown as { filter?: unknown }).filter === "string";
}

/**
 * 別に描いておいた層を、ぼかして重ねる (被写界深度: 奥の景色はピントが外れて見える)。
 * ぼかしに対応していないブラウザでは、そのまま重ねる。
 */
export function drawBlurred(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  blurPx: number,
  width: number,
  height: number,
): void {
  if (supportsFilter(ctx) && blurPx > 0) {
    const prev = ctx.filter;
    ctx.filter = `blur(${blurPx}px)`;
    ctx.drawImage(src, 0, 0, width, height);
    ctx.filter = prev;
  } else {
    ctx.drawImage(src, 0, 0, width, height);
  }
}
