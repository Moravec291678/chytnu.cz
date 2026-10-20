import "./UIStates.css";
import { getOfflineNoticeCopy } from "./offlineNoticeCopy.js";

function classes(base, className) {
  return [base, className].filter(Boolean).join(" ");
}

export function EmptyState({ title, description, action, className = "" }) {
  return <section className={classes("ui-state ui-state-empty", className)}>
    {title && <strong>{title}</strong>}
    {description && <p>{description}</p>}
    {action}
  </section>;
}

export function ErrorState({ title = "Něco se nepodařilo", message, onRetry, retryLabel = "Zkusit znovu", className = "" }) {
  return <section className={classes("ui-state ui-state-error", className)} role="alert">
    {title && <h2>{title}</h2>}
    <p>{message}</p>
    {onRetry && <button type="button" onClick={onRetry}>{retryLabel}</button>}
  </section>;
}

export function NoResultsState({ title = "Nic jsme nenašli", description, action, className = "" }) {
  return <section className={classes("ui-state ui-state-no-results", className)}>
    {title && <strong>{title}</strong>}
    {description && <p>{description}</p>}
    {action}
  </section>;
}

export function PermissionDeniedState({ title = "Povolení nebylo uděleno", description, onRetry, retryLabel = "Zkusit znovu", className = "" }) {
  return <section className={classes("ui-state ui-state-permission", className)} role="status">
    <h2>{title}</h2>
    <p>{description}</p>
    {onRetry && <button type="button" onClick={onRetry}>{retryLabel}</button>}
  </section>;
}

export function LoadingSkeleton({ label = "Načítám…", count = 3, className = "", itemClassName = "" }) {
  return <div className={classes("ui-skeleton-list", className)} role="status" aria-label={label} aria-busy="true">
    {Array.from({ length: count }, (_, index) => <span className={itemClassName || undefined} key={index} aria-hidden="true" />)}
  </div>;
}

export function OfflineNotice({ pending = 0, onRetry, status = "offline" }) {
  const failed = status === "error";
  const copy = getOfflineNoticeCopy(status, pending);
  return <aside className={`offline-notice${failed ? " offline-notice-error" : ""}`} role="status" aria-live="polite">
    <div>
      <strong>{copy.title}</strong>
      <p>{copy.description}</p>
    </div>
    {onRetry && <button type="button" onClick={onRetry}>{copy.retryLabel}</button>}
  </aside>;
}
