import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../features/auth/context/authContextValue.js";
import { validateAuthForm } from "../features/auth/data/authFormValidation.js";
import { confirmGuestAccess } from "../features/auth/data/guestAccess.js";
import { resolveAuthenticatedRedirect } from "../app/routeAccess.js";
import { useModalFocusTrap } from "../shared/hooks/useModalFocusTrap.js";
import "./LoginPage.css";

const FORM_COPY = {
  login: { title: "Přihlášení", submit: "Přihlásit se" },
  register: { title: "Vytvořit účet", submit: "Vytvořit účet" },
  reset: { title: "Obnovení hesla", submit: "Poslat odkaz pro obnovu" },
};

export default function LoginPage() {
  const guestDialogRef = useRef(null);
  const guestContinueRef = useRef(null);
  const auth = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const [guestDialog, setGuestDialog] = useState(false);
  useModalFocusTrap(guestDialogRef, { active: Boolean(guestDialog), initialFocusRef: guestContinueRef, onEscape: () => setGuestDialog(false) });

  useEffect(() => {
    const destination = resolveAuthenticatedRedirect({ status: auth.status, user: auth.user });
    if (destination) navigate(destination, { replace: true });
  }, [auth.status, auth.user, navigate]);

  const changeMode = (nextMode) => {
    setMode(nextMode); setPassword(""); setConfirmPassword(""); setFormError(""); setMessage(""); auth.clearError();
  };

  const run = async (operation) => {
    setBusy(true); setFormError(""); setMessage("");
    try {
      const result = await operation();
      if (mode === "reset") setMessage("Pokud účet s touto adresou existuje, poslali jsme odkaz pro obnovu hesla.");
      if (mode === "register" && result?.verificationEmailSent) setMessage("Účet je vytvořený. Ověřovací e-mail byl odeslán.");
    } catch { /* AuthContext exposes a safe Czech message. */ } finally { setBusy(false); }
  };

  const submit = (event) => {
    event.preventDefault(); auth.clearError();
    const error = validateAuthForm({ email, password, requirePassword: mode !== "reset" });
    if (error) { setFormError(error); return; }
    if (mode === "register" && password !== confirmPassword) { setFormError("Hesla se neshodují."); return; }
    if (mode === "login") void run(() => auth.signIn(email, password, { remember }));
    if (mode === "register") void run(() => auth.register(email, password));
    if (mode === "reset") void run(() => auth.resetPassword(email));
  };

  const continueAsGuest = () => { confirmGuestAccess(); setGuestDialog(false); navigate("/", { replace: true }); };

  return <main className={`auth-entry-screen${mode ? " auth-entry-screen-form" : " auth-entry-screen-welcome"}`}>
    <div className="auth-entry-content">
      <header className="auth-entry-brand" aria-label="ChytnuCz, Tvůj rybářský deník">
        <p className="auth-entry-greeting">Petrův zdar!</p><h1>ChytnuCz</h1><p>Tvůj rybářský deník.</p>
      </header>
      {!mode ? <section className="auth-entry-welcome-actions" aria-label="Způsob vstupu">
        {auth.error && <p className="auth-entry-alert" role="alert">{auth.error}</p>}
        <button className="auth-entry-primary" type="button" disabled={busy} onClick={() => void run(auth.signInWithGoogle)}>{busy ? "Připojuji…" : "Pokračovat přes Google"}</button>
        <button className="auth-entry-secondary" type="button" onClick={() => changeMode("login")}>E-mailem</button>
        <button className="auth-entry-guest-link" type="button" onClick={() => setGuestDialog(true)}>Pokračovat jako host</button>
      </section> : <section className="auth-entry-form-panel" aria-labelledby="auth-entry-form-title">
        <button className="auth-entry-back" type="button" onClick={() => changeMode(null)}>← Zpět</button>
        <h2 id="auth-entry-form-title">{FORM_COPY[mode].title}</h2>
        <form onSubmit={submit} noValidate>
          <label htmlFor="auth-entry-email">E-mail</label>
          <input id="auth-entry-email" type="email" autoComplete="email" autoCapitalize="none" value={email} onChange={(event) => { setEmail(event.target.value); setFormError(""); auth.clearError(); }} aria-invalid={Boolean(formError)} required disabled={busy} />
          {mode !== "reset" && <>
            <label htmlFor="auth-entry-password">Heslo</label>
            <div className="auth-password-field"><input id="auth-entry-password" type={showPassword ? "text" : "password"} autoComplete={mode === "register" ? "new-password" : "current-password"} value={password} onChange={(event) => { setPassword(event.target.value); setFormError(""); auth.clearError(); }} aria-invalid={Boolean(formError)} required minLength={6} disabled={busy} /><button type="button" className="auth-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Skrýt heslo" : "Zobrazit heslo"}>{showPassword ? "Skrýt" : "Ukázat"}</button></div>
            {mode === "register" && <><label htmlFor="auth-entry-confirm-password">Potvrzení hesla</label><input id="auth-entry-confirm-password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setFormError(""); }} required minLength={6} disabled={busy} /></>}
            {mode === "login" && <label className="auth-remember"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} disabled={busy} /><span>Zapamatovat přihlášení</span></label>}
          </>}
          {formError && <p className="auth-entry-alert" role="alert">{formError}</p>}{auth.error && <p className="auth-entry-alert" role="alert">{auth.error}</p>}{message && <p className="auth-entry-message" role="status">{message}</p>}
          <button className="auth-entry-primary" type="submit" disabled={busy}>{busy ? "Zpracovávám…" : FORM_COPY[mode].submit}</button>
        </form>
        <div className="auth-entry-links">
          {mode === "login" && <><button type="button" onClick={() => changeMode("reset")}>Zapomenuté heslo?</button><button type="button" onClick={() => changeMode("register")}>Vytvořit účet</button></>}
          {mode === "register" && <button type="button" onClick={() => changeMode("login")}>Už účet mám — přihlásit se</button>}
          {mode === "reset" && <button type="button" onClick={() => changeMode("login")}>Zpět na přihlášení</button>}
        </div>
        {mode === "login" && <><div className="auth-divider"><span>nebo</span></div><button className="auth-entry-secondary" type="button" disabled={busy} onClick={() => void run(auth.signInWithGoogle)}>{busy ? "Připojuji…" : "Pokračovat přes Google"}</button></>}
      </section>}
    </div>
    {guestDialog && <div className="auth-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setGuestDialog(false); }}><section ref={guestDialogRef} tabIndex="-1" className="auth-guest-dialog" role="dialog" aria-modal="true" aria-labelledby="guest-dialog-title" aria-describedby="guest-dialog-description"><h2 id="guest-dialog-title">Pokračovat jako host?</h2><p id="guest-dialog-description">Data budou uložena pouze v tomto zařízení. Při smazání dat prohlížeče, aplikace nebo při ztrátě zařízení o ně můžete přijít.</p><p>Přihlášený účet umožňuje synchronizaci dat mezi zařízeními.</p><div className="auth-guest-actions"><button ref={guestContinueRef} className="auth-entry-primary" type="button" onClick={continueAsGuest}>Pokračovat jako host</button><button className="auth-entry-secondary" type="button" onClick={() => setGuestDialog(false)}>Přihlásit se</button></div></section></div>}
  </main>;
}
