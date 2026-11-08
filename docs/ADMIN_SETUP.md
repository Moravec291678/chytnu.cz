# Aktivace administrace

OWNER se určuje výhradně serverovou proměnnou `CHYTNU_OWNER_UID`. Role v klientovi, e-mail ani vlastní tvrzení v tokenu OWNER nezaloží. Bez nastavení není vlastník automaticky vybrán.

Spolutvůrce se samostatně provisionuje serverovou proměnnou `CHYTNU_CO_CREATOR_UID` v témže prostředí Production. Použij přesné UID existujícího účtu z Firebase Authentication a proveď nové produkční nasazení jako níže. Obě UID musejí být různá. Role `CO_CREATOR` není přidělitelná formulářem ani klientským zápisem. Má pevná oprávnění k interním úkolům a nesenzitivnímu provoznímu přehledu, nikoli ke správě účtů, rolí, auditu ostatních správců či kritického nastavení. OWNER zůstává jediným vlastníkem. Neexistující redakční/moderační systém se touto rolí nezapíná.

Odznaky Zakladatel / Founder & Owner a Spolutvůrce / Co-Creator & Fishing Lead jsou odvozené ze serverové odpovědi pro aktuální přihlášený účet. V místní komunitě se zobrazují jen u vlastního ověřeného autora. Publikované profily s ověřenou identitou dalších autorů zatím nejsou zdrojem pro tyto odznaky; jméno v komentáři nikdy není důkazem role.

1. V [Firebase Authentication projektu chutnucz](https://console.firebase.google.com/project/chutnucz/authentication/users) otevři **Users / Uživatelé**, vyhledej svůj existující účet a zkopíruj jeho **User UID**. Nejde o e-mail.
2. Ve [Vercel → chytnu-cz → Settings → Environment Variables](https://vercel.com/moravec291678s-projects/chytnu-cz/settings/environment-variables) přidej `CHYTNU_OWNER_UID` s tímto UID pouze do prostředí **Production**. Nepoužívej prefix `VITE_` a hodnotu nevkládej do zdrojového kódu.
3. V **Deployments** otevři poslední správné produkční nasazení → **… → Redeploy**, prostředí **Production**. Počkej na **Ready**. Nová proměnná se do již běžícího nasazení nepropíše.
4. V ChytnuCz se odhlas a znovu přihlas tímto účtem. V **Profilu** otevři **Administrace ChytnuCz**. Zkontroluj označení **OWNER** a sekci Nastavení. Citlivé změny vyžadují přihlášení v posledních pěti minutách; při výzvě se znovu přihlas.
5. Ověř jiným běžným účtem, že přímé otevření `/admin` administraci nezpřístupní. OWNER se nepřiděluje zápisem role do Firestore.

Správci mají pouze výslovně delegovaná oprávnění. Administrace nezpřístupňuje soukromé úlovky, fotografie ani GPS. Pozastavení blokuje cloudový přístup a odvolává přihlašovací relace; místní data nemaže. OWNER nelze přes administraci pozastavit ani přes běžné smazání účtu odstranit.

Individuální výjimka OWNER platí pouze pro interní uživatelský limit. Globální bezpečnostní rozpočet, souhlas uživatele a limity poskytovatele zůstávají platné. Správa nezapíná placený tarif ani neprovádí zkušební inference. Globální přepínače zde ovládají podporované externí AI funkce; offline ukládání a místní deník zůstávají nezávislé.

Stejnou výjimku z běžného per-user AI rozpočtu má serverem provisionovaný CO_CREATOR. Oba mají přístup k podporovaným testovacím AI funkcím, vždy až po souhlasu a při zapnuté globální funkci. Běžný TESTER tuto výjimku automaticky nedostává.

AI před voláním nadále rezervuje 2500 neuronů pro fotografii (350 pro text). Po úspěšném uložení validního výsledku započte skutečné tokeny z pole `usage` odpovědi Cloudflare, zaokrouhlené nahoru podle [ceníku](https://developers.cloudflare.com/workers-ai/platform/pricing/): 9091 neuronů/M vstupních a 27273/M výstupních tokenů. Model má [kontext 256000 tokenů](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/) a požadavek omezuje výstup na 512; rezervace 2500 proto zůstává před voláním bezpečná. Vrácení rozdílu je transakční, jednorázové a svázané s účtem i UTC dnem. Chybějící nebo neplatné měření a neúspěšné požadavky ponechávají plnou rezervaci. Staré rezervace bez měření se zpětně nemažou.

Globální hranice zůstává 7500 neuronů/UTC den, textový rozpočet 1000; ani OWNER ji neobchází. Při provisionovaném spolupracovníkovi běžné účty společně nesmějí spotřebovat posledních 2500 neuronů. To chrání místo pro jednu konzervativně rezervovanou fotografii spolupracovníků; nejde o další kapacitu nad globální hranicí. Workers Free zůstává skutečnou pojistkou nulové ceny. Změna ověřené role/revize nebo nové účtování probudí čekající místní úkol jednou, další odmítnutí respektuje čas obnovení. Cache zásah novou rezervaci nespotřebuje.

Provozní přehled uvádí skutečné dostupné agregace. Celkový počet registrací, stav Cloudinary, chyby synchronizace a metriky bez zdroje jsou označené jako nedostupné. Seznamy a filtry pracují s omezenou stránkou; nejde o neomezený sken databáze. Audit je zapisován pouze serverem současně se změnou a neobsahuje obsah soukromého deníku ani text interních úkolů.
