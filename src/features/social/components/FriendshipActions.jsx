const friendshipLabels = { none: "Zatím nejste přátelé", outgoing: "Pozvání odesláno", incoming: "Příchozí pozvání", friends: "Přátelé", rejected: "Pozvání bylo odmítnuto", cancelled: "Pozvání bylo zrušeno", unfriended: "Přátelství bylo ukončeno", blocked: "Propojení není dostupné" };

export default function FriendshipActions({ relationship, busy = false, onAction }) {
  const status = relationship?.status ?? "none";
  return <div className="friendship-controls"><p className="fisher-relationship-status" role="status">{friendshipLabels[status] ?? "Propojení není dostupné"}</p><div className="fisher-result-actions">
    {["none", "rejected", "cancelled", "unfriended"].includes(status) && relationship?.canRequest === true && <button className="social-primary" disabled={busy} onClick={() => onAction("request")}>Pozvat do přátel</button>}
    {status === "incoming" && <><button className="social-primary" disabled={busy} onClick={() => onAction("accept")}>Přijmout pozvání</button><button disabled={busy} onClick={() => onAction("reject")}>Odmítnout</button></>}
    {status === "outgoing" && <button disabled={busy} onClick={() => onAction("cancel")}>Zrušit pozvání</button>}
    {status === "friends" && <button disabled={busy} onClick={() => onAction("unfriend")}>Odebrat z přátel</button>}
    {status === "blocked" && <button disabled={busy} onClick={() => onAction("unblock")}>Zrušit blokování</button>}
  </div></div>;
}
