# UI inventory — ChytnuCz

Audit zdrojového UI: 28. 10. 2026
Rozsah: všechny routy v `src/app/App.jsx`, stránky a jejich CSS v `src/pages`, hlavní znovupoužitelné komponenty v `src/shared` a `src/features`, společné designové proměnné v `src/index.css`.

Tento dokument je inventář a seznam kandidátů pro navazující vizuální audit. Neprovádí redesign ani hromadné sjednocení. Jde o audit implementace a responsivních pravidel v kódu; skutečné přetečení či překrytí na každém zařízení není bez kompletního viewport průchodu označeno za potvrzenou závadu.

## 1. Rozsah obrazovek

| Oblast | Route / obrazovka | Hlavní implementace |
|---|---|---|
| Vstup | Splash, `/login`, `/onboarding` | `SplashScreen`, `LoginPage`, `OnboardingPage`; přihlášení je samostatný full-screen flow mimo běžný `Layout` |
| Domů | `/` | `HomePage`, `FishActivity`, `ProfileStatsBar`, sezónní a týdenní přehledy |
| Deník | `/journal`, `/journal/calendar`, `/journal/map`, `/map` | `JournalPage`, `JournalCalendarPage`, `MapPage`; `/map` a `/journal/map` vedou na stejnou mapovou obrazovku |
| Úlovky | `/add`, `/catch/:id/edit`, `/catch/:id`, `/catch/:id/share`, `/catch/:id/reward` | `AddCatchPage`, `CatchDetailPage`, `CatchSharePage`, `CatchRewardPage`; formulář sdílí stránku pro vytvoření i editaci |
| Fotografie | `/gallery` | `GalleryPage`, `GalleryPhotoImage`; filtry a prohlížeč fotografií mají vlastní overlaye |
| Vycházky | `/trips`, `/trips/new`, `/trips/:id`, `/trips/:id/edit` | `TripsPage`, trip detail/form stránky; `TripCard`, `ActiveTripCard`, `TripPill` |
| Revíry | `/waters`, `/waters/new`, `/waters/:waterId`, `/waters/:waterId/edit`, `/waters/:waterId/chat` | `WatersPage`, `WaterCreatePage`, `WaterDetailPage`, `WaterChatPage` |
| Progrese | `/challenges`, `/achievements`, `/levels`, `/streak`, `/fish-activity`, `/species/:speciesKey/mastery` | `ChallengesPage`, `AchievementsPage`, `LevelsPage`, `StreakPage`, `FishActivityPage`, `SpeciesMasteryPage`; většina používá společné `ProgressionPages.css` |
| Druhy ryb | `/species/:speciesKey`, `/album` | `SpeciesDetailPage`, `SpeciesAlbumPage`, `SpeciesCard` |
| Statistiky a osobní přehled | `/stats`, `/profile`, `/insights`, `/season-story`, `/year-summary` | Samostatné stránky; Profile obsahuje vedle statistik také nastavení účtu, zálohu a postup |
| Soukromí a nastavení | `/privacy`, `/settings`, `/notifications`, `/supporter` | Samostatné stránky; notifikace kombinují inbox a nastavení push |
| Komunita | `/community`, `/community/catch/:catchId`, `/community/:postId/report`, `/crew`, `/nearby`, `/hotspots` | Feed, detail, report, crew a mapové/okolní přehledy; jde o nejrůznorodější sadu vlastních karet a stavů |
| Fallback | `*` | `NotFoundPage` uvnitř `Layout` |

Všechny routy kromě úvodního Home obsahu používají lazy import. Běžné stránky jsou obalené `PageSuspense` s textovým loaderem a `Layout`; mapová route má vlastní fallback. Splash a Error Boundary mají vlastní styly a obalují širší část aplikace.

## 2. Sdílené UI a komponenty

