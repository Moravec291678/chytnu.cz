import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import FishActivity from "../features/home/components/FishActivity";
import { useCatches } from "../features/catches/context/useCatches";
import { getPersonalCatchTimePattern } from "../features/home/utils/fishActivity";
import "./FishActivityPage.css";

export default function FishActivityPage() {
  const { state: catchState } = useCatches();
  const personalPattern = getPersonalCatchTimePattern(catchState.catches ?? []);

  return <Layout>
    <div className="fish-activity-page">
      <Link className="fish-activity-page-back" to="/">← Domů</Link>
      <header>
        <span>Podmínky u vody</span>
        <h1>Fish Activity</h1>
        <p>Orientační skóre se počítá z aktuálních místních podmínek. Jeho výpočet je vysvětlený a nikdy se nepoužívá jako předpověď úlovků.</p>
      </header>
      <FishActivity detailed />
      {!catchState.loading && !catchState.error && personalPattern && <section className="fish-activity-personal">
        <span>OSOBNÍ STATISTIKA</span>
        <h2>Kdy máš nejvíc úlovků</h2>
        <strong>{personalPattern.labels.join(" · ")}</strong>
        <p>{personalPattern.count} z {personalPattern.sampleCount} záznamů připadá na tento časový úsek.</p>
      </section>}
      <section className="fish-activity-privacy">
        <h2>Poloha a soukromí</h2>
        <p>Odhad vyžaduje výslovné povolení polohy. Souřadnice slouží pouze k načtení místního počasí a neukládají se jako součást úlovku ani sdílené karty.</p>
        <p>Bez povolení polohy zůstávají deník i ostatní funkce dostupné. Odhad můžeš kdykoli zkusit znovu po změně oprávnění v nastavení prohlížeče.</p>
      </section>
    </div>
  </Layout>;
}
