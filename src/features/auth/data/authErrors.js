const ERROR_MESSAGES = {
  "auth/invalid-email": "Zkontroluj formát e-mailové adresy.",
  "auth/weak-password": "Heslo je příliš slabé. Použij alespoň 6 znaků.",
  "auth/email-already-in-use": "Účet s tímto e-mailem už existuje. Zkus se přihlásit.",
  "auth/invalid-credential": "E-mail nebo heslo nesouhlasí.",
  "auth/user-not-found": "E-mail nebo heslo nesouhlasí.",
  "auth/wrong-password": "E-mail nebo heslo nesouhlasí.",
  "auth/too-many-requests": "Příliš mnoho pokusů. Chvíli počkej a zkus to znovu.",
  "auth/network-request-failed": "Přihlašovací služba není dostupná. Zkontroluj připojení a zkus to znovu.",
  "auth/emulator-config-required": "Účty jsou dostupné pouze při lokálním spuštění aplikace s Firebase emulátorem.",
  "auth/backend-config-required": "Pro toto prostředí není bezpečně nastavený backend.",
  "auth/provider-disabled": "Google přihlášení není v tomto prostředí zapnuté.",
  "auth/popup-closed-by-user": "Přihlášení přes Google bylo zrušeno.",
  "auth/popup-blocked": "Prohlížeč zablokoval přihlašovací okno. Povol vyskakovací okna a zkus to znovu.",
  "auth/operation-not-supported-in-this-environment": "Google přihlášení tento prohlížeč nepodporuje. Použij běžný prohlížeč nebo přihlášení e-mailem.",
  "auth/operation-not-allowed": "Tento způsob přihlášení není pro aplikaci povolený.",
  "auth/unauthorized-domain": "Přihlášení z této adresy není povolené. Obrať se na podporu aplikace.",
  "auth/invalid-api-key": "Přihlašovací služba není správně nastavená. Zkus to později.",
  "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "Přihlašovací služba není správně nastavená. Zkus to později.",
  "auth/app-not-authorized": "Tato aplikace nemá povolený přístup k přihlášení.",
};

export function getAuthErrorMessage(error) {
  return ERROR_MESSAGES[error?.code] ?? "Požadavek se nepodařilo dokončit. Zkus to znovu.";
}

export function isInvalidAuthConfiguration(error) {
  return error?.code === "auth/emulator-config-required" || error?.code === "auth/backend-config-required";
}
