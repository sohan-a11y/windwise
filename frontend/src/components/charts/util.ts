export type Point = { x: number; y: number };

export function linePath(points: Array<Point | null>): string {
  let path = "";
  let open = false;
  for (const point of points) {
    if (!point) {
      open = false;
      continue;
    }
    path += `${open ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)} `;
    open = true;
  }
  return path.trim();
}

export function bandPath(
  top: Array<Point | null>,
  bottom: Array<Point | null>,
): string {
  const topPoints = top.filter((point): point is Point => point !== null);
  const bottomPoints = bottom.filter((point): point is Point => point !== null);
  if (topPoints.length < 2 || bottomPoints.length < 2) return "";
  const upper = topPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const lower = [...bottomPoints]
    .reverse()
    .map((p) => `L${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  return `${upper} ${lower} Z`;
}

export function tickStep(max: number): number {
  if (max <= 6000) return 2000;
  if (max <= 12000) return 3000;
  if (max <= 24000) return 4000;
  return 6000;
}

export function ticks(max: number, step: number): number[] {
  const output: number[] = [];
  for (let value = 0; value <= max + step * 0.5; value += step) output.push(value);
  return output;
}

export function axisTicks(hours = 24, every = 3): number[] {
  const output: number[] = [];
  for (let hour = 0; hour < hours; hour += every) output.push(hour);
  return output;
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const normalised =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;
  const red = Number.parseInt(normalised.slice(0, 2), 16);
  const green = Number.parseInt(normalised.slice(2, 4), 16);
  const blue = Number.parseInt(normalised.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
