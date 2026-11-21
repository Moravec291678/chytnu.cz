# Konzistence vzhledu · Prompt 14

**PASS pro ověřenou změnu.** Aplikační tokeny v src/index.css pokrývají paletu, rozestupy, typografii, zaoblení, vrstvy, stavy polí a pohyb. Společná tlačítka teď používají stávající významové tokeny výšky a zaoblení. Jejich rozměry zůstaly stejné. Na stránce revírů používají prvky Zpět a volba typu vody stejnou minimální výšku. Zelené Uložit má stejnou výšku 52 px a rádius jako hlavní tlačítko v editoru úlovku.

Původní Uložit v /waters/new použilo fixní vrstvu nad spodní navigací. Čtyři měření na 320, 390, 768 a 1 440 px ukázala, že jeho spodní okraj zasahoval 70 px pod horní hranu navigace. Syntetické screenshoty potvrdily překrytí. Tlačítko je nově v toku stránky, spodní odsazení a safe area zajišťuje společný Layout. Ve všech čtyřech šířkách je po odscrollování překrytí 0 px. Stejný styl platí i pro úpravu revíru.

Chromium pořídilo 40 screenshotů před a 40 po. Vzorek zahrnoval Domů, Deník, Detail s lokální fotkou, Galerii, Komunitu, Profil, Nastavení, nový úlovek, revír a vycházku. Pixelové srovnání ve všech čtyřech šířkách mělo mimo upravený formulář rozdíl vždy pod 5 %, čtrnáct dvojic bylo přesně shodných. Rozdíly zahrnují aktuální datum či dynamický obsah syntetických relací. Screenshoty zůstaly v místních dočasných složkách chytnu-p14-shots-before a chytnu-p14-shots-after.

Přihlášený emulátorový účet při 390 px otevřel Profil → Moje revíry → Přidat revír, dotykový cíl obsloužil skutečný klik ve středu tlačítka a následně viděl název na detailu a ve filtru Všechny. Výchozí filtr Oblíbené nadále ukazuje jen ručně označené revíry. Lint, 76 cílených testů a diff check prošly. Fyzická přístupnost a velké sady jsou v Promptu 15.
