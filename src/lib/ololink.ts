/**
 * OloLink orchestration domain model.
 * Software-defined intelligent communication orchestration across
 * LEO satellites, HAPS, relay drones, ground stations and customer networks.
 */

export type ScenarioId = 'clear' | 'cloud' | 'rain' | 'storm';

export type AssetKind = 'satellite' | 'haps' | 'drone' | 'ground' | 'customer';

export type Tech = 'OPTICAL' | 'FSO' | 'MICROWAVE' | 'RF' | 'FIBER';

export type Health = 'NOMINAL' | 'DEGRADED' | 'OFFLINE';

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  /** degrees */
  lat: number;
  lon: number;
  /** kilometres above sea level */
  altKm: number;
  role: string;
  region: string;
  health: Health;
}

export interface Segment {
  id: string;
  from: string;
  to: string;
  tech: Tech;
}

export interface WeatherCell {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** relative radius on the globe */
  size: number;
  /** 0-100 */
  severity: number;
  kind: 'CLOUD' | 'RAIN' | 'STORM';
}

export const TECH_META: Record<
  Tech,
  { label: string; short: string; color: string; desc: string; family: 'optical' | 'radio' | 'fiber' }
> = {
  OPTICAL: {
    label: 'Optical Laser',
    short: 'Optical',
    color: '#22c55e',
    desc: 'Coherent laser link, highest capacity, requires clear line-of-sight',
    family: 'optical',
  },
  FSO: {
    label: 'Free-Space Optical',
    short: 'FSO',
    color: '#22d3ee',
    desc: 'Directed optical through atmosphere, cloud sensitive',
    family: 'optical',
  },
  MICROWAVE: {
    label: 'Microwave',
    short: 'Microwave',
    color: '#fbbf24',
    desc: 'Weather-resilient microwave relay, moderate capacity',
    family: 'radio',
  },
  RF: {
    label: 'Radio Frequency',
    short: 'RF',
    color: '#f59e0b',
    desc: 'Adaptive RF backbone, all-weather, lower capacity',
    family: 'radio',
  },
  FIBER: {
    label: 'Terrestrial Fiber',
    short: 'Fiber',
    color: '#34d399',
    desc: 'Buried fiber handoff into the customer network, weather independent',
    family: 'fiber',
  },
};

export const KIND_META: Record<AssetKind, { label: string; plural: string }> = {
  satellite: { label: 'LEO Satellite', plural: 'LEO Satellites' },
  haps: { label: 'HAPS Platform', plural: 'HAPS Platforms' },
  drone: { label: 'Relay Drone', plural: 'Relay Drones' },
  ground: { label: 'Ground Station', plural: 'Ground Stations' },
  customer: { label: 'Customer Network', plural: 'Customer Networks' },
};

/** Deterministic pseudo-random generator so the generated fleet is stable
 *  across reloads (no Math.random — keeps SSR/CSR markup identical). */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FLEET_REGIONS = [
  'Thailand',
  'United States',
  'Pacific',
  'Atlantic',
  'Eurasia',
  'Europe',
  'South America',
  'Africa',
  'Indian Ocean',
  'Australia',
];

interface FleetSpec {
  kind: AssetKind;
  prefix: string;
  count: number;
  startIndex: number;
  altMin: number;
  altMax: number;
  latMin: number;
  latMax: number;
  role: string;
  seed: number;
}

/** Generate `count` assets spread around the globe with realistic altitudes. */
function generateFleet(spec: FleetSpec): Asset[] {
  const rand = mulberry32(spec.seed);
  const out: Asset[] = [];
  for (let i = 0; i < spec.count; i++) {
    const n = spec.startIndex + i;
    // Spread longitudes evenly with jitter; latitudes random within band.
    const lon = -180 + ((i + 0.5) / spec.count) * 360 + (rand() - 0.5) * 14;
    const lat = spec.latMin + rand() * (spec.latMax - spec.latMin);
    const altKm = +(spec.altMin + rand() * (spec.altMax - spec.altMin)).toFixed(1);
    const region = FLEET_REGIONS[i % FLEET_REGIONS.length]!;
    // a few non-nominal units for realism
    const health: Health = rand() < 0.88 ? 'NOMINAL' : rand() < 0.75 ? 'DEGRADED' : 'OFFLINE';
    out.push({
      id: `${spec.kind}-gen-${n}`,
      name: `${spec.prefix}-${n}`,
      kind: spec.kind,
      lat: +lat.toFixed(2),
      lon: +(((lon + 540) % 360) - 180).toFixed(2),
      altKm,
      role: `${spec.role} (${region})`,
      region,
      health,
    });
  }
  return out;
}

