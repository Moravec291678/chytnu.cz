# Akceptace Okolí

**PARTIAL · 21. 11. 2026.** Původní worktree obsahuje dosavadní Nearby Stage 10/12. Obrazovka a návrhy katalogu se shodují s release větví. Rozdíl ve službě je obecný cleanup pro přítomnost na revíru, již začleněný v release větvi. Rozpracované soubory v původním worktree zůstaly na místě.

## Hrozby a ověření

- **Nechtěná viditelnost.** Výchozí vypnutí, samostatný serverový souhlas s hrubou oblastí a další souhlas s odkazem na dohledatelný veřejný profil. Odvolání smaže aktivní relaci bez běžného limitu přihlášení. Po uplynutí 20 minut API relaci ignoruje i bez cleanupu.
- **Přesná poloha a přístup k dokumentům.** Vstupní souřadnice se validují a server uloží pouze čtyřznakový geohash. Výstupy účastníkům neobsahují souřadnice, geohash ani cizí čas relace. Přímé Firestore čtení a zápisy jsou zakázány. Nevhodné rozsahy, chybějící souhlas a anonymní vstup jsou odmítnuty.
- **Malá skupina a dohledávání.** Počítání přečte nejvýše 50 záznamů buňky, vrací jen `5+` nebo nic. Profily vyžadují samostatný souhlas, veřejnost a dohledatelnost. Vztahové blokování zabrání jejich vrácení. Pro join, změnu souhlasu a vyhledávání platí samostatně čtyři požadavky za minutu a dvanáct za den na účet. Validní vstup GPS z klienta může být simulovaný. Prah sám o sobě nezabrání koordinovanému zneužití více účty a nedokládá fyzickou přítomnost.
- **Veřejná aktivita u vody.** Pouze již dobrovolně sdílené a přístupné úlovky s potvrzeným veřejným názvem revíru. Nejvýše šest výstupů z dvaceti kandidátů. Shrnutí je na úrovni měsíce, bez privátního GPS, interního ID zdroje a původního privátního obsahu. Doporučení vody z katalogového bodu je heuristika.
- **Frontend a provoz.** 10 cílených testů včetně kontroly souhlasu UI. 86 čerstvých emulátorových ověření se šesti účty, včetně zákazu neplatných souřadnic, přímého přístupu, bloku, podprahového počtu, expiry a výchozího vypnutí API. Oprávnění GPS a zážitek z interaktivní mapy Okolí na fyzickém telefonu zůstávají neověřené. Stávající obrazovka používá hrubý přehled a katalogové návrhy. Feature flag zůstává vypnutý.
