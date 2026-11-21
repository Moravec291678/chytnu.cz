import { useContext, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import LeaveDraftDialog from "./LeaveDraftDialog.jsx";
import { NavigationMemory } from "./navigationMemory.js";
import "./PageBackLink.css";

export default function PageBackLink({ to, unsaved = false, disabled = false, beforeLeave, allowSamePage = false, useHistory = true }) {
  const memory = useContext(NavigationMemory);
  const location = useLocation();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function leave() {
    setConfirming(false);
    if (beforeLeave) {
      setPending(true);
      setError("");
      try { await beforeLeave(); }
      catch { setError("Koncept se nepodařilo uložit. Zůstáváš ve formuláři."); return; }
      finally { setPending(false); }
    }
    const steps = useHistory ? memory?.backSteps(location.key, allowSamePage) : 0;
    if (steps) {
      memory.requestRestore();
      navigate(-steps);
    } else {
      navigate(to, { replace: true });
    }
  }

  return <>
    <Link className="page-back-link" to={to} replace aria-disabled={disabled || pending || undefined} onClick={event => {
      if (event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      if (disabled || pending) return;
      if (unsaved) setConfirming(true);
      else void leave();
    }}><span aria-hidden="true">←</span> Zpět</Link>
    {error && <p className="page-back-error" role="alert">{error}</p>}
    {confirming && <LeaveDraftDialog onCancel={() => setConfirming(false)} onConfirm={() => void leave()} />}
  </>;
}
