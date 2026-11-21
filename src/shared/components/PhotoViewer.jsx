import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { advancePhoto, swipePhotoDirection } from "./photoViewerNavigation.js";
import "./PhotoViewer.css";

const interactive = "button, a, input, select, textarea, [contenteditable], [role='button']";

export function ViewerImage({ src, alt }) {
  const [result, setResult] = useState(null);
  const status = result?.src === src ? result.status : "loading";
  return !src || status === "error"
    ? <p className="photo-viewer-status" role="status">Fotografie není dostupná.</p>
    : <>
      {status === "loading" && <p className="photo-viewer-status" role="status">Načítám fotografii…</p>}
      <img className={status === "loading" ? "photo-viewer-pending-image" : undefined} src={src} alt={alt} draggable={false}
        onLoad={() => setResult({ src, status: "ready" })} onError={() => setResult({ src, status: "error" })} />
    </>;
}

export default function PhotoViewer({ items, index, onSelect, onClose, describe, renderImage, actions, panel }) {
  const modal = useRef(null);
  const closeButton = useRef(null);
  const gesture = useRef(null);
  const item = items[index];
  const shown = Boolean(item);

  useLayoutEffect(() => {
    if (!shown) return undefined;
    const dialog = modal.current;
    const opener = document.activeElement;
    dialog.showModal();
    closeButton.current.focus({ preventScroll: true });
    return () => {
      if (dialog.open) dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [shown]);

  if (!item) return null;
  const { title, description } = describe(item);
  const canMove = !panel && items.length > 1;
  function move(direction) {
    if (canMove && direction) onSelect(advancePhoto(index, items.length, direction));
  }

  return createPortal(<dialog ref={modal} className="photo-viewer" aria-label="Náhled fotografie"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      if (!canMove || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.target.closest("input, select, textarea, [contenteditable]")) return;
      const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (direction) { event.preventDefault(); move(direction); }
    }}>
    <header className="photo-viewer-header">
      <div><strong>{title}</strong>{description && <p>{description}</p>}</div>
      <button ref={closeButton} type="button" className="photo-viewer-close" onClick={onClose}>
        <span aria-hidden="true">×</span> Zavřít
      </button>
    </header>
    {panel ? <div className="photo-viewer-panel">{panel}</div> : <div className="photo-viewer-stage">
      <div className="photo-viewer-media" onDragStart={event => event.preventDefault()}
        onPointerDown={event => {
          if (!event.isPrimary) { gesture.current = null; return; }
          if (!canMove || event.pointerType === "mouse" || event.target.closest(interactive)) return;
          gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { gesture.current = null; }}
        onLostPointerCapture={() => { gesture.current = null; }}
        onPointerUp={event => {
          const start = gesture.current;
          gesture.current = null;
          if (start?.id === event.pointerId) move(swipePhotoDirection(start, { x: event.clientX, y: event.clientY }));
        }}>
        {renderImage(item)}
      </div>
      {canMove && <>
        <button type="button" className="photo-viewer-arrow photo-viewer-prev" aria-label="Předchozí fotografie" onClick={() => move(-1)}>‹</button>
        <button type="button" className="photo-viewer-arrow photo-viewer-next" aria-label="Další fotografie" onClick={() => move(1)}>›</button>
      </>}
    </div>}
    <footer className="photo-viewer-footer">
      <span className="photo-viewer-count" role="status">{index + 1} / {items.length}</span>
      {actions?.(item)}
    </footer>
  </dialog>, document.body);
}
