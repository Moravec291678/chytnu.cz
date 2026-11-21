# QA veřejných projekcí · Prompt 03

**PARTIAL.** Ověření používá pouze syntetické účty a fotografie. Živá Cloudinary revokace a účty v produkci čekají na schválené scénáře Promptů 06–07 a 28. Soukromý pilot se tímto rozhodnutím neotevírá.

## Pole, role a zdroje

| Rozhraní | Zdroje | Co lze vrátit a komu |
| --- | --- | --- |
| view, search, friends, preview | publicProfiles, publicHandles, socialRelationships/blocks, owner scope a autorizovaný ledger | UID, veřejné jméno, handle, sanitizovaný avatar identifikátor, serverový badge, bio, volitelný region/zájmy a zvolené sections. Náhled omezen na vlastníka a simulovanou roli. Zájmy, XP a čísla podle sekce. |
| posts.view/list, feed.list | socialPosts, consent receipt, autorovy Catch/Photo a případný katalogový revír, role a moderace | ID příspěvku, autor, viditelnost, revize a časy příspěvku, schválený druh, explicitní popis, délka, skutečná váha, metoda, datum na dny/měsíce, zvolený katalogový revír a indikace fotografie. Zdrojová ID a schválená pole jen vlastníkovi. Soukromý revír se nepromítá. |
| Zážitky, achievementy, milníky | socialPosts a schválený účetní progres | Jen titulek, veřejný popis a validované snapshoty achievement/progress podle typu. Starší mapy s přebytečnými klíči se nevracejí verbatim. |
| Veřejné statistiky profilu | Povolené Catch projekce a znovu ověřené Catch publikace | Agregace a připravené projekce pro příslušnou sekci a roli. Žádné soukromé zdrojové poznámky a přesné místo. |
| posts.image, image (legacy a avatar) | Autorizovaná publikace a aktivní příloha, fingerprint/epoch, moderace, serverový media provider | JPEG příp. jeho base64, po druhém autorizačním čtení. Žádný originál, provider URL, podpis nebo EXIF mapy. Respondéry používají private no-store. |
| posts.own, self, save, admin | Vlastník, serverová identita a případný auditovaný grant | Vlastník může pracovat s vlastními zdrojovými identifikátory a souhlasem. Privilegované podpůrné operace mají samostatný autentizovaný scope. |

Volně vyplněná veřejná bio a popis zůstávají explicitně veřejným uživatelským textem. Přesná GPS, e-mail, soukromý originál, metadata fotky, privátní notes a zprávy nejsou automaticky promítané. Privátní zprávy nemají publikované API.

## Nález a oprava

Kontrola catch fingerprintu ověřovala aktuální zdroj proti schváleným parametrům, ale povolená odpověď dříve přebírala také volnou mapu `socialPosts.content`. Přebytečné pole ve starším či nekonzistentním serverovém dokumentu mohlo projít při čtení. Nejde o důkaz, že cizí klient mohl Firestore dokument zapsat. Cílený emulátorový regresní případ doplní do jinak validní uložené projekce syntetický privátní klíč a neschválenou délku. Publikační vrstvy nyní pro výstupy znovu projektují původní aktuální a schválený zdroj a u zážitků vybírají pouze pole povolená pro daný druh. Ověřují se detail, seznam, feed a návazné klienty.

## Souhlas a revokace

- Privátní potvrzení ukládá server v uživatelově socialPreferences/publication jako režim, verzi, epochu a čas. Výslovné public-first se týká pouze vhodných záznamů vytvořených po potvrzení. Historicky soukromé úlovky nevstupují do automatického skenu.
- Nové čtení vyhodnotí souhlas, epochu, profilovou sekci, stav příspěvku, bloky a moderaci. Druhé ověření médií zkontroluje revizi po doručení. Store pravidla odmítají přímé zápisy klientům.
- Stará relace s jinou epochou selže. Publikace připravující fotografii znovu ověřuje souhlas a zdroj před commitem. Proces čtení reverzních vazeb a promazávání mediálních assetů je samostatná akceptace.
- Eliminuje se nový autorizovaný výdej po ztrátě oprávnění. Už uložená kopie u příjemce se nedá vzdáleně vymazat. Skutečné provider chování pro signed transform, invalidaci a zbytky cache musí ukázat Prompty 06–07 v sandboxu.

## Zbývající živá akceptace

David povolí dedikované účty A/B/C a použití testovacího JPEG bez osobních údajů v ověřeném izolovaném prostředí. Ověřit veřejný výstup B i anonymní prohlížeč, soukromý C, vztah a blok, souběh staré relace A a pending upload, odvolání a pokus načíst médium po odvolání. Zaznamenat jen status, SHA a čas, žádné bearer URL nebo skutečné podklady. Zachovat [rozsah pilotu](RELEASE_SCOPE_MATRIX.md) a [brány](RELEASE_ACCEPTANCE_CHECKLIST.md).