/** ~1 degree latitude ≈ 111 km; used to place cluster members km-accurately. */
const KM_PER_DEG = 111;

/**
 * Operational regions. Each region hosts exactly one co-located site:
 * HAPS-N (18–20 km) paired with Drone-N (2–5 km) and GS-N on the surface.
 * Anchors are verified continental/coastal-city coordinates so ground
 * stations never land in the ocean.
 */
export interface RegionAnchor {
  id: string;
  name: string;
  short: string;
  lat: number;
  lon: number;
}

export const REGION_ANCHORS: RegionAnchor[] = [
  { id: 'thailand', name: 'Thailand', short: 'TH', lat: 13.75, lon: 100.52 },
  { id: 'united-states', name: 'United States', short: 'US', lat: 39.74, lon: -104.99 },
  { id: 'japan', name: 'Japan', short: 'JP', lat: 35.68, lon: 139.69 },
  { id: 'india', name: 'India', short: 'IN', lat: 28.61, lon: 77.21 },
  { id: 'singapore', name: 'Singapore', short: 'SG', lat: 1.35, lon: 103.82 },
  { id: 'indonesia', name: 'Indonesia', short: 'ID', lat: -6.21, lon: 106.85 },
  { id: 'china', name: 'China', short: 'CN', lat: 31.23, lon: 121.47 },
  { id: 'australia', name: 'Australia', short: 'AU', lat: -33.87, lon: 151.21 },
  { id: 'united-kingdom', name: 'United Kingdom', short: 'UK', lat: 51.51, lon: -0.13 },
  { id: 'germany', name: 'Germany', short: 'DE', lat: 52.52, lon: 13.4 },
  { id: 'uae', name: 'United Arab Emirates', short: 'AE', lat: 25.2, lon: 55.27 },
  { id: 'kenya', name: 'Kenya', short: 'KE', lat: -1.29, lon: 36.82 },
  { id: 'south-africa', name: 'South Africa', short: 'ZA', lat: -26.2, lon: 28.05 },
  { id: 'brazil', name: 'Brazil', short: 'BR', lat: -23.55, lon: -46.63 },
  { id: 'canada', name: 'Canada', short: 'CA', lat: 45.42, lon: -75.7 },
];

/**
 * Generate co-located operation sites: each site N is a cluster of
 * HAPS-N (18–20 km, above the cloud deck), Drone-N (2–5 km altitude,
 * paired with its HAPS) and GS-N on the surface 10–15 km away.
 */
function generateSites(anchors: RegionAnchor[], startIndex: number, seed: number): Asset[] {
  const rand = mulberry32(seed);
  const out: Asset[] = [];
  anchors.forEach((anchor, i) => {
    const n = startIndex + i;
    const region = anchor.name;
    const healthOf = (): Health => (rand() < 0.88 ? 'NOMINAL' : rand() < 0.75 ? 'DEGRADED' : 'OFFLINE');

    // Ground station — anchored on land with a small local jitter (≤ ~35 km).
    const gsLat = anchor.lat + (rand() - 0.5) * 0.6;
    const gsLon = anchor.lon + (rand() - 0.5) * 0.6;

    // Drone: 10–15 km from the ground station, 2–5 km altitude.
    const dBearing = rand() * Math.PI * 2;
    const dDistKm = 10.5 + rand() * 4;
    const drnLat = gsLat + (Math.cos(dBearing) * dDistKm) / KM_PER_DEG;
    const drnLon = gsLon + (Math.sin(dBearing) * dDistKm) / (KM_PER_DEG * Math.cos((gsLat * Math.PI) / 180));
    const drnAlt = +(2 + rand() * 3).toFixed(1);

    // HAPS: paired with the drone, 2–5 km horizontally, stratospheric.
    const hBearing = rand() * Math.PI * 2;
    const hDistKm = 2.5 + rand() * 2;
    const hapsLat = drnLat + (Math.cos(hBearing) * hDistKm) / KM_PER_DEG;
    const hapsLon = drnLon + (Math.sin(hBearing) * hDistKm) / (KM_PER_DEG * Math.cos((drnLat * Math.PI) / 180));
    const hapsAlt = +(18 + rand() * 2).toFixed(1);

    const norm = (lon: number) => +(((lon + 540) % 360) - 180).toFixed(2);
    out.push(
      { id: `haps-gen-${n}`, name: `HAPS-${n}`, kind: 'haps', lat: +hapsLat.toFixed(2), lon: norm(hapsLon), altKm: hapsAlt, role: `Stratospheric relay (${region})`, region, health: healthOf() },
      { id: `drone-gen-${n}`, name: `Drone-${n}`, kind: 'drone', lat: +drnLat.toFixed(2), lon: norm(drnLon), altKm: drnAlt, role: `Low-altitude relay (${region})`, region, health: healthOf() },
      { id: `ground-gen-${n}`, name: `GS-${n}`, kind: 'ground', lat: +gsLat.toFixed(2), lon: norm(gsLon), altKm: 0, role: `Gateway station (${region})`, region, health: healthOf() },
    );
  });
  return out;
}

