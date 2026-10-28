import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ACHIEVEMENT_DEFINITIONS } from "../src/product/config/achievements.js";
import {
  CHALLENGE_TIME_ZONE,
  DAILY_CHALLENGES,
  SEASONAL_CHALLENGE,
  SEASONAL_CHALLENGE_SEASONS,
  WEEKLY_CHALLENGES,
  WATER_VISIT_GAP_DAYS,
} from "../src/product/config/challenges.js";
import { FEATURES } from "../src/product/config/featureFlags.js";
import { LEVEL_XP_BASE, MAX_LEVEL, MASTERY_LEVELS, RANKS } from "../src/product/config/levels.js";
import { NOTIFICATION_COPY, NOTIFICATION_PREFERENCES, NOTIFICATION_TYPE_PRESENTATION, NOTIFICATION_TYPES } from "../src/product/config/notifications.js";
import { PRODUCT_LIMITS } from "../src/product/config/limits.js";
import { FREE_FEATURES, SUPPORTER_BENEFITS, SUPPORTER_CAPABILITIES, SUPPORTER_COSMETICS, SUPPORTER_COPY } from "../src/product/config/supporter.js";
import { XP_RULES } from "../src/product/config/xp.js";
import { validateProductConfig } from "../src/product/config/validateProductConfig.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const appSource = await readFile(resolve(root, "src/app/App.jsx"), "utf8");
const routePatterns = [...appSource.matchAll(/<Route\s+path=["']([^"']+)["']/g)].map((match) => match[1]);
const routeExists = (deepLink) => {
  const pathname = deepLink.split(/[?#]/, 1)[0];
  return routePatterns.some((route) => {
    const pattern = new RegExp(`^${route.split("/").map((part) => part.startsWith(":") ? "[^/]+" : part.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")).join("/")}/?$`);
    return pattern.test(pathname);
  });
};

const errors = validateProductConfig({ routeExists });
if (errors.length) {
  process.stderr.write(`Product config validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  const rows = (items, columns) => items.map((item) => `| ${columns.map((column) => String(column(item)).replaceAll("|", "\\|").replaceAll("\n", " ")).join(" | ")} |`).join("\n");
  const monthNames = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
  const seasonalChallenges = SEASONAL_CHALLENGE_SEASONS.flatMap((season) => (season.challenges ?? [{ key: season.key, title: season.title, description: season.description }]).map((challenge) => ({
    id: `season-{YYYY}-${season.key}${[season.key, "carp", "primary"].includes(challenge.key) ? "" : `-${challenge.key}`}`,
    name: challenge.title,
    condition: challenge.description,
    reward: `${SEASONAL_CHALLENGE.xpReward} XP`,
    window: season.months.map((month) => monthNames[month]).join(", "),
  })));
  const content = `# Product catalog — generated\n\nAutomaticky vytvořeno příkazem \`npm run product:inventory\` z \`src/product/config/\`. Validace před generováním kontroluje duplicity, XP, období, challenge typy, odkazy, levely a feature flagy.\n\n## Achievements\n\n| ID | Název | Podmínka | XP | Enabled / okno |\n|---|---|---|---:|---|\n${rows(ACHIEVEMENT_DEFINITIONS, [(item) => item.id, (item) => item.name, (item) => item.description, (item) => item.xp, (item) => item.hidden ? "Ano · skrytý do splnění" : "Ano · trvalý"])}\n\n## Denní a týdenní challenges\n\nČasová zóna: \`${CHALLENGE_TIME_ZONE}\`.\n\n| ID | Název | Podmínka / typ | Cíl | Reward | Enabled / okno |\n|---|---|---|---:|---:|---|\n${rows([...DAILY_CHALLENGES.map((item) => ({ ...item, window: "denně" })), ...WEEKLY_CHALLENGES.map((item) => ({ ...item, window: "týdně" }))], [(item) => item.id, (item) => item.title, (item) => item.ruleKey, (item) => item.goal, (item) => `${XP_RULES[item.xpKey]} XP`, (item) => `Ano · ${item.window}`])}\n\n## Sezónní challenges\n\n| ID vzor | Název | Podmínka | Reward | Enabled / okno |\n|---|---|---|---:|---|\n${rows(seasonalChallenges, [(item) => item.id, (item) => item.name, (item) => item.condition, (item) => item.reward, (item) => `Ano · ${item.window}`])}\n\n## XP, úrovně a mastery\n\n- XP za catch: ${XP_RULES.catch.base} základ, ${XP_RULES.catch.photo} s fotkou, ${XP_RULES.catch.gpsAndWeather} s GPS a počasím.\n- Verification multipliers: ${Object.entries(XP_RULES.catchVerificationMultiplier).map(([level, value]) => `${level} ${value * 100}%`).join(", ")}. Limited cap: ${XP_RULES.limitedCatch.dailyCap} XP/den.\n- Další hodnoty XP: ${Object.entries(XP_RULES).filter(([key, value]) => key !== "catch" && key !== "catchVerificationMultiplier" && key !== "limitedCatch" && typeof value === "number").map(([key, value]) => `${key} ${value} XP`).join(", ")}.\n- Level ${"L"} vyžaduje ${LEVEL_XP_BASE} × (L−1)² XP; maximum ${MAX_LEVEL}.\n\n| Rank | Levely | Enabled / duration |\n|---|---:|---|\n${rows(RANKS, [(item) => `${item.name} · ${item.title}`, (item) => `${item.minLevel}–${item.maxLevel}`, () => "Ano · trvalý"])}\n\n| Mastery | Počet catchů | XP |\n|---|---:|---:|\n${rows(MASTERY_LEVELS, [(item) => item.title, (item) => item.catches, (item) => item.xp])}\n\n## Notifications\n\n| ID | Název | Text / hluboký odkaz | Enabled / podmínka |\n|---|---|---|---|\n${rows(NOTIFICATION_TYPES, [(type) => type, (type) => NOTIFICATION_TYPE_PRESENTATION[type].label, (type) => { const copy = NOTIFICATION_COPY[type === "sync_problem" ? "syncProblem" : type]; return copy ? `${copy.title} · ${copy.deepLink}` : "Typ modelu; text producer zatím nemá"; }, () => "Typ podporovaný modelem"])}\n\nPreference jsou uživatelsky nastavitelné: ${NOTIFICATION_PREFERENCES.map((item) => `${item.key} (${item.defaultEnabled ? "default ON" : "default OFF"})`).join(", ")}.\n\n## Feature flags\n\n| ID | Enabled |\n|---|---|\n${rows(Object.entries(FEATURES), [(item) => item[0], (item) => item[1] ? "Ano" : "Ne"])}\n\n## Limity\n\n| ID | Hodnota |\n|---|---|\n${rows(Object.entries(PRODUCT_LIMITS), [(item) => item[0], (item) => typeof item[1] === "object" ? JSON.stringify(item[1]) : item[1]])}\n- Rozestup návštěvy stejného revíru pro weekly challenge: ${WATER_VISIT_GAP_DAYS} dní.\n\n## Supporter obsah\n\n- Benefity (návrhy): ${SUPPORTER_BENEFITS.join(", ")}.\n- Free obsah: ${FREE_FEATURES.join(", ")}.\n- Kosmetika: ${SUPPORTER_COSMETICS.map((item) => `${item.name} (${item.proposedPrice}, pouze návrh)`).join(", ")}.\n- Copy: ${SUPPORTER_COPY.plan} · ${SUPPORTER_COPY.unavailable}\n\n> Supporter ceny jsou pouze produktové návrhy; inventář ani tento nástroj neaktivují billing nebo checkout.\n`;
  const capabilityTable = `## Supporter entitlements\n\n| Capability ID | Required entitlement | Free limit | Supporter limit |\n|---|---|---:|---:|\n${rows(Object.entries(SUPPORTER_CAPABILITIES), [(item) => item[0], (item) => item[1].requiredEntitlement, (item) => item[1].freeLimit ?? "—", (item) => item[1].supporterLimit ?? "—"])}\n\n`;
  await writeFile(resolve(root, "docs/PRODUCT_CATALOG.generated.md"), content.replace("## Supporter obsah", `${capabilityTable}## Supporter obsah`), "utf8");
  process.stdout.write("Product config valid. Wrote docs/PRODUCT_CATALOG.generated.md\n");
}
