export function getTopMethod(catches) {
  const groupMethods = catches.reduce((acc, item) => {
    const key = item.method.key;
    if (!acc[key]) {
      acc[key] = {
        key,
        label: item.method.label,
        count: 0,
      };
    }
    acc[key].count += 1;
    return acc;
  }, {});
  const groupMethodsArr = Object.values(groupMethods);
  return groupMethodsArr.reduce(
    (max, item) => {
      return max.count < item.count ? item : max;
    },
    { count: 0 },
  );
}

export function getReleasedPercentage(catches) {
  let released = 0;
  let count = 0;
  if (catches.length === 0) return 0;
  catches.forEach((item) => {
    if (item.result === "released") {
      released++;
    }
    count++;
  });

  return Math.round((released / count) * 100);
}

export function getTopRevier(catches) {
  const groupLocations = catches.reduce((acc, item) => {
    const key = item.locationName;
    if (!acc[key]) {
      acc[key] = {
        label: key,
        count: 0,
      };
    }
    acc[key].count += 1;
    return acc;
  }, {});
  const groupLocationsArr = Object.values(groupLocations);
  return groupLocationsArr.reduce(
    (max, item) => {
      return max.count < item.count ? item : max;
    },
    { count: 0 },
  );
}