| Prvek | Implementace | Pozorování |
|---|---|---|
| Aplikační shell | `src/shared/layout/Layout.jsx`, `Layout.css` | Mobilně orientovaný obsah max. 487 px, fixní spodní navigace, safe-area padding, offline stav, sync status a PWA update notice. Galerie rozšiřuje layout až na 1100 px. |
| Spodní navigace | `.bottom-nav`, `.nav-item`, `.nav-fab` | Pět hlavních cílů: Domů, Deník, Přidat, Vycházky, Profil. Přidání má kruhové FAB; breakpoint do 360 px zmenšuje labely i FAB. |
| Základní stavy | `src/shared/components/UIStates.jsx` / `.css` | `EmptyState`, `ErrorState`, `NoResultsState`, `PermissionDeniedState`, `LoadingSkeleton`, `OfflineNotice`. Systém existuje, ale stránky často používají vlastní ekvivalenty. |
| Základní UI prvky | `src/shared/components/UIPrimitives.jsx` / `.css` | Sdílené `Button`, `Card` a `Badge`; Button nabízí primary/secondary/quiet/danger, Card dvě zachované hustoty a Badge stavové tóny. Používají je CatchCard, SpeciesCard a retry stavy. |
| Sync a update | `SyncStatus`, `PwaUpdateNotice` | Fixed overlaye nezabírají layout; sync karta má plný a kompaktní stav. Obě vrstvy používají z-index 105. |
| Catch karta | `features/catches/components/CatchCard` | Vlastní hustá skladba fotografie, měr, štítků a akcí; není to obecná card primitive. |
| Druhová karta | `features/species/components/SpeciesCard` | Další vlastní karta s druhovými/stavovými štítky a rekordními údaji. |
| Trip komponenty | `TripCard`, `ActiveTripCard`, `TripPill` | Tři samostatné vizuální varianty pro historii, aktivní vycházku a kompaktní stav. |
| Fotografie | `PhotoSyncStatus`, `PhotoFrameEditor`, `CatchLocationPicker`, `GalleryPhotoImage` | Stavy fotografie a framing mají specializované komponenty; editor a map picker otevírají vlastní modal-like overlay. |
| Chybová obrazovka | `AppErrorBoundary` | Bezpečný obecný text a akce načíst znovu; není náhradou za lokální retry u obnovitelných chyb. |

**Strukturální duplicita:** základ Card/Badge i retry Button je sdílený; specifická rozvržení CatchCard, SpeciesCard, TripCard a většina formulářů zůstávají lokální. Ikonová tlačítka, interaktivní chips a modal chování se liší a vyžadují samostatné ověření před sjednocením.

## 3. Designové základy

### Typografie

- `Inter` se načítá z Google Fonts; fallback je `Arial, sans-serif`. Offline zařízení nebo blokování externích fontů proto vykreslí jinou metriku textu a potenciálně odlišné zalomení.
- `src/index.css` definuje stupnici `--font-size-xs` až `--font-size-display` (11–32 px) a `--font-body`.
- Proměnné se používají, ale stránkové CSS dál obsahuje mnoho přímých hodnot. V celém CSS je přibližně 758 deklarací `font-size` a 403 `font-weight`; opakují se zejména 11–14 px a výrazné váhy 700–900.
- Nadpisy jsou převážně lokální styl: běžné velikosti jsou přibližně 22–27 px, ale nejsou důsledně mapovány na společné role. `section-title` je globální malý uppercase štítek, zatímco některé stránky používají vlastní sekční nadpisy.
- Kompaktní metadata, navigační labely, štítky a části statistik klesají na 9–12 px. Čitelnost těchto prvků na slunci a při větším systémovém textu stojí za ověření na zařízení.
- Přímé hard-coded typografické styly jsou výrazné například v Login, Gallery, Notifications a rozsáhlém `AddCatchPage.css`.

### Barvy, spacing a radius

- Paleta je v `src/index.css`: navy pozadí a plochy, sekundární text, zelená hlavní akce a modrá/oranžová/červená stavová akcentová barva.
- Barvy používají sémantické proměnné (`--surface-1`, `--text-primary`, `--accent-green`); starší zkrácené aliasy byly odstraněny. Opakované přesné hodnoty typografie, mezer, rádiusů a z-index jsou převedeny na tokeny bez změny jejich hodnot.
- Spacing stupnice 4–32 px se používá napříč CSS (přibližně 320 referencí), ale řada rozestupů a paddingů zůstává zapsaná jako lokální pixely. CSS obsahuje přibližně 411 deklarací `padding` a 458 `gap`.
- Radius tokeny `--radius-sm/md/lg/xl/pill` se používají často. Vedle nich zůstávají přímé hodnoty, zejména 10 px (31 výskytů), 12 px, 14 px, 16 px, 9 px, 11 px a 15 px. Karty tak vypadají podobně, ale ne zcela konzistentně.
- V mnoha stránkách se opakují přímé barvy a transparentní overlaye namísto stavových tokenů. Login má vlastní sadu hex barev; Gallery a některé modaly používají přímé navy/černé overlay hodnoty.
- Kontrastní text tlačítka Web Push používá `--text-on-accent`; dřívější reference na nedefinovaný `--surface-0` byla opravena.

