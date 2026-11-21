import { useId } from "react";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

export default function LeaveDraftDialog({ onCancel, onConfirm }) {
  const id = useId();
  return <ConfirmDialog titleId={`${id}-title`} descriptionId={`${id}-description`}
    title="Opustit rozpracované změny?" description="Neuložené změny v tomto formuláři se zahodí."
    confirmLabel="Opustit formulář" confirmClassName="catch-delete-confirm" onCancel={onCancel} onConfirm={onConfirm} />;
}