const GENERATED_ASSETS: Asset[] = [
  // LEO constellation — 23 generated + 7 curated = 30 satellites in motion
  ...generateFleet({
    kind: 'satellite',
    prefix: 'LEO',
    count: 23,
    startIndex: 8,
    altMin: 500,
    altMax: 720,
    latMin: -55,
    latMax: 60,
    role: 'Constellation capacity relay',
    seed: 1337,
  }),
  // Regions 3..15 — HAPS-N / Drone-N / GS-N clusters (regions 1 and 2 are the
  // curated Thailand and United States sites declared in ASSETS below).
  ...generateSites(REGION_ANCHORS.slice(2), 3, 4242),
];


export const ASSETS: Asset[] = [
  // LEO constellation (orchestrated, not owned) — spread across realistic orbits
  { id: 'sat-th-1', name: 'LEO-1', kind: 'satellite', lat: 16, lon: 102, altKm: 550, role: 'Optical downlink (Thailand)', region: 'Thailand', health: 'NOMINAL' },
  { id: 'sat-th-2', name: 'LEO-2', kind: 'satellite', lat: 4, lon: 111, altKm: 585, role: 'Capacity relay (APAC)', region: 'Thailand', health: 'NOMINAL' },
  { id: 'sat-us-1', name: 'LEO-3', kind: 'satellite', lat: 38, lon: -106, altKm: 545, role: 'Optical downlink (United States)', region: 'United States', health: 'NOMINAL' },
  { id: 'sat-us-2', name: 'LEO-4', kind: 'satellite', lat: 27, lon: -95, altKm: 605, role: 'Capacity relay (AMER)', region: 'United States', health: 'DEGRADED' },
  { id: 'sat-pac', name: 'LEO-5', kind: 'satellite', lat: 22, lon: -158, altKm: 640, role: 'Trans-Pacific crosslink', region: 'Pacific', health: 'NOMINAL' },
  { id: 'sat-atl', name: 'LEO-6', kind: 'satellite', lat: -18, lon: -32, altKm: 700, role: 'Orbital standby', region: 'Atlantic', health: 'NOMINAL' },
  { id: 'sat-ind', name: 'LEO-7', kind: 'satellite', lat: 48, lon: 62, altKm: 675, role: 'Orbital standby', region: 'Eurasia', health: 'NOMINAL' },

  // HAPS — stratospheric, 18-20 km
  { id: 'haps-th', name: 'HAPS-1', kind: 'haps', lat: 13.68, lon: 100.45, altKm: 19, role: 'Stratospheric relay over Thailand', region: 'Thailand', health: 'NOMINAL' },
  { id: 'haps-us', name: 'HAPS-2', kind: 'haps', lat: 39.85, lon: -105.07, altKm: 19.5, role: 'Stratospheric relay over United States', region: 'United States', health: 'NOMINAL' },

  // Relay drones
  { id: 'drn-th', name: 'Drone-1', kind: 'drone', lat: 13.66, lon: 100.44, altKm: 4, role: 'Low-altitude relay over Thailand', region: 'Thailand', health: 'NOMINAL' },
  { id: 'drn-us', name: 'Drone-2', kind: 'drone', lat: 39.83, lon: -105.08, altKm: 4, role: 'Low-altitude relay over United States', region: 'United States', health: 'NOMINAL' },

  // Ground stations
  { id: 'gs-th', name: 'GS-1', kind: 'ground', lat: 13.75, lon: 100.52, altKm: 0, role: 'Primary gateway', region: 'Thailand', health: 'NOMINAL' },
  { id: 'gs-us', name: 'GS-2', kind: 'ground', lat: 39.74, lon: -104.99, altKm: 0, role: 'Primary gateway', region: 'United States', health: 'NOMINAL' },

  // Customer networks
  { id: 'cus-th', name: 'TH Enterprise Edge', kind: 'customer', lat: 13.9, lon: 100.85, altKm: 0, role: 'Fiber handoff', region: 'Thailand', health: 'NOMINAL' },
  { id: 'cus-us', name: 'US Metro Core', kind: 'customer', lat: 39.55, lon: -104.6, altKm: 0, role: 'Fiber handoff', region: 'United States', health: 'NOMINAL' },

  // Generated fleet — brings totals to 10 LEO, 5 HAPS, 5 drones, 5 ground stations
  ...GENERATED_ASSETS,
];


