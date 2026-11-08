# Aktivace administrace

OWNER se určuje výhradně serverovou proměnnou `CHYTNU_OWNER_UID`. Role v klientovi, e-mail ani vlastní tvrzení v tokenu OWNER nezaloží. Bez nastavení není vlastník automaticky vybrán.

1. V [Firebase Authentication projektu chutnucz](https://console.firebase.google.com/project/chutnucz/authentication/users) otevři **Users / Uživatelé**, vyhledej svůj existující účet a zkopíruj jeho **User UID**. Nejde o e-mail.
2. Ve [Vercel → chytnu-cz → Settings → Environment Variables](https://vercel.com/moravec291678s-projects/chytnu-cz/settings/environment-variables) přidej `CHYTNU_OWNER_UID` s tímto UID pouze do prostředí **Production**. Nepoužívej prefix `VITE_` a hodnotu nevkládej do zdrojového kódu.
3. V **Deployments** otevři poslední správné produkční nasazení → **… → Redeploy**, prostředí **Production**. Počkej na **Ready**. Nová proměnná se do již běžícího nasazení nepropíše.
4. V ChytnuCz se odhlas a znovu přihlas tímto účtem. V **Profilu** otevři **Administrace ChytnuCz**. Zkontroluj označení **OWNER** a sekci Nastavení. Citlivé změny vyžadují přihlášení v posledních pěti minutách; při výzvě se znovu přihlas.
5. Ověř jiným běžným účtem, že přímé otevření `/admin` administraci nezpřístupní. OWNER se nepřiděluje zápisem role do Firestore.

Správci mají pouze výslovně delegovaná oprávnění. Administrace nezpřístupňuje soukromé úlovky, fotografie ani GPS. Pozastavení blokuje cloudový přístup a odvolává přihlašovací relace; místní data nemaže. OWNER nelze přes administraci pozastavit ani přes běžné smazání účtu odstranit.

Individuální výjimka OWNER platí pouze pro interní uživatelský limit. Globální bezpečnostní rozpočet, souhlas uživatele a limity poskytovatele zůstávají platné. Správa nezapíná placený tarif ani neprovádí zkušební inference. Globální přepínače zde ovládají podporované externí AI funkce; offline ukládání a místní deník zůstávají nezávislé.

Provozní přehled uvádí skutečné dostupné agregace. Celkový počet registrací, stav Cloudinary, chyby synchronizace a metriky bez zdroje jsou označené jako nedostupné. Seznamy a filtry pracují s omezenou stránkou; nejde o neomezený sken databáze. Audit je zapisován pouze serverem současně se změnou a neobsahuje obsah soukromého deníku ani text interních úkolů.
