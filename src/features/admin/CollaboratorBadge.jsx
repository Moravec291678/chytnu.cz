import "./CollaboratorBadge.css";

// Access must come from /api/admin self, never a profile field or custom claim.
export default function CollaboratorBadge({ access }) {
  if (!access || access.suspended || !["OWNER", "CO_CREATOR"].includes(access.role)) return null;
  const owner = access.role === "OWNER";
  return <span className={`collaborator-badge collaborator-badge--${owner ? "founder" : "creator"}`} title={owner ? "Founder & Owner" : "Co-Creator & Fishing Lead"}>
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{owner
      ? <path d="M3 6l5 4 4-7 4 7 5-4-2 12H5L3 6zm2 15h14v-2H5z" />
      : <><path d="M7 3h10l5 7-10 12L2 10l5-7z" /><path className="collaborator-gem-facet" d="M2 10h20M7 3l5 19 5-19" /></>}</svg>
    <span><b>{owner ? "Zakladatel" : "Spolutvůrce"}</b><small>{owner ? "Founder & Owner" : "Co-Creator & Fishing Lead"}</small></span>
  </span>;
}