export const ASSET_BY_ID: Record<string, Asset> = Object.fromEntries(
  ASSETS.map((a) => [a.id, a])
);

export type LinkStatus = 'ACTIVE' | 'DEGRADED' | 'UNAVAILABLE' | 'REROUTING' | 'STANDBY';

export const STATUS_META: Record<LinkStatus, { label: string; color: string; tone: string }> = {
  ACTIVE: { label: 'Active', color: '#34d399', tone: 'text-emerald-300' },
  DEGRADED: { label: 'Degraded', color: '#fbbf24', tone: 'text-amber-300' },
  UNAVAILABLE: { label: 'Unavailable', color: '#fb7185', tone: 'text-rose-300' },
  REROUTING: { label: 'Rerouting', color: '#e0f2fe', tone: 'text-sky-200' },
  STANDBY: { label: 'Standby', color: '#64748b', tone: 'text-slate-300' },
};

/** How strongly each transport is affected by atmospheric conditions. */
export const TECH_SENSITIVITY: Record<Tech, number> = {
  OPTICAL: 1,
  FSO: 0.72,
  MICROWAVE: 0.38,
  RF: 0.22,
  FIBER: 0,
};

export interface LinkState {
  segment: Segment;
  status: LinkStatus;
  bandwidth: number;
  latency: number;
  loss: number;
  signal: number;
  /** 0-100 atmospheric impact on this specific segment */
  impact: number;
  weatherImpact: string;
  /** weather cells intersecting this segment */
  cells: string[];
}


function seg(id: string, from: string, to: string, tech: Tech): Segment {
  return { id, from, to, tech };
}

/**
 * Every generated regional site gets the same four-tier chain, fed by the
 * geographically closest LEO satellite of the constellation.
 */
function generateSiteSegments(): Segment[] {
  const sats = ASSETS.filter((a) => a.kind === 'satellite');
  const out: Segment[] = [];
  for (const haps of ASSETS) {
    if (haps.kind !== 'haps' || !haps.id.startsWith('haps-gen-')) continue;
    const n = haps.id.replace('haps-gen-', '');
    const drone = `drone-gen-${n}`;
    const ground = `ground-gen-${n}`;
    if (!ASSET_BY_ID[drone] || !ASSET_BY_ID[ground]) continue;
    const nearest = sats
      .slice()
      .sort(
        (a, b) =>
          geoSep(a.lat, a.lon, haps.lat, haps.lon) - geoSep(b.lat, b.lon, haps.lat, haps.lon)
      )
      .slice(0, 2);
    nearest.forEach((s, i) => {
      out.push(seg(`s-${s.id}-${haps.id}-${i}`, s.id, haps.id, 'OPTICAL'));
    });
    out.push(seg(`s-${haps.id}-${drone}`, haps.id, drone, 'MICROWAVE'));
    out.push(seg(`s-${drone}-${ground}-laser`, drone, ground, 'OPTICAL'));
    out.push(seg(`s-${drone}-${ground}`, drone, ground, 'RF'));
  }
  return out;
}


/**
 * Communication architecture — the data flow is strictly
 *   LEO → HAPS → Relay Drone → Ground Station (→ customer fiber handoff)
 *
 *  LEO  → HAPS   : optical laser only (line-of-sight gated)
 *  HAPS → Drone  : RF / microwave only — never laser
 *  Drone→ Ground : laser (optical) or RF / microwave
 */