### Tlačítka a vstupy

- Globální styl tlačítek definuje kurzor, hover brightness, disabled opacity a focus outline; nezavádí však jednotnou výšku, typ, barvu ani primary/secondary/destructive varianty.
- Tlačítka se proto stylují opakovaně lokálně. Běžné dotykové výšky jsou 40–48 px, ale sekundární/ikonové akce jdou také na 36–38 px. Bottom-nav FAB je 64 px (56 px do 360 px).
- Primary akce střídají zelené pozadí s tmavým textem, zelený text bez plné plochy a bílé písmo na zelené. Přístupný kontrast a sémantika se musí hodnotit po jednotlivých variantách.
- Globální inputy/select/textarea mají border, radius 10 px a `font-size: 16px`, což je dobrý základ pro mobilní web. Stránkové CSS ale někdy přepisuje typografii, povrch, výšku a radius; Gallery ovládání například nastavuje 13 px.
- Fokus a invalid stav mají globální indikaci. Lokální selektory občas kreslí vlastní focus outline přes aliasy. Ověřit shodu všech overrides, zvlášť na klávesnici a ve vysokém kontrastu.

### Karty, chips a badges

- Sdílená `Card` poskytuje společný povrch ve dvou zachovaných hustotách. Specifická rozvržení, doménové okraje a vnitřní skladby zůstávají v komponentách.
- Chips jsou často lokální skupiny pro filtry, metodu, druh, aktivní stav nebo sezónní varianty. Běžný pill radius je `999px`, ale v jednom typu štítku se objevují i 7–12 px radiusy.
- `Badge` sjednocuje neutrální, rekordní, druhový, puštěný a ponechaný štítek ve velikosti standard/compact; ostatní doménové badges mohou potřebovat vlastní tóny.
- `CatchCard` a `SpeciesCard` sdílejí jen základ Card/Badge. `TripPill`, `ActiveTripCard`, home challenge chips a filter controls mají jiné chování a zůstávají oddělené.

### Modály, fixed/sticky a vrstvení

- Spodní navigace je fixed, sync a update overlaye jsou fixed, stejně jako galerie viewer/filter, catch photo preview, frame editor, map picker, guest dialog, water chat composer a některé progression/report dialogy.
- Safe area je výslovně použita u spodní navigace, sync/update a části full-screen viewerů; jednotlivé stránkové overlaye mají odlišné paddingy a ukotvení.
- Z-index není škálován tokeny. Použité hodnoty se pohybují od `1/2/3`, přes `10/20/30`, `100/105`, až po `1000`, `1100/1101`, `1200` a `1300`. Galerie filter/viewer a map picker jsou na `1100–1200`, community detail dosahuje `1300`.
- Některé overlaye se na desktopu mění z `fixed` na `absolute` (například filtr galerie). Jde o záměrné chování, které vyžaduje kontrolu v kontextu rodičovských stacking contextů.
- Komponenty mají různé zaoblení panelů: bottom sheet, centered dialog a full-screen viewer. Společný modal shell ani společná pravidla pro hlavičku/zavření/scroll existují jen částečně.
- `role="dialog"` a `aria-modal` se používají u některých klíčových dialogů, ale audit neověřoval jednotně focus trap, návrat fokusu, Escape, scroll lock a čtečku obrazovky pro každý overlay.

### Empty, loading a error

