import { useState, useEffect } from "react";
import {
  getUserLocation,
  fetchWeatherData,
  calculateFishActivity,
  getActivityLabel,
  getMoonPhase,
  getSeasonScore,
} from "../utils/fishActivity";
import "../styles/FishActivity.css";
function FishActivity() {
  const [score, setScore] = useState(null);
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reasons, setReasons] = useState([]);

  useEffect(() => {
    async function loadData() {
      try {
        const location = await getUserLocation();
        const data = await fetchWeatherData(location.lat, location.lng);
        const currentTime = data.current.time.slice(0, 13);

        const currentHourIndex = data.hourly.time.findIndex((time) =>
          time.startsWith(currentTime),
        );
        const weatherData = {
          temperature: data.current.temperature_2m,
          windSpeed: data.current.wind_speed_10m,
          pressure: data.current.surface_pressure,
          cloudiness: data.current.cloud_cover,
          rainChance: data.hourly.precipitation_probability[currentHourIndex],
          sunrise: data.daily.sunrise[0],
          sunset: data.daily.sunset[0],
        };

        setWeather(weatherData);
        const activity = calculateFishActivity(weatherData);

        setScore(activity.score);
        setReasons(activity.reasons);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) return <div className="fish-activity-card">Načítám...</div>;
  if (error) return <div className="fish-activity-card">Poloha nedostupná</div>;

  const { label } = getActivityLabel(score);
  const {
    pressure,
    temperature,
    windSpeed,
    cloudiness,
    rainChance,
    sunrise,
    sunset,
  } = weather;
  const moon = getMoonPhase();

  return (
    <div className="fish-activity-card">
      <div className="fish-activity-header">
        <span className="fish-activity-label">Aktivita ryb dnes</span>
        <div className="fish-activity-score-wrapper">
          <div className="fish-activity-score">{score}</div>

          <div className="fish-activity-progress">
            <div
              className="fish-activity-progress-fill"
              style={{ width: `${score * 10}%` }}
            ></div>
          </div>
        </div>
      </div>
      <p className="fish-activity-status">{label}</p>
      {reasons.length > 0 && (
        <p className="fish-activity-reason">{reasons[0]}</p>
      )}
      <div className="fish-activity-tags">
        <span className="fish-activity-tag">🔵 {Math.round(pressure)} hPa</span>
        <span className="fish-activity-tag">{moon.label}</span>
        <span className="fish-activity-tag">🌡️ {temperature}°C vzduch</span>
        <span className="fish-activity-tag">💨 {windSpeed} km/h vítr</span>
        <span className="fish-activity-tag">
          🌅 {sunrise.slice(11, 16)} · 🌇 {sunset.slice(11, 16)}
        </span>
        <span className="fish-activity-tag">☁️ {cloudiness}% oblačnost</span>

        <span className="fish-activity-tag">🌧️ {rainChance}% šance deště</span>
      </div>
    </div>
  );
}

export default FishActivity;
