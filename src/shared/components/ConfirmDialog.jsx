import { useEffect, useRef } from "react";

function ConfirmDialog({ titleId, descriptionId, title, description, busy = false, confirmLabel, busyLabel, confirmClassName, onCancel, onConfirm }) {
  const cancelButtonRef = useRef(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    cancelButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [busy, onCancel]);

  return <div className="catch-confirm-backdrop">
    <section className="catch-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{description}</p>
      <div className="catch-detail-actions">
        <button ref={cancelButtonRef} className="photo-action-button" type="button" onClick={onCancel} disabled={busy}>Zrušit</button>
        <button className={confirmClassName} type="button" onClick={onConfirm} disabled={busy}>{busy ? busyLabel : confirmLabel}</button>
      </div>
    </section>
  </div>;
}

export default ConfirmDialog;
