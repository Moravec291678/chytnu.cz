# Project Structure

`src/app`
- Start aplikace a routing.

`src/pages`
- Jednotlivé obrazovky aplikace.
- Každá page má vlastní `.jsx` a page-specific `.css`, pokud je potřeba.

`src/features`
- Doménová logika rozdělená podle částí aplikace.

`src/features/catches`
- Karty úlovků, context a mock data úlovků.

`src/features/home`
- Widgety pro domovskou stránku jako aktivita ryb a profilové statistiky.

`src/features/species`
- Komponenty pro přehled a zobrazení druhů ryb.

`src/features/trips`
- Komponenty a data pro výlety.

`src/shared`
- Sdílené věci napříč aplikací.
- `layout` obsahuje obecný layout aplikace.
- `constants` obsahuje společné konstanty.
- `utils` obsahuje obecné pomocné funkce.

`src/assets`
- Statické assety importované z Reactu.

`src/hooks`
- Sdílené custom hooks.

`src/services`
- API a integrační vrstva.
