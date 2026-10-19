import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { waterRepository } from "../features/waters/data/waterRepository.js";
import "./WaterChatPage.css";

function formatMessageTime(iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("cs-CZ", {
      hour: "2-digit",
      minute: "2-digit",
      day: "numeric",
      month: "numeric",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function WaterChatPage() {
  const { waterId } = useParams();
  const scope = useDataScope();

  const [water, setWater] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [waterData, msgData] = await Promise.all([
        waterRepository.get(waterId, scope),
        waterRepository.listMessages(waterId, scope),
      ]);
      setWater(waterData);
      setMessages(waterData ? msgData : []);
      if (!waterData) setError("Požadovaný revír v tomto místním profilu neexistuje.");
    } catch (err) {
      setError(err?.message || "Nepodařilo se načíst zprávy.");
    } finally {
      setLoading(false);
    }
  }, [waterId, scope]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || sending || loading || !water) return;

    if (trimmed.length > 500) {
      setError("Zpráva může mít maximálně 500 znaků.");
      return;
    }

    setSending(true);
    setError("");
    try {
      const newMsg = await waterRepository.addMessage({
        waterId,
        text: trimmed,
        authorName: "Já",
        scope,
      });
      setMessages((prev) => [...prev, newMsg]);
      setInputText("");
    } catch (err) {
      setError(err?.message || "Zprávu se nepodařilo odeslat.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="water-chat-page">
      <header className="water-chat-header">
        <Link to={`/waters/${waterId}`} aria-label="Zpět na detail revíru">←</Link>
        <div>
          <h1>Chat: {water?.name || "Revír"}</h1>
          <p>Místní poznámky k revíru</p>
        </div>
      </header>

      {error && <p role="alert" style={{ color: "var(--accent-red)", fontSize: "14px" }}>{error}</p>}

      {loading ? <p role="status">Načítám místní zprávy…</p> : !water ? (
        <section className="water-chat-empty"><h2>Revír není dostupný</h2><Link to="/waters">Zpět na revíry</Link></section>
      ) : messages.length === 0 ? (
        <section className="water-chat-empty" aria-labelledby="water-chat-empty-title">
          <h2 id="water-chat-empty-title">Zatím žádné zprávy</h2>
          <p>Zde si můžeš ukládat své poznámky a zprávy k tomuto revíru. Zprávy se ukládají lokálně v tvém zařízení.</p>
        </section>
      ) : (
        <div className="water-chat-messages" role="log" aria-label="Zprávy revíru">
          {messages.map((msg) => (
            <article key={msg.id} className="water-chat-bubble">
              <span className="water-chat-bubble-author">{msg.authorName}</span>
              <p className="water-chat-bubble-text">{msg.text}</p>
              <span className="water-chat-bubble-time">{formatMessageTime(msg.timestamp)}</span>
            </article>
          ))}
        </div>
      )}

      <form className="water-chat-composer" onSubmit={handleSend}>
        <label className="water-chat-input">
          <input
            type="text"
            aria-label="Napsat zprávu"
            placeholder="Napiš zprávu k revíru (max 500 znaků)…"
            value={inputText}
            maxLength={500}
            onChange={(e) => setInputText(e.target.value)}
            disabled={sending || loading || !water}
          />
        </label>
        <button type="submit" disabled={sending || loading || !water || !inputText.trim()} aria-label="Odeslat zprávu">
          {sending ? "…" : "→"}
        </button>
      </form>
    </main>
  );
}

export default WaterChatPage;