export const SEGMENTS: Segment[] = [
  // ---- Thailand operational region
  seg('s-satth1-hapsth', 'sat-th-1', 'haps-th', 'OPTICAL'),
  seg('s-satth2-hapsth', 'sat-th-2', 'haps-th', 'OPTICAL'),
  seg('s-hapsth-drnth', 'haps-th', 'drn-th', 'MICROWAVE'),
  seg('s-drnth-gsth-laser', 'drn-th', 'gs-th', 'OPTICAL'),
  seg('s-drnth-gsth', 'drn-th', 'gs-th', 'RF'),
  seg('s-gsth-custh', 'gs-th', 'cus-th', 'FIBER'),

  // ---- United States operational region
  seg('s-satus1-hapsus', 'sat-us-1', 'haps-us', 'OPTICAL'),
  seg('s-satus2-hapsus', 'sat-us-2', 'haps-us', 'OPTICAL'),
  seg('s-hapsus-drnus', 'haps-us', 'drn-us', 'MICROWAVE'),
  seg('s-drnus-gsus-laser', 'drn-us', 'gs-us', 'OPTICAL'),
  seg('s-drnus-gsus', 'drn-us', 'gs-us', 'RF'),
  seg('s-gsus-cusus', 'gs-us', 'cus-us', 'FIBER'),

  // ---- generated regional sites: same four-tier architecture
  ...generateSiteSegments(),
];


const SEGMENT_BY_ID: Record<string, Segment> = Object.fromEntries(
  SEGMENTS.map((s) => [s.id, s])
);


export interface ScenarioProfile {
  id: ScenarioId;
  name: string;
  short: string;
  summary: string;
  severity: number;
  networkHealth: 'NOMINAL' | 'STABLE' | 'DEGRADED';
  systemMode: string;
  telemetry: {
    bandwidth: number;
    latency: number;
    packetLoss: number;
    signal: number;
    availability: number;
  };
  /** ordered asset ids of the AI-selected primary route */
  route: string[];
  /** ordered segment ids of the primary route — pins the exact transport per hop */
  routeSegmentIds: string[];
  blockedTech: Tech[];
  weather: WeatherCell[];
  ai: {
    analysis: string[];
    recommendation: string[];
    confidence: number;
    action: string;
  };
  alerts: { id: string; level: 'INFO' | 'WARN' | 'CRITICAL'; text: string }[];
}

/**
 * Purely visual baseline cloud field, shown when the active scenario carries no
 * weather cells. Not part of routing/exposure maths — display only.
 */
export const AMBIENT_CELLS: WeatherCell[] = [
  { id: 'wa1', name: 'Thin cirrus APAC', lat: 11, lon: 104, size: 0.1, severity: 12, kind: 'CLOUD' },
  { id: 'wa2', name: 'Thin cirrus NA', lat: 38, lon: -101, size: 0.09, severity: 10, kind: 'CLOUD' },
  { id: 'wa3', name: 'Marine layer ATL', lat: 24, lon: -42, size: 0.12, severity: 14, kind: 'CLOUD' },
];

const CLOUD_CELLS: WeatherCell[] = [
  { id: 'w1', name: 'Cloud deck TH-4', lat: 13, lon: 101, size: 0.16, severity: 46, kind: 'CLOUD' },
  { id: 'w2', name: 'Cloud deck US-2', lat: 40, lon: -104, size: 0.14, severity: 38, kind: 'CLOUD' },
];


const RAIN_CELLS: WeatherCell[] = [
  { id: 'w1', name: 'Monsoon band TH', lat: 13.5, lon: 100.8, size: 0.2, severity: 74, kind: 'RAIN' },
  { id: 'w2', name: 'Rain cell US-Front Range', lat: 39.6, lon: -105.2, size: 0.15, severity: 52, kind: 'RAIN' },
];

const STORM_CELLS: WeatherCell[] = [
  { id: 'w1', name: 'Storm cell TH-9', lat: 13.6, lon: 100.6, size: 0.24, severity: 93, kind: 'STORM' },
  { id: 'w2', name: 'Storm cell US-5', lat: 39.9, lon: -104.6, size: 0.19, severity: 68, kind: 'STORM' },
  { id: 'w3', name: 'Rain band APAC', lat: 8, lon: 102, size: 0.22, severity: 61, kind: 'RAIN' },
];


