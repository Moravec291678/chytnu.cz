import { useEffect, useState } from "react";
import { formatDurationFromStart } from "../shared/utils/formatters";

function useLiveDuration(startedAt) {
  const [duration, setDuration] = useState(() =>
    formatDurationFromStart(startedAt),
  );

  useEffect(() => {
    setDuration(formatDurationFromStart(startedAt));

    const interval = setInterval(() => {
      setDuration(formatDurationFromStart(startedAt));
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt]);

  return duration;
}

export default useLiveDuration;
