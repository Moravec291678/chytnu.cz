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
  console.log(groupMethodsArr);
  return groupMethodsArr.reduce(
    (max, item) => {
      return max.count < item.count ? item : max;
    },
    { count: 0 },
  );
}
