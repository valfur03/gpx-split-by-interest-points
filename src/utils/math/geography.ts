export const haversineDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const toRadians = (deg: number): number => (deg * Math.PI) / 180;

  const radius = 6371;

  const radLat1 = toRadians(lat1);
  const radLat2 = toRadians(lat2);
  const delta1 = toRadians(lat2 - lat1);
  const delta2 = toRadians(lon2 - lon1);

  const a =
    Math.sin(delta1 / 2) ** 2 +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(delta2 / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return radius * c;
};