- Existují sdílené `EmptyState`, `NoResultsState`, `ErrorState`, `PermissionDeniedState` a skeletony. Globální skeleton má shimmer a respektuje `prefers-reduced-motion`.
- Home/Journal/Trips/Gallery/Notifications/Waters a další stránky mají také vlastní prázdné/loading/error komponenty a CSS. Textové loadery, skeletony a inline status se střídají bez jednotného pravidla.
- `ErrorState` standardizuje title/message/retry; řada stránek ale vytváří své alerty a retry buttony ručně. Offline notice a sync error mají další samostatný vizuální systém.
- Error Boundary je samostatná fail-safe obrazovka; běžné síťové, sync, auth a photo chyby se řeší u vlastních funkcí, ale vizuální vzory se rozcházejí.
- Rozdíl mezi prázdnými daty, filtrem bez výsledku, chybou načtení a permission denied je ve shared API rozlišen, ale ne všechny stránky používají tento kontrakt.

## 4. Responsivita a rozmístění obsahu

- Globální minimum viewportu je 320 px. Hlavní shell má šířku do 487 px a centrování; na desktopu většina route proto zůstává mobilně úzká. Galerie je výjimka s 1100 px.
- Spodní navigace rezervuje přibližně 90 px plus safe-area a hlavní obsah obvykle používá spodní padding kolem 100 px. Lokální fixed prvky si nastavují vlastní offset; je nutné kontrolovat souběh s navigací a systémovým safe area.
- Stylesheety mají přibližně 48 media queries a 18 deklarací `position: fixed/sticky`. Breakpointy nejsou centrální: vyskytují se 350, 360, 390, 420, 430, 520, 600, 680, 700 a 1100 px. Téměř každá stránka ladí šířku samostatně.
- `dvh/svh` je použito u některých full-screen prvků, zatímco řada stránek/layout stále používá `100vh`; chování při mobilním zobrazení/skrytí browser chrome se může lišit.
- **Kandidáti k vizuálnímu ověření, ne potvrzené závady:** navigace a texty do 360 px; galerie filtr/viewer při safe-area a landscape; Add Catch s fotografiemi, mapou a klávesnicí; dlouhé texty v chips/badges; fixní sync/error panel proti bottom-nav; chat composer při otevřené klávesnici; desktopové stránky mimo rozšířenou galerii.
- Omezování pohybu je definováno globálně. Některé individuální animace mají navíc vlastní reduced-motion pravidla; při budoucí úpravě je vhodné zachovat globální fallback.

## 5. Inventář stylesheetů podle stránek

Každá stránka níže má vlastní stylesheet, pokud není uvedeno jinak. Sdílené vzory jsou v `src/index.css`, `UIStates.css`, `Layout.css`, `SyncStatus.css` a `PwaUpdateNotice.css`.

| Stránka / route group | Styly | Charakteristické prvky / auditní poznámka |
|---|---|---|
| Home `/` | `HomePage.css`, `FishActivity.css`, `ProfileStatsBar.css` | Hustý dashboard s kartami, metrikami, malými sekundárními texty a progress prvky. |
| Journal `/journal` | `JournalPage.css`, `CatchCard.css` | Filtry, řazení, list catch cards a vlastní loading/empty stavy. |
| Calendar `/journal/calendar` | `JournalCalendarPage.css` | Kalendářní buňky a markery; kulaté prvky a datumové stavy mají vlastní styling. |
| Map `/journal/map`, `/map` | `MapPage.css` | Leaflet canvas, marker detail a mobilní breakpoint 520 px. |
| Add/Edit Catch `/add`, `/catch/:id/edit` | `AddCatchPage.css`, `CatchLocationPicker.css`, `PhotoFrameEditor.css` | Největší formulářový stylesheet; pokročilé sekce, photo editor, location picker, lightbox a podmíněná pole. Riziko nahromadění overlayů a hustoty formuláře. |
| Catch detail/share/reward | `AddCatchPage.css`, `ProgressionPages.css` | Catch detail sdílí stylesheet s Add Catch; share karta má vlastní skladbu, reward používá společné progression styly. Sdílení CSS odlišných obrazovek zvyšuje riziko vedlejších úprav. |
| Gallery `/gallery` | `GalleryPage.css` | Mobilní grid, filter bottom sheet a full-screen viewer; vlastní desktop šířka 1100 px. Část CSS je zapsaná do dlouhých řádků, což ztěžuje údržbu. |
| Trips | `TripsPage.css`, `TripFormPage.css`, `TripCard.css`, `ActiveTripCard.css`, `TripPill.css` | List/detail/form mají několik stylových zdrojů pro stejné doménové karty. |
| Waters | `WatersPage.css`, `WaterDetailPage.css`, `WaterCreatePage.css`, `WaterChatPage.css` | Čtyři samostatné obrazovky; detail/chat používají fixed prvky, create používá fixed overlay. |
| Challenges/progression | `ChallengesPage.css`, `ProgressionPages.css`, `LevelsPage.css`, `StreakPage.css`, `SpeciesMasteryPage.css` | Sdílené i individuální varianty jsou kombinovány; progression stylesheet obsahuje fixed dialogy a vysoké z-indexy. |
| Species/album | `SpeciesDetailPage.css`, `SpeciesAlbumPage.css`, `SpeciesCard.css` | Druhová karta a detail jsou oddělené; album má vlastní desktop grid. |
| Stats/Profile | `StatsPage.css`, `ProfilePage.css` | Mnoho lokálních hodnot; část starých krátkých token aliasů se objevuje v Profile CSS. |
| Login/onboarding/privacy/settings/notifications | Každá stránka má vlastní CSS | Login používá nejvíce vlastní palety; onboarding a privacy mají segmented controls; settings a notifications mají odlišné button/panel styly. |
| Community/crew/nearby/hotspots | Samostatné CSS pro Community, Catch Detail, Report, Crew, Nearby, Hotspots | Mnoho lokálních list/card/filter vzorů; komunitní catch detail má z-index 1300. |
| Insights/season story/year summary/fish activity/supporter | Samostatné CSS | Obsahově odlišné stránky opakují header, cards a status badges s lokálními variantami. |

