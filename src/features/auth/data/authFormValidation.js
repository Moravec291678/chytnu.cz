const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateAuthForm({ email, password = "", requirePassword = true }) {
  const normalizedEmail = String(email ?? "").trim();
  if (!normalizedEmail) return "Zadej e-mail.";
  if (!EMAIL_PATTERN.test(normalizedEmail)) return "Zadej platnou e-mailovou adresu.";
  if (requirePassword && !password) return "Zadej heslo.";
  if (requirePassword && password.length < 6) return "Heslo musí mít alespoň 6 znaků.";
  return "";
}
