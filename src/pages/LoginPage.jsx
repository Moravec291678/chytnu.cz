import { useState } from "react";
import { useAuth } from "../features/auth/context/authContextValue.js";
import { validateAuthForm } from "../features/auth/data/authFormValidation.js";
import "./LoginPage.css";

const FORM_COPY = {
  login: { title: "Přihlášení e-mailem", submit: "Přihlásit se" },
  register: { title: "Vytvořit účet", submit: "Zaregistrovat se" },
  reset: { title: "Obnovení hesla", submit: "Poslat odkaz pro obnovu" },
};

export default function LoginPage() {
  const auth = useAuth();
  const [mode, setMode] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setFormError("");
    setMessage("");
    auth.clearError();
  };

  const run = async (operation) => {
    setBusy(true);
    setFormError("");
    setMessage("");
    try {
      const result = await operation();
      if (mode === "reset") setMessage("Pokud účet s touto adresou existuje, poslali jsme odkaz pro obnovu hesla.");
      if (mode === "register" && result?.verificationEmailSent) setMessage("Účet je vytvořený. Ověřovací e-mail byl odeslán.");
    } catch {
      // AuthContext keeps a short Czech message and never exposes Firebase internals.
    } finally {
      setBusy(false);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    auth.clearError();
    const error = validateAuthForm({ email, password, requirePassword: mode !== "reset" });
    if (error) {
      setFormError(error);
      return;
    }
    if (mode === "login") void run(() => auth.signIn(email, password));
    if (mode === "register") void run(() => auth.register(email, password));
    if (mode === "reset") void run(() => auth.resetPassword(email));
  };

  return (
    <main className="auth-entry-screen">
      <div className="auth-entry-brand" aria-label="ChytnuCz, Tvůj rybářský deník">
        <h1>ChytnuCz</h1>
        <p>Tvůj rybářský deník</p>
      </div>

      {!mode ? (
        <div className="auth-entry-actions">
          {(auth.status === "unavailable" || auth.status === "error") && auth.error && (
            <p className="auth-entry-alert" role="alert">{auth.error}</p>
          )}
          <button className="auth-entry-google" type="button" disabled={busy} onClick={() => void run(auth.signInWithGoogle)}>
            {busy ? "Připojuji…" : "Pokračovat přes Google"}
          </button>
          <button className="auth-entry-email" type="button" onClick={() => changeMode("login")}>
            E-mailem
          </button>
        </div>
      ) : (
        <section className="auth-entry-form-panel" aria-labelledby="auth-entry-form-title">
          <button className="auth-entry-back" type="button" onClick={() => changeMode(null)}>← Zpět</button>
          <h2 id="auth-entry-form-title">{FORM_COPY[mode].title}</h2>
          <form onSubmit={submit} noValidate>
            <label htmlFor="auth-entry-email">E-mail</label>
            <input
              id="auth-entry-email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={(event) => { setEmail(event.target.value); setFormError(""); auth.clearError(); }}
              aria-invalid={Boolean(formError)}
              required
              disabled={busy}
            />
            {mode !== "reset" && <>
              <label htmlFor="auth-entry-password">Heslo</label>
              <input
                id="auth-entry-password"
                type="password"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => { setPassword(event.target.value); setFormError(""); auth.clearError(); }}
                aria-invalid={Boolean(formError)}
                required
                minLength={6}
                disabled={busy}
              />
            </>}
            {formError && <p className="auth-entry-alert" role="alert">{formError}</p>}
            {auth.error && <p className="auth-entry-alert" role="alert">{auth.error}</p>}
            {message && <p className="auth-entry-message" role="status">{message}</p>}
            <button className="auth-entry-google auth-entry-submit" type="submit" disabled={busy}>
              {busy ? "Zpracovávám…" : FORM_COPY[mode].submit}
            </button>
          </form>
          <div className="auth-entry-links">
            {mode === "login" && <>
              <button type="button" onClick={() => changeMode("reset")}>Zapomněl/a jsi heslo?</button>
              <button type="button" onClick={() => changeMode("register")}>Vytvořit nový účet</button>
            </>}
            {mode === "register" && <button type="button" onClick={() => changeMode("login")}>Už účet mám — přihlásit se</button>}
            {mode === "reset" && <button type="button" onClick={() => changeMode("login")}>Zpět na přihlášení</button>}
          </div>
        </section>
      )}
    </main>
  );
}
