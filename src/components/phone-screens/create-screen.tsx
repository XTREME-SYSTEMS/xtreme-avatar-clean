"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, PointerEvent } from "react";
import { PhoneIcon } from "@/components/phone-icon";
import { phoneDesignAssets } from "@/lib/phone-design-assets";
import {
  applyCanvasCommand, CANVAS_LINES_MAX, CANVAS_OBJECT_LIMIT, CANVAS_POSITION_MAX, CANVAS_TEXT_MAX,
  createCanvasState, listenForCanvasCommands,
} from "@/lib/canvas-commands";
import type { CanvasCommand, CanvasCommandResult, CanvasPosition, CanvasTextObject } from "@/lib/canvas-commands";
import {
  ARTBOARD_HEIGHT, ARTBOARD_WIDTH, clampPosition, createTextMeasurer, layoutText, paintCanvas,
} from "./canvas-renderer";
import type { TextFrame } from "./canvas-renderer";
import styles from "./creative-screens.module.css";

const studios = [
  { name: "Apps", icon: "imgIconBox" },
  { name: "Workflow", icon: "imgIconGear" },
  { name: "AI agents", icon: "imgIconSpark" },
  { name: "Design", icon: "imgIconImage" },
] as const;
const artwork = phoneDesignAssets.create.imgImageCanvasDesertStudy;
const errors: Record<Extract<CanvasCommandResult, { ok: false }>["error"], string> = {
  invalid_command: `Enter text with 1 to ${CANVAS_TEXT_MAX} characters and up to ${CANVAS_LINES_MAX} lines.`,
  object_not_found: "That text layer is no longer on the canvas.",
  object_limit: `This canvas supports up to ${CANVAS_OBJECT_LIMIT} text layers.`,
  nothing_to_undo: "There are no canvas edits to undo.",
  nothing_to_redo: "There are no canvas edits to redo.",
};
type EditorState = ReturnType<typeof createCanvasState>;
type RunCommand = (command: CanvasCommand, success?: string) => CanvasCommandResult;

type Drag = {
  pointerId: number;
  frame: TextFrame;
  startX: number;
  startY: number;
  scaleX: number;
  scaleY: number;
};
type DragPreview = CanvasPosition & { object: Readonly<CanvasTextObject> };
type ArtboardResource = { image: HTMLImageElement; measure: (text: string) => number };

function dragPosition(drag: Drag, event: PointerEvent<HTMLButtonElement>): CanvasPosition {
  const { object, travelX, travelY } = drag.frame;
  return {
    x: clampPosition(object.x + CANVAS_POSITION_MAX * (event.clientX - drag.startX) * drag.scaleX / travelX),
    y: clampPosition(object.y + CANVAS_POSITION_MAX * (event.clientY - drag.startY) * drag.scaleY / travelY),
  };
}

function labelFor(object: Readonly<CanvasTextObject>) {
  const text = object.text.trim().replace(/\s+/g, " ");
  return `Text ${object.id.slice(5)} · ${text.length > 32 ? `${text.slice(0, 32)}…` : text}`;
}

