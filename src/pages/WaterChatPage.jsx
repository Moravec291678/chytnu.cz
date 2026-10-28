import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../features/auth/context/authContextValue.js";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { WATER_CHAT_MAX_LENGTH, waterRepository } from "../features/waters/data/waterRepository.js";
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
  const auth = useAuth();

  const [water, setWater] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [composerError, setComposerError] = useState("");

  const loadData = useCallback(async () => {
    if (scope.status !== "ready") return;
    setLoading(true);
    setLoadError("");
    try {
      const [waterData, msgData] = await Promise.all([
        waterRepository.get(waterId, scope),
        waterRepository.listMessages(waterId, scope),
      ]);
      setWater(waterData);
      setMessages(waterData ? msgData : []);
      if (!waterData) setLoadError("Požadovaný revír v tomto místním profilu neexistuje.");
    } catch (err) {
      setLoadError(err?.message || "Nepodařilo se načíst zprávy.");
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
    if (sending || loading || !water) return;
    if (!trimmed) {
      setComposerError("Zpráva nesmí být prázdná.");
      return;
    }

    if (trimmed.length > WATER_CHAT_MAX_LENGTH) {
      setComposerError(`Zpráva může mít maximálně ${WATER_CHAT_MAX_LENGTH} znaků.`);
      return;
    }

    setSending(true);
    setComposerError("");
    try {
      const newMsg = await waterRepository.addMessage({
        waterId,
        text: trimmed,
        author: auth.user?.displayName?.trim() || (auth.user ? "Můj profil" : "Místní profil"),
        scope,
      });
      setMessages((prev) => [...prev, newMsg]);
      setInputText("");
    } catch (err) {
      setComposerError(err?.message || "Zprávu se nepodařilo uložit.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="water-chat-page">
      <header className="water-chat-header">
        <Link to={`/waters/${waterId}`} aria-label="Zpět na detail revíru">←</Link>
        <div>
          <h1>{water?.name || "Chat revíru"}</h1>
          <p><span className="water-chat-presence-dot" aria-hidden="true" />Jen tvoje místní zprávy</p>
        </div>
      </header>

      <aside className="water-chat-backend-state" aria-label="Dostupnost zpráv">
        <span>JEN PRO TEBE</span>
        <p>Zprávy ostatních rybářů zatím nejsou dostupné. Tady si můžeš ukládat vlastní poznámky k revíru.</p>
      </aside>

      {loadError && <p className="water-chat-error" role="alert">{loadError}</p>}

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
              <span className="water-chat-bubble-author">{msg.author}</span>
              <p className="water-chat-bubble-text">{msg.text}</p>
              <span className="water-chat-bubble-time">{formatMessageTime(msg.createdAt)}</span>
            </article>
          ))}
        </div>
      )}

      <form className="water-chat-composer" onSubmit={handleSend}>
        <label className="water-chat-input">
          <input
            type="text"
            aria-label="Napsat zprávu"
            placeholder={`Místní zpráva (max ${WATER_CHAT_MAX_LENGTH} znaků)…`}
            value={inputText}
            maxLength={WATER_CHAT_MAX_LENGTH}
            onChange={(e) => { setInputText(e.target.value); if (composerError) setComposerError(""); }}
            disabled={sending || loading || !water}
            aria-describedby={composerError ? "water-chat-composer-error" : undefined}
          />
        </label>
        <button type="submit" disabled={sending || loading || !water || !inputText.trim()} aria-label="Odeslat zprávu">
          {sending ? "…" : "→"}
        </button>
        {composerError && <p id="water-chat-composer-error" className="water-chat-composer-error" role="alert">{composerError}</p>}
      </form>
    </main>
  );
}

export default WaterChatPage;
