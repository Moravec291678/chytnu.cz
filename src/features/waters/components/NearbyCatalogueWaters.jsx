import { useState } from "react";
import { Link } from "react-router-dom";
import { socialRequest } from "../../social/data/socialClient.js";
import { risCatalogue } from "../data/risCatalogue.js";
import { findNearbyCatalogueWaters } from "../data/nearbyWaterMatch.js";

function readLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Zařízení nepodporuje zjišťování polohy."));
      return;
    }
    navigator.geolocation.getCurrentPosition(({ coords }) => resolve(coords), error => {
      reject(new Error(error.code === 1 ? "Přístup k poloze nebyl povolen." : "Polohu se nepodařilo zjistit."));
    }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 0 });
  });
}

export default function NearbyCatalogueWaters({ ownerId }) {
  const [result, setResult] = useState({ status: "idle" });
  const [activity, setActivity] = useState(null);

  async function search() {
    setActivity(null);
    setResult({ status: "loading" });
    try {
      const coordinates = await readLocation();
      const rows = await risCatalogue.list();
      setResult({ status: "ready", waters: findNearbyCatalogueWaters(coordinates, rows) });
    } catch (error) {
      setResult({ status: "error", message: error.message });
    }
  }

  async function showActivity(water) {
    setActivity({ status: "loading", water });
    try {
      const { posts } = await socialRequest("nearby.waterActivity", { catalogueId: water.id }, { expectedUid: ownerId });
      setActivity({ status: "ready", water, posts });
    } catch (error) {
      setActivity({ status: "error", water, message: error.message });
    }
  }

  return <section className="nearby-settings" aria-labelledby="nearby-waters-title">
    <h2 id="nearby-waters-title">Revíry ČRS v okolí</h2>
    <p>Hledání používá polohu jen v zařízení. Vzdálenost je orientační a měří se k bodu v katalogu. Před výběrem si ověř, zda revír odpovídá místu, kde chceš lovit.</p>
    <button className="nearby-check-in" type="button" onClick={search} disabled={result.status === "loading" || activity?.status === "loading"}>
      {result.status === "loading" ? "Hledám revíry…" : "Najít revíry podle polohy"}
    </button>
    {result.status === "loading" && <p role="status">Zjišťuji polohu a načítám katalog.</p>}
    {result.status === "error" && <p className="nearby-error" role="alert">{result.message}</p>}
    {result.status === "ready" && (result.waters.length ? <ul className="nearby-catalogue-list">
      {result.waters.map(water => <li key={water.id}>
        <Link to={`/waters/catalogue/${water.id}`}>{water.name} · {water.number}</Link>
        <small>{water.approximateKm < 1 ? "méně než 1 km" : `asi ${water.approximateKm} km`}</small>
        {ownerId && <button type="button" className="nearby-stop" onClick={() => showActivity(water)} disabled={activity?.status === "loading"} aria-label={`Veřejné úlovky – ${water.name} ${water.number}`}>Veřejné úlovky</button>}
      </li>)}
    </ul> : <p role="status">Do 25 km jsme v katalogu nenašli revír se souřadnicemi.</p>)}
    {activity && <div>
      <h3>Veřejné úlovky · {activity.water.name}</h3>
      {activity.status === "loading" && <p role="status">Načítám veřejné úlovky…</p>}
      {activity.status === "error" && <p role="alert">{activity.message}</p>}
      {activity.status === "ready" && (activity.posts.length ? <ul className="nearby-catalogue-list">
        {activity.posts.map(post => <li key={post.id}><Link to={`/community/post/${post.id}`}>{post.species} · {post.displayName}</Link>{post.month && <small>{post.month}</small>}</li>)}
      </ul> : <p role="status">Pro tento revír jsme v dostupných příspěvcích nenašli veřejně sdílený úlovek.</p>)}
    </div>}
    <Link to="/waters/catalogue">Procházet celý katalog</Link>
  </section>;
}
