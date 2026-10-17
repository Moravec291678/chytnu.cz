import { useEffect, useState } from "react";
import { formatDurationFromStart } from "../shared/utils/formatters";

function useLiveDuration(startedAt) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((tick) => tick + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt]);

  return formatDurationFromStart(startedAt);
}

export default useLiveDuration;