## 6. Zjištěné duplicity a nekonzistence

1. **Primitives po malých krocích:** Button, Card a Badge mají sdílený základ; IconButton, interaktivní chips a form controls je vhodné sjednotit až při shodě rozměrů i chování.
2. **Karty zůstávají doménové:** Catch, Species, Trip, Home, Notifications, Waters a Community mají rozdílné vnitřní skladby; sdílet lze pouze ověřenou základní plochu.
3. **Chips a další badges:** interaktivní filtry a stavové štítky mají odlišnou sémantiku a zatím nemají společný kontrakt.
5. **Empty/loading/error vzory existují ve dvou vrstvách:** sdílené komponenty a paralelní page-specific implementace. Vzhled retry, spacing a `role` se proto může lišit.
6. **Modal/z-index hierarchie je implicitní:** overlaye používají samostatné číselné hodnoty; společná mapa vrstev chybí.
7. **Spacing a typografické tokeny nejsou kompletní kontrakt:** proměnné se používají, ale 758 font-size a 411 padding deklarací ponechává mnoho lokálních rozhodnutí.
8. **CSS údržba není jednotná:** některé soubory jsou formátované po blocích, Gallery/Notifications obsahují dlouhé řádky a feature karty mají CSS mimo stránkovou složku.
9. **Dvojí mapová route:** `/map` a `/journal/map` renderují stejnou obrazovku; navigační/active-state kontext se může lišit.
10. **Neověřené kandidáty:** IconButton, interaktivní Chip, FormField a Modal vyžadují nejdřív porovnat focus, klávesnici, stavové chování a dotykové rozměry.

## 7. Návrh pořadí dalšího design auditu

Bez redesignu nejprve ověřit na reálných viewports (320/360/390/430 px, tablet/desktop):

1. hlavní shell a bottom navigation včetně safe area, sync indikátoru a PWA update;
2. Home, Journal a CatchCard — každodenní hlavní tok;
3. Add Catch — formulář, photo modal, map picker, klávesnice a návrat z revírů;
4. Catch Detail, Gallery viewer/filter a Share Card;
5. Vycházky a revíry včetně composer/fixed prvků;
6. Profile, Stats, Notifications, Challenges a ostatní sekundární stránky;
7. ověření kontrastu, text scaling, keyboard focus, modal focus/Escape a reduced motion.

Další primitives přidávej pouze tam, kde se opakuje stejná interakce i vizuální kontrakt. Zachovej lokální rozvržení, pokud se liší cílová velikost, navigace, stav nebo přístupnost ovládání.
