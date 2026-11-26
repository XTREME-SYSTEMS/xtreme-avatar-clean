import { CANVAS_POSITION_MAX, type CanvasTextObject } from "../../lib/canvas-commands.ts";

export const ARTBOARD_WIDTH = 768;
export const ARTBOARD_HEIGHT = 1376;
const LEFT = 24;
// Keep text below the in-canvas toolbar at supported screen widths.
const TOP = 174;
const BOTTOM = 24;
const INSET = 16;
const LINE_HEIGHT = 56;
const FONT = "600 46px Arial, sans-serif";
const TEXT_WIDTH = 600;

export type TextFrame = {
  object: Readonly<CanvasTextObject>;
  lines: string[];
  left: number;
  top: number;
  width: number;
  height: number;
  travelX: number;
  travelY: number;
};

export function clampPosition(value: number) {
  return Math.max(0, Math.min(Math.round(value), CANVAS_POSITION_MAX));
}

export function createTextMeasurer(context: CanvasRenderingContext2D) {
  context.font = FONT;
  context.direction = "ltr";
  return (text: string) => context.measureText(text).width;
}

export function layoutText(object: Readonly<CanvasTextObject>, measure: (text: string) => number): TextFrame {
  const lines = object.text.split("\n");
  const lineWidth = Math.max(...lines.map(measure));
  const width = Math.min(TEXT_WIDTH, Math.max(56, Math.ceil(lineWidth))) + 2 * INSET;
  const height = lines.length * LINE_HEIGHT + 2 * INSET;
  const travelX = ARTBOARD_WIDTH - 2 * LEFT - width;
  const travelY = ARTBOARD_HEIGHT - TOP - BOTTOM - height;
  return {
    object, lines, width, height, travelX, travelY,
    left: LEFT + travelX * object.x / CANVAS_POSITION_MAX,
    top: TOP + travelY * object.y / CANVAS_POSITION_MAX,
  };
}

export function paintCanvas(
  context: CanvasRenderingContext2D,
  background: CanvasImageSource,
  frames: TextFrame[],
  selectedId: string | null = null,
) {
  context.drawImage(background, 0, 0, ARTBOARD_WIDTH, ARTBOARD_HEIGHT);
  context.font = FONT;
  context.direction = "ltr";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.strokeStyle = "#191410";
  context.fillStyle = "#fff7df";
  context.lineWidth = 5;
  for (const frame of frames) {
    frame.lines.forEach((line, index) => {
      const x = frame.left + INSET;
      const y = frame.top + INSET + (index + 0.5) * LINE_HEIGHT;
      context.strokeText(line, x, y, TEXT_WIDTH);
      context.fillText(line, x, y, TEXT_WIDTH);
    });
  }

  const selected = frames.find(frame => frame.object.id === selectedId);
  if (selected) {
    context.strokeStyle = "#ffe1a1";
    context.lineWidth = 4;
    context.strokeRect(selected.left, selected.top, selected.width, selected.height);
  }
}