export const SCENARIOS: Record<ScenarioId, ScenarioProfile> = {
  clear: {
    id: 'clear',
    name: 'Clear Sky',
    short: 'CLEAR',
    summary: 'Atmosphere transparent. LEO → HAPS → Drone → Ground carried end-to-end on laser.',
    severity: 8,
    networkHealth: 'NOMINAL',
    systemMode: 'OPTICAL CHAIN',
    telemetry: { bandwidth: 10.0, latency: 14, packetLoss: 0.02, signal: 98, availability: 99.98 },
    route: ['sat-th-1', 'haps-th', 'drn-th', 'gs-th', 'cus-th'],
    routeSegmentIds: ['s-satth1-hapsth', 's-hapsth-drnth', 's-drnth-gsth-laser', 's-gsth-custh'],
    blockedTech: [],
    weather: [],
    ai: {
      analysis: ['Atmospheric clarity optimal', 'Optical margin +7.4 dB', 'No obstruction forecast (90 min)'],
      recommendation: ['Hold optical chain LEO → HAPS', 'Laser hop Drone-1 → GS-1'],
      confidence: 99,
      action: 'HOLD ROUTE',
    },
    alerts: [],
  },
  cloud: {
    id: 'cloud',
    name: 'Cloud Cover',
    short: 'CLOUD',
    summary: 'Cloud deck at 12 km degrades optical. Adaptive relay engaged via HAPS.',
    severity: 42,
    networkHealth: 'STABLE',
    systemMode: 'ADAPTIVE RELAY',
    telemetry: { bandwidth: 6.4, latency: 38, packetLoss: 0.9, signal: 71, availability: 97.2 },
    route: ['sat-th-1', 'haps-th', 'drn-th', 'gs-th', 'cus-th'],
    routeSegmentIds: ['s-satth1-hapsth', 's-hapsth-drnth', 's-drnth-gsth', 's-gsth-custh'],
    blockedTech: ['OPTICAL'],
    weather: CLOUD_CELLS,
    ai: {
      analysis: ['Cloud layer detected at 12 km', 'Direct laser link unavailable', 'FSO viable above cloud deck'],
      recommendation: ['Reroute via HAPS-1', 'Drone-1 microwave hop', 'Terminate at GS-1'],
      confidence: 94,
      action: 'REROUTE VIA HAPS',
    },
    alerts: [{ id: 'a1', level: 'WARN', text: 'Optical downlink degraded over Thailand' }],
  },
  rain: {
    id: 'rain',
    name: 'Heavy Rain',
    short: 'RAIN',
    summary: 'Precipitation blocks optical paths. Microwave / RF backbone carrying traffic.',
    severity: 74,
    networkHealth: 'STABLE',
    systemMode: 'RF BACKBONE',
    telemetry: { bandwidth: 3.1, latency: 62, packetLoss: 2.4, signal: 54, availability: 92.4 },
    route: ['sat-us-1', 'haps-us', 'drn-us', 'gs-us', 'cus-us'],
    routeSegmentIds: ['s-satus1-hapsus', 's-hapsus-drnus', 's-drnus-gsus', 's-gsus-cusus'],
    blockedTech: ['OPTICAL', 'FSO'],
    weather: RAIN_CELLS,
    ai: {
      analysis: ['Rain attenuation 11.2 dB/km', 'Optical and FSO unavailable', 'Microwave margin acceptable'],
      recommendation: ['Shift traffic to HAPS-2', 'Drone-2 microwave hop', 'Terminate at GS-2'],
      confidence: 96,
      action: 'ENGAGE MICROWAVE',
    },
    alerts: [
      { id: 'a1', level: 'WARN', text: 'Optical layer unavailable across Thailand and United States' },
      { id: 'a2', level: 'INFO', text: 'Bandwidth ceiling reduced to 3.1 Gbps' },
    ],
  },
  storm: {
    id: 'storm',
    name: 'Severe Storm',
    short: 'SEVERE STORM',
    summary: 'Severe convective cells across region. Continuous route recalculation active.',
    severity: 93,
    networkHealth: 'DEGRADED',
    systemMode: 'ADAPTIVE ROUTING',
    telemetry: { bandwidth: 1.62, latency: 85, packetLoss: 4.8, signal: 38, availability: 86.1 },
    route: ['sat-th-2', 'haps-th', 'drn-th', 'gs-th', 'cus-th'],
    routeSegmentIds: ['s-satth2-hapsth', 's-hapsth-drnth', 's-drnth-gsth', 's-gsth-custh'],
    blockedTech: ['OPTICAL', 'FSO'],
    weather: STORM_CELLS,
    ai: {
      analysis: ['Severe storm detected over Thailand', 'All optical links unavailable', 'Route recalculating every 30 s'],
      recommendation: ['HAPS-1', 'Relay Drone-1', 'Microwave link', 'GS-1'],
      confidence: 96,
      action: 'AUTO REROUTE',
    },
    alerts: [
      { id: 'a1', level: 'CRITICAL', text: 'Storm cell TH-9 — optical blackout' },
      { id: 'a2', level: 'WARN', text: 'Packet loss above 4% on RF backbone' },
    ],
  },
};

