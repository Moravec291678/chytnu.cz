# Akceptace instalované PWA na iPhonu · Prompt 12

**BLOCKED DEVICE TEST.** Fyzický iPhone není připojen. Použij izolované HTTPS preview po potvrzení jeho Firebase a Cloudinary projektů a povolených syntetických relací. Základní přihlášení, konflikt a soukromí jsou v [iOS QA](PHYSICAL_TEST_IOS.md). Podmínky kontrolované aktualizace jsou stejné jako v [Android protokolu](DEVICE_ANDROID_PWA_ACCEPTANCE.md).

## Důkaz pro jedno zařízení a jeho druhého klienta

1. Zapisuj datum, čas, model, iOS, Safari, build A a B, URL a výsledek každého kroku. Build zjistíš v Nastavení v diagnostice. Doklady mohou obsahovat jen syntetické položky a nesmí obsahovat přihlašovací nebo doručovací token.
2. Otevři v Safari → Sdílet → Přidat na plochu. Spusť z ikony a ověř zobrazení bez adresního řádku, spodní lištu nad home indikátorem, horní safe area, text po zvětšení a návratové gesto.
3. Ulož JPEG z fotoaparátu a HEIC z knihovny na schváleném syntetickém účtu. Ověř čitelnost, zobrazení při omezeném přístupu ke knihovně, datum s doloženým zdrojem a nepřenášení soukromé polohy ven. Zopakuj se zamítnutou polohou, potom se schválenou. Zapiš stav oprávnění a formát testu.
4. Přepni do režimu Letadlo i bez Wi‑Fi. Pořiď neosobní snímek a dokonči úlovek, zaznamenej jeho ID a čekající fotku. Ukonči aplikaci ve switcheru, znovu ji otevři z plochy stále bez sítě a ověř detail, čitelnost fotografie, ID i čekající frontu. Ověř také návrat z pozadí a formulář se systémovou klávesnicí, včetně Uložit a spodní navigace.
5. Na stejném zkušebním originu nech převzít worker buildu B při čekající fotce, dočasně nepouštěj upload. Ověř nové SHA z Nastavení a zachování obou ID, IndexedDB a lokální fotky. Po obnově sítě ověř dokončené doručení a druhého klienta. Při paměťovém tlaku zopakuj návrat do deníku a otevření fotky. Zdokumentuj stav a čas každého kroku, včetně případného zásahu OS.
6. Pokud je k dispozici autorizovaný Mac, lze v Safari Web Inspectoru sledovat registraci workeru a názvy cache. Sleduj vlastní syntetický test na tomto zařízení. Výsledek desktopového Safari, Chromia nebo simulátoru eviduj samostatně.

Existující shell má apple-touch-icon a standalone manifest. [Chrome důkaz](QA_CORE_CATCH_JOURNAL.md) pokrývá desktopový restart offline, lokální JPEG a zachování Catch ID. Fyzické Safari, HEIC z telefonu, mobilní paměť a update s čekající fotkou zůstávají neověřené. Stav nepokrývá tvrzení o plné podpoře iPhone PWA.
