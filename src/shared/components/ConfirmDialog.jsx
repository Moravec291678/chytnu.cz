import { useRef } from "react";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap.js";
import "./ConfirmDialog.css";

function ConfirmDialog({ titleId, descriptionId, title, description, busy = false, confirmLabel, busyLabel, confirmClassName, onCancel, onConfirm }) {
  const cancelButtonRef = useRef(null);
  const dialogRef = useRef(null);
  useModalFocusTrap(dialogRef, { initialFocusRef: cancelButtonRef, onEscape: busy ? undefined : onCancel });

  return <div className="catch-confirm-backdrop">
    <section ref={dialogRef} tabIndex="-1" className="catch-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
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