export const SCENARIO_ORDER: ScenarioId[] = ['clear', 'cloud', 'rain', 'storm'];

/** Rough great-circle separation in degrees. */
function geoSep(aLat: number, aLon: number, bLat: number, bLon: number) {
  const dLat = aLat - bLat;
  const dLon = (aLon - bLon) * Math.cos(((aLat + bLat) / 2) * (Math.PI / 180));
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/** Atmospheric exposure (0-100) of a segment against the active weather field. */
export function segmentExposure(
  segment: Segment,
  weather: WeatherCell[]
): { exposure: number; cells: WeatherCell[] } {
  const a = ASSET_BY_ID[segment.from];
  const b = ASSET_BY_ID[segment.to];
  if (!a || !b) return { exposure: 0, cells: [] };
  const midLat = (a.lat + b.lat) / 2;
  const midLon = (a.lon + b.lon) / 2;

  let exposure = 0;
  const cells: WeatherCell[] = [];
  for (const c of weather) {
    // cell radius expressed in degrees on the surface
    const radius = 6 + c.size * 55;
    const d = Math.min(
      geoSep(a.lat, a.lon, c.lat, c.lon),
      geoSep(b.lat, b.lon, c.lat, c.lon),
      geoSep(midLat, midLon, c.lat, c.lon)
    );
    if (d > radius) continue;
    cells.push(c);
    const falloff = 1 - d / radius;
    exposure = Math.max(exposure, c.severity * (0.45 + 0.55 * falloff));
  }
  return { exposure, cells };
}

/** Derive per-segment link state for a scenario. */
export function linkStates(
  profile: ScenarioProfile,
  rerouting?: ReadonlySet<string>
): LinkState[] {
  const routeSet = new Set<string>(profile.routeSegmentIds);

  return SEGMENTS.map((segment) => {
    const onRoute = routeSet.has(segment.id);
    const { exposure, cells } = segmentExposure(segment, profile.weather);
    const sensitivity = TECH_SENSITIVITY[segment.tech];
    const impact = Math.round(exposure * sensitivity);
    const declaredBlock = profile.blockedTech.includes(segment.tech) && impact > 0;

    let status: LinkStatus;
    if (rerouting?.has(segment.id)) status = 'REROUTING';
    else if (declaredBlock || impact >= 55) status = 'UNAVAILABLE';
    else if (impact >= 20) status = onRoute ? 'DEGRADED' : 'DEGRADED';
    else status = onRoute ? 'ACTIVE' : 'STANDBY';

    const optical = TECH_META[segment.tech].family === 'optical';
    const down = status === 'UNAVAILABLE';
    const base = optical ? 10 : TECH_META[segment.tech].family === 'fiber' ? 8 : 3.4;
    const bandwidth = down ? 0 : +Math.max(0.1, base * (1 - impact / 130)).toFixed(2);

    return {
      segment,
      status,
      bandwidth,
      latency: Math.round((optical ? 14 : 42) + impact * 0.42 + profile.severity * 0.12),
      loss: +(down ? 100 : (optical ? 0.02 : 0.6) + impact * 0.05).toFixed(2),
      signal: Math.max(0, Math.round((optical ? 98 : 88) - impact * (optical ? 0.9 : 0.5))),
      impact,
      cells: cells.map((c) => c.name),
      weatherImpact: down
        ? cells.length
          ? `Path obstructed by ${cells[0]!.name}`
          : 'Transport unavailable under current conditions'
        : impact >= 20
          ? `Attenuation from ${cells[0]?.name ?? 'atmospheric layer'}, margin reduced`
          : impact > 0
            ? 'Minor attenuation, within margin'
            : 'No measurable impact',
    };
  });
}

/** Decision context assembled for one asset — what the operator must reason about. */
export interface AssetContext {
  asset: Asset;
  onRoute: boolean;
  links: LinkState[];
  active: LinkState[];
  impaired: LinkState[];
  standby: LinkState[];
  exposure: number;
  cells: string[];
  decisions: { title: string; detail: string; confidence: number; state: 'HELD' | 'APPLIED' | 'PENDING' }[];
  recommendations: string[];
  alerts: { id: string; level: 'INFO' | 'WARN' | 'CRITICAL'; text: string }[];
}

export function assetContext(
  assetId: string,
  profile: ScenarioProfile,
  links: LinkState[]
): AssetContext | null {
  const asset = ASSET_BY_ID[assetId];
  if (!asset) return null;
  const related = links.filter((l) => l.segment.from === assetId || l.segment.to === assetId);
  const active = related.filter((l) => l.status === 'ACTIVE' || l.status === 'REROUTING');
  const impaired = related.filter((l) => l.status === 'DEGRADED' || l.status === 'UNAVAILABLE');
  const standby = related.filter((l) => l.status === 'STANDBY');
  const onRoute = profile.route.includes(assetId);

  const cells = Array.from(new Set(related.flatMap((l) => l.cells)));
  const exposure = related.reduce((m, l) => Math.max(m, l.impact), 0);

  const decisions: AssetContext['decisions'] = [];
  if (onRoute) {
    decisions.push({
      title: `${asset.name} retained on primary path`,
      detail: `Orchestrator selected this node for the ${profile.systemMode.toLowerCase()} path. ${profile.ai.action}.`,
      confidence: profile.ai.confidence,
      state: profile.severity > 30 ? 'APPLIED' : 'HELD',
    });
  } else {
    decisions.push({
      title: `${asset.name} held in reserve`,
      detail: `Not required by the current path. Retained as failover capacity for ${asset.region}.`,
      confidence: Math.max(60, profile.ai.confidence - 12),
      state: 'HELD',
    });
  }
  if (impaired.length) {
    decisions.push({
      title: `${impaired.length} transport${impaired.length > 1 ? 's' : ''} impaired`,
      detail: impaired
        .map((l) => `${TECH_META[l.segment.tech].short} ${l.status.toLowerCase()} (${l.impact}% impact)`)
        .join(' · '),
      confidence: 92,
      state: 'APPLIED',
    });
  }
  if (standby.length) {
    decisions.push({
      title: `${standby.length} alternative path${standby.length > 1 ? 's' : ''} pre-computed`,
      detail: standby.map((l) => TECH_META[l.segment.tech].short).join(' · ') + ' available for immediate cutover.',
      confidence: 88,
      state: 'PENDING',
    });
  }

  const recommendations: string[] = [];
  if (impaired.some((l) => l.status === 'UNAVAILABLE')) {
    const fallback = standby[0] ?? related.find((l) => l.status === 'DEGRADED');
    recommendations.push(
      fallback
        ? `Shift traffic to ${TECH_META[fallback.segment.tech].short} via ${ASSET_BY_ID[fallback.segment.to === assetId ? fallback.segment.from : fallback.segment.to]?.name}`
        : 'No local fallback — escalate to constellation-level reroute'
    );
  }
  if (exposure >= 20 && exposure < 55) recommendations.push('Reduce modulation order, hold link with reduced capacity');
  if (asset.health === 'DEGRADED') recommendations.push(`Schedule maintenance window for ${asset.name}`);
  if (recommendations.length === 0) recommendations.push('No action required — hold current configuration');

  const alerts = profile.alerts.filter(
    (a) => a.text.toLowerCase().includes(asset.region.toLowerCase()) || onRoute
  );

  return { asset, onRoute, links: related, active, impaired, standby, exposure, cells, decisions, recommendations, alerts };
}


/** Ordered segments (in route direction) for a given asset-id chain.
 *  When `segmentIds` is supplied (ScenarioProfile.routeSegmentIds) it pins the
 *  exact transport per hop; otherwise falls back to the first matching pair. */
export function routeSegments(route: string[], segmentIds?: string[]): Segment[] {
  if (segmentIds) {
    return segmentIds
      .map((id) => SEGMENT_BY_ID[id])
      .filter((s): s is Segment => Boolean(s));
  }
  const out: Segment[] = [];
  for (let i = 0; i < route.length - 1; i++) {
    const from = route[i]!;
    const to = route[i + 1]!;
    const found = SEGMENTS.find((s) => s.from === from && s.to === to);
    if (found) out.push(found);
  }
  return out;
}

/** Convert lat/lon/altitude into a unit-sphere position (radius 1 = sea level). */
export function geoToVec(lat: number, lon: number, altKm: number, scale = 1): [number, number, number] {
  const r = (1 + altKm / 6371 / 0.55) * scale; // exaggerated altitude for legibility
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return [
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  ];
}
