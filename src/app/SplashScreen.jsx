import "./SplashScreen.css";

export default function SplashScreen() {
  return (
    <main className="launch-splash" aria-label="ChytnuCz se načítá">
      <p className="launch-splash-greeting">Petrův zdar!</p>
      <h1>ChytnuCz</h1>
      <p className="launch-splash-subtitle">Tvůj rybářský deník.</p>
      <span className="launch-splash-loader" role="status" aria-label="Načítám" />
    </main>
  );
}
