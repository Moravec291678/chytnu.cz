import { useRef, useState } from "react";
import { DEFAULT_PHOTO_FRAME, normalizePhotoFrame, photoFrameStyle } from "../data/photoFraming.js";
import "./PhotoFrameEditor.css";

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

export default function PhotoFrameEditor({ photo, onSave, onCancel }) {
  const [frame, setFrame] = useState(() => normalizePhotoFrame(photo));
  const dragRef = useRef(null);

  const move = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    setFrame((current) => ({
      ...current,
      focalX: clamp(current.focalX - dx / drag.width * 0.9, 0, 1),
      focalY: clamp(current.focalY - dy / drag.height * 0.9, 0, 1),
    }));
  };

  const endDrag = () => { dragRef.current = null; };
  const startDrag = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const nudge = (x, y) => setFrame((current) => ({ ...current, focalX: clamp(current.focalX + x, 0, 1), focalY: clamp(current.focalY + y, 0, 1) }));

  return <div className="photo-frame-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="photo-frame-editor" role="dialog" aria-modal="true" aria-labelledby="photo-frame-editor-title">
      <h2 id="photo-frame-editor-title">Upravit zobrazení fotografie</h2>
      <p className="photo-frame-editor-note">Posuň fotografii tak, aby v rámečku zůstala důležitá část. Originální soubor se nemění.</p>
      <div className="photo-frame-canvas" onPointerDown={startDrag} onPointerMove={move} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={(event) => {
        const step = event.shiftKey ? 0.05 : 0.02;
        const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (moves[event.key]) { event.preventDefault(); nudge(...moves[event.key]); }
      }} tabIndex="0" aria-label="Náhled výřezu fotografie, použij šipky nebo tažení">
        <img src={photo.previewUrl} alt="Úprava výřezu fotografie úlovku" style={photoFrameStyle(frame)} draggable="false" />
      </div>
      <label className="photo-frame-zoom">Přiblížení
        <input type="range" min="1" max="2" step="0.01" value={frame.zoom} onChange={(event) => setFrame((current) => ({ ...current, zoom: Number(event.target.value) }))} />
      </label>
      <div className="photo-frame-editor-actions">
        <button type="button" onClick={() => setFrame(DEFAULT_PHOTO_FRAME)}>Obnovit výchozí</button>
        <button type="button" onClick={onCancel}>Zrušit</button>
        <button type="button" className="photo-frame-save" onClick={() => onSave(frame)}>Uložit</button>
      </div>
    </section>
  </div>;
}
