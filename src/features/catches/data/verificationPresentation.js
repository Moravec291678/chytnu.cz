const VERIFICATION_COPY = {
  strong: { label: "Ověřený úlovek", message: "Úlovek je ověřený." },
  standard: { label: "Ověřený úlovek", message: "Úlovek je ověřený." },
  limited: {
    label: "Částečně ověřeno",
    message: "Úlovek je uložený. Chybí část údajů o místě nebo čase.",
  },
  unverified: {
    label: "Úlovek uložen bez ověření",
    message: "Úlovek je uložený. Fotku nebo další údaje můžeš doplnit později.",
  },
};

export function getVerificationPresentation(verification) {
  const level = verification?.level
    ?? (verification?.status === "verified" ? "standard" : "unverified");
  return VERIFICATION_COPY[level] ?? VERIFICATION_COPY.unverified;
}
