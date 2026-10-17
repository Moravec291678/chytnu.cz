const ERROR_MESSAGES = {
  "auth/invalid-email": "Zkontroluj formát e-mailové adresy.",
  "auth/weak-password": "Heslo je příliš slabé. Použij alespoň 6 znaků.",
  "auth/email-already-in-use": "Účet s tímto e-mailem už existuje. Zkus se přihlásit.",
  "auth/invalid-credential": "E-mail nebo heslo nesouhlasí.",
  "auth/user-not-found": "E-mail nebo heslo nesouhlasí.",
  "auth/wrong-password": "E-mail nebo heslo nesouhlasí.",
  "auth/too-many-requests": "Příliš mnoho pokusů. Chvíli počkej a zkus to znovu.",
  "auth/network-request-failed": "Emulátor účtů není dostupný. Spusť lokální Firebase emulátor a zkus to znovu.",
  "auth/emulator-config-required": "Účty jsou dostupné pouze při lokálním spuštění aplikace s Firebase emulátorem.",
  "auth/operation-not-allowed": "Tento způsob přihlášení není v lokálním emulátoru povolen.",
};

export function getAuthErrorMessage(error) {
  return ERROR_MESSAGES[error?.code] ?? "Požadavek se nepodařilo dokončit. Zkus to znovu.";
}

export function isInvalidAuthConfiguration(error) {
  return error?.code === "auth/emulator-config-required";
}
