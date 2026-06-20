"use client";

/** Haversine 거리 + 가장 가까운 필지 결정.
 *  단위: m. 지구 반지름 6371km.
 */

const EARTH_RADIUS_M = 6_371_000;
const DEFAULT_RADIUS_M = 500;

export type ParcelLike = {
  parcel_no: string;
  parcel_regno?: string;
  usage_label?: string;
  addr_2?: string;
  gps_lat?: number | null;
  gps_long?: number | null;
};

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** 현재 GPS 위치에서 가장 가까운 필지 (좌표가 있는 필지만 후보). */
export function nearestParcel(
  current: { lat: number; lng: number },
  parcels: ParcelLike[],
): { parcel: ParcelLike; distanceM: number } | null {
  let best: { parcel: ParcelLike; distanceM: number } | null = null;
  for (const p of parcels) {
    if (p.gps_lat == null || p.gps_long == null) continue;
    const d = haversineMeters(current, { lat: p.gps_lat, lng: p.gps_long });
    if (!best || d < best.distanceM) best = { parcel: p, distanceM: d };
  }
  return best;
}

/** 반경 안에 있으면 true. radiusM 미지정 시 기본 500m. */
export function isWithinRadius(distanceM: number, radiusM: number = DEFAULT_RADIUS_M): boolean {
  return distanceM <= radiusM;
}

export const DEFAULT_PARCEL_RADIUS_M = DEFAULT_RADIUS_M;
