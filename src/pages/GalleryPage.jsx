import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useCatches } from "../features/catches/context/useCatches";

function GalleryPage() {
  const { state } = useCatches();
  const [photos, setPhotos] = useState([]);

  useEffect(() => {
    const entries = state.catches.flatMap((item) => (item.photos ?? []).filter((photo) => photo.blob).map((photo) => ({
      id: photo.id, url: URL.createObjectURL(photo.blob), catchId: item.id, species: item.species,
    })));
    let active = true;
    Promise.resolve().then(() => { if (active) setPhotos(entries); });
    return () => {
      active = false;
      entries.forEach((photo) => URL.revokeObjectURL(photo.url));
    };
  }, [state.catches]);

  return <Layout><div className="add-catch-page"><header className="add-catch-header"><h1>Galerie</h1><p>Fotografie uložené u tvých úlovků</p></header>
    {state.loading ? <p>Načítám fotografie…</p> : state.error ? <p role="alert">{state.error}</p> : photos.length ? <div className="catch-gallery-grid">{photos.map((photo) => <Link to={`/catch/${photo.catchId}`} className="catch-gallery-item" key={photo.id}><img src={photo.url} alt={`Úlovek – ${photo.species}`} /><span>{photo.species}</span></Link>)}</div> : <section className="add-catch-section"><p>Zatím nemáš uložené žádné fotografie.</p><Link to="/add">Přidat úlovek s fotografií</Link></section>}
  </div></Layout>;
}

export default GalleryPage;