function CanvasArtboard({ state, readState, run, focusComposer, report }: {
  state: EditorState;
  readState: () => EditorState;
  run: RunCommand;
  focusComposer: () => void;
  report: (message: string) => void;
}) {
  const [resource, setResource] = useState<ArtboardResource | null>(null);
  const [artworkError, setArtworkError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const { objects, selectedId } = state.present;

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      const context = document.createElement("canvas").getContext("2d");
      if (context) setResource({ image, measure: createTextMeasurer(context) });
      else setArtworkError(true);
    };
    image.onerror = () => setArtworkError(true);
    image.src = artwork.src;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, []);

  const frames = useMemo(() => resource ? objects.map(object => layoutText(
    preview?.object === object && object.id === selectedId ? { ...object, x: preview.x, y: preview.y } : object,
    resource.measure,
  )) : [], [objects, preview, resource, selectedId]);

  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (context && resource) paintCanvas(context, resource.image, frames, selectedId);
  }, [frames, resource, selectedId]);

  function beginDrag(event: PointerEvent<HTMLButtonElement>, frame: TextFrame) {
    if (!event.isPrimary || event.button !== 0 || !canvas.current) return;
    const rect = canvas.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    run({ type: "select_object", id: frame.object.id });
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scaleX: ARTBOARD_WIDTH / rect.width,
      scaleY: ARTBOARD_HEIGHT / rect.height,
      frame,
    };
  }

  function activeDrag(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return null;
    const current = readState().present;
    const { object } = active.frame;
    return current.selectedId === object.id && current.objects.includes(object) ? active : null;
  }

  function cancelDrag(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setPreview(null);
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const active = activeDrag(event);
    cancelDrag(event);
    if (!active) return;
    run({ type: "move_object", id: active.frame.object.id, ...dragPosition(active, event) });
  }

  async function exportPng() {
    if (!resource || exporting) return;
    setExporting(true);
    try {
      const output = document.createElement("canvas");
      output.width = ARTBOARD_WIDTH;
      output.height = ARTBOARD_HEIGHT;
      const context = output.getContext("2d");
      if (!context) throw new Error("Canvas rendering is unavailable");
      const frames = readState().present.objects.map(object => layoutText(object, resource.measure));
      paintCanvas(context, resource.image, frames);
      const blob = await new Promise<Blob | null>(resolve => output.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("PNG encoding is unavailable");
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = "desert-study.png";
        link.click();
        report("PNG download requested.");
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
    } catch {
      report("PNG export failed. Try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className={styles.canvas} aria-label="Editable canvas">
      <div className={styles.artboard}>
        <canvas ref={canvas} width={ARTBOARD_WIDTH} height={ARTBOARD_HEIGHT} role="img"
          aria-label="Desert study. A sculpted arch and curved stairway framing the setting sun." />
        {frames.map(frame => (
          <button
            key={frame.object.id}
            type="button"
            aria-label={labelFor(frame.object)}
            aria-pressed={selectedId === frame.object.id}
            className={styles.textTarget}
            style={{
              left: `${100 * frame.left / ARTBOARD_WIDTH}%`,
              top: `${100 * frame.top / ARTBOARD_HEIGHT}%`,
              width: `${100 * frame.width / ARTBOARD_WIDTH}%`,
              height: `${100 * frame.height / ARTBOARD_HEIGHT}%`,
            }}
            onClick={event => { if (event.detail === 0) run({ type: "select_object", id: frame.object.id }); }}
            onPointerDown={event => beginDrag(event, frame)}
            onPointerMove={event => {
              const active = activeDrag(event);
              if (active) setPreview({ object: active.frame.object, ...dragPosition(active, event) });
            }}
            onPointerUp={endDrag}
            onPointerCancel={cancelDrag}
            onLostPointerCapture={cancelDrag}
          />
        ))}
      </div>
      <div className={styles.canvasToolbar} role="group" aria-label="Canvas actions">
        <strong>Desert study</strong>
        <button type="button" disabled={!state.past.length} onClick={() => run({ type: "undo" }, "Canvas edit undone.")}>Undo</button>
        <button type="button" disabled={!state.future.length} onClick={() => run({ type: "redo" }, "Canvas edit redone.")}>Redo</button>
        <button type="button" disabled={!resource || exporting} onClick={exportPng}>{exporting ? "Exporting…" : "Export PNG"}</button>
      </div>
      {!resource && <p className={styles.canvasNotice} role="status">{artworkError ? "The canvas artwork could not be loaded." : "Loading canvas…"}</p>}
      {resource && !objects.length && <div className={styles.canvasNotice}><button type="button" onClick={focusComposer}>Add text to canvas</button></div>}
    </section>
  );
}

const moves = [
  { label: "Move text left", arrow: "←", x: -50, y: 0 },
  { label: "Move text up", arrow: "↑", x: 0, y: -50 },
  { label: "Move text down", arrow: "↓", x: 0, y: 50 },
  { label: "Move text right", arrow: "→", x: 50, y: 0 },
];

function TextForm({ object, run, inputRef }: {
  object: Readonly<CanvasTextObject> | undefined;
  run: RunCommand;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const id = object?.id ?? null;
  const [draft, setDraft] = useState<{ id: string | null; text: string | null }>({ id, text: null });
  if (draft.id !== id) setDraft({ id, text: null });
  const text = (draft.id === id ? draft.text : null) ?? object?.text ?? "";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = object
      ? run({ type: "update_text", id: object.id, text }, "Text updated.")
      : run({ type: "add_text", text }, "Text added.");
    if (result.ok) setDraft({ id, text: null });
  }

  return (
    <form onSubmit={submit} className={styles.textForm}>
      <label htmlFor="canvas-text">{object ? "Edit text" : "New text"}</label>
      <textarea id="canvas-text" ref={inputRef} value={text} onChange={event => setDraft({ id, text: event.target.value })}
        placeholder="Type on the canvas…" rows={2} maxLength={CANVAS_TEXT_MAX} aria-describedby="canvas-help" />
      <div className={styles.composerFooter}>
        {object && <>
          <div className={styles.moveControls} role="group" aria-label="Move selected text">
            {moves.map(move => {
              const x = clampPosition(object.x + move.x);
              const y = clampPosition(object.y + move.y);
              return <button key={move.label} type="button" aria-label={move.label} disabled={x === object.x && y === object.y}
                onClick={() => run({ type: "move_object", id: object.id, x, y }, "Text moved.")}>{move.arrow}</button>;
            })}
          </div>
          <button type="button" onClick={() => run({ type: "delete_object", id: object.id }, "Text deleted.")}>Delete</button>
        </>}
        <button type="submit" className={styles.applyText} disabled={!text.trim() || text === object?.text}>{object ? "Apply text" : "Add text"}</button>
      </div>
    </form>
  );
}

export function CreateScreen() {
  const [state, setState] = useState(createCanvasState);
  const [message, setMessage] = useState("");
  const current = useRef(state);
  const input = useRef<HTMLTextAreaElement>(null);
  const selected = state.present.objects.find(object => object.id === state.present.selectedId);
  const readState = useCallback(() => current.current, []);

  const execute = useCallback((command: unknown) => {
    const transition = applyCanvasCommand(current.current, command);
    if (transition.state !== current.current) {
      current.current = transition.state;
      setState(transition.state);
    }
    return transition.result;
  }, []);

  useEffect(() => listenForCanvasCommands(window, execute), [execute]);

  const run: RunCommand = (command, success = "") => {
    const result = execute(command);
    setMessage(result.ok ? success : errors[result.error]);
    return result;
  };

  function focusComposer() {
    input.current?.focus();
  }

  return (
    <div className={`${styles.screen} ${styles.createScreen} phone-screen`} data-design-node="42:928">
      <header className={styles.createHeading}>
        <Link className={styles.back} href="/"><span aria-hidden="true">‹</span> Home</Link>
        <h1>Create with Eden</h1>
        <button type="button" className={styles.micButton} aria-label="Open Eden voice"
          onClick={() => window.dispatchEvent(new Event("avatar:voice-open"))}><PhoneIcon screen="create" name="imgMicrophone" /></button>
      </header>
      <CanvasArtboard state={state} readState={readState} run={run} focusComposer={focusComposer} report={setMessage} />
      <section className={styles.studioSection} aria-label="Generation studios">
        <p>Generation studios</p>
        <div className={styles.studioGrid}>
          {studios.map(item => <button key={item.name} type="button" disabled={item.name !== "Design"}
            aria-pressed={item.name === "Design"} onClick={focusComposer}>
            <PhoneIcon screen="create" name={item.icon} /><span>{item.name}</span>
          </button>)}
        </div>
      </section>
      <section className={styles.composer} aria-label="Canvas text controls">
        {state.present.objects.length > 0 && <div className={styles.layerSelect}>
          <label htmlFor="canvas-layer">Text layer</label>
          <select id="canvas-layer" value={selected?.id ?? ""} onChange={event => run({ type: "select_object", id: event.target.value || null })}>
            <option value="">New text layer</option>
            {state.present.objects.map(object => <option value={object.id} key={object.id}>{labelFor(object)}</option>)}
          </select>
        </div>}
        <TextForm object={selected} run={run} inputRef={input} />
        <p className={styles.footnote} id="canvas-help">Drag text or use the arrows to move it. Export a PNG before leaving.</p>
        <p className={styles.canvasStatus} role="status">{message}</p>
      </section>
    </div>
  );
}
