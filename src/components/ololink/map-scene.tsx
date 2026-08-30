'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { EARTH_8K_URL } from '@/lib/earth-textures';
import { earthBasemap } from '@/lib/earth-basemap';
import { cn } from '@/lib/utils';
import type { OloLinkState } from '@/hooks/use-ololink';
import {
  AMBIENT_CELLS,
  ASSETS,
  ASSET_BY_ID,
  STATUS_META,
  TECH_META,
  type Asset,
  type AssetKind,
} from '@/lib/ololink';
import { REGIONS } from '@/lib/layers';
import { MAP_H, MAP_W, arcPath, livePosition, project, sceneTime, type LatLon } from '@/lib/geo2d';

const KIND_COLOR: Record<AssetKind, string> = {
  satellite: '#7dd3fc',
  haps: '#38bdf8',
  drone: '#a5b4fc',
  ground: '#34d399',
  customer: '#e2e8f0',
};

const WEATHER_COLOR = { CLOUD: '#94a3b8', RAIN: '#38bdf8', STORM: '#f472b6' } as const;

/** Nodes render at slightly different sizes so the altitude tiers stay readable. */
/** vertical label stagger keeps the surface cluster (GS / customer / drone) legible */
const LABEL_DY: Record<AssetKind, number> = {
  satellite: -9,
  haps: -16,
  drone: 15,
  ground: 10,
  customer: 20,
};

/** surface assets sit within ~1 degree of each other — fan them out in screen space */
const PIXEL_OFFSET: Record<AssetKind, { x: number; y: number }> = {
  satellite: { x: 0, y: 0 },
  haps: { x: -26, y: -18 },
  drone: { x: -30, y: 14 },
  ground: { x: 0, y: 0 },
  customer: { x: 30, y: 16 },
};

const KIND_SIZE: Record<AssetKind, number> = {
  satellite: 5,
  haps: 4.5,
  drone: 4,
  ground: 5,
  customer: 4.5,
};

/**
 * 2D operational glyphs — simplified but physically believable silhouettes that
 * mirror the 3D models: LEO bus + solar wings, HAPS glider planform, swept-wing
 * relay UAV, and a parabolic ground terminal.
 */
function NodeGlyph({ kind, color }: { kind: AssetKind; color: string }) {
  const s = KIND_SIZE[kind] / 4; // design units are drawn on a ~16px canvas

  if (kind === 'satellite') {
    // nadir-pointing bus, twin solar wings, high-gain dish
    return (
      <g transform={`scale(${s})`}>
        <g stroke={color} strokeWidth={0.5} strokeOpacity={0.85}>
          <rect x={-6.4} y={-1.7} width={4.2} height={3.4} fill={color} fillOpacity={0.28} />
          <path d={`M -5.4 -1.7 V 1.7 M -4.3 -1.7 V 1.7 M -3.2 -1.7 V 1.7`} strokeOpacity={0.5} />
          <rect x={2.2} y={-1.7} width={4.2} height={3.4} fill={color} fillOpacity={0.28} />
          <path d={`M 3.2 -1.7 V 1.7 M 4.3 -1.7 V 1.7 M 5.4 -1.7 V 1.7`} strokeOpacity={0.5} />
          <path d="M -2.2 0 H -1.4 M 2.2 0 H 1.4" />
        </g>
        <rect x={-1.4} y={-1.9} width={2.8} height={3.8} rx={0.3} fill={color} />
        <path d="M -1.1 1.9 A 1.6 1.6 0 0 0 1.1 1.9 Z" fill={color} fillOpacity={0.75} />
        <path d="M 0 -1.9 V -3.4" stroke={color} strokeWidth={0.5} />
      </g>
    );
  }

  if (kind === 'haps') {
    // very high aspect-ratio solar glider planform with distributed props
    return (
      <g transform={`scale(${s})`}>
        <g stroke={color} strokeWidth={0.5} fill="none" strokeOpacity={0.8}>
          <path d="M -3.6 -0.9 h 0.9 M -1.4 -0.9 h 0.9 M 0.5 -0.9 h 0.9 M 2.7 -0.9 h 0.9" />
        </g>
        <rect x={-7} y={-0.55} width={14} height={1.05} rx={0.5} fill={color} fillOpacity={0.85} />
        <rect x={-0.55} y={-0.4} width={1.1} height={4.4} rx={0.4} fill={color} />
        <rect x={-2} y={3.4} width={4} height={0.8} rx={0.35} fill={color} fillOpacity={0.8} />
      </g>
    );
  }

  if (kind === 'drone') {
    // compact swept-wing relay UAV with winglets and V-tail
    return (
      <g transform={`scale(${s})`}>
        <path
          d="M 0 -4.2 L 0.75 0.2 L 5 2.4 L 5 3.3 L 0.75 2.3 L 0.5 4.2 L -0.5 4.2 L -0.75 2.3 L -5 3.3 L -5 2.4 L -0.75 0.2 Z"
          fill={color}
          fillOpacity={0.9}
        />
        <path d="M -5 2.4 v 1.6 M 5 2.4 v 1.6" stroke={color} strokeWidth={0.6} />
        <path d="M -0.5 4.2 L -2.1 5.4 M 0.5 4.2 L 2.1 5.4" stroke={color} strokeWidth={0.6} />
      </g>
    );
  }

  if (kind === 'ground') {
    // parabolic dish on az/el pedestal over a pad
    return (
      <g transform={`scale(${s})`}>
        <path d="M -4.4 -3.4 A 4.4 4.4 0 0 1 1.6 -0.6 L -3 1 Z" fill={color} fillOpacity={0.55} stroke={color} strokeWidth={0.5} />
        <path d="M -1.6 -1.3 L 0.9 -3.2" stroke={color} strokeWidth={0.5} />
        <circle cx={0.9} cy={-3.2} r={0.5} fill={color} />
        <path d="M -2.4 0.6 L -1.2 3.4" stroke={color} strokeWidth={0.8} />
        <rect x={-4.4} y={3.4} width={8.8} height={0.9} rx={0.35} fill={color} fillOpacity={0.8} />
        <rect x={1.4} y={1.6} width={2.6} height={1.8} fill={color} fillOpacity={0.45} stroke={color} strokeWidth={0.4} />
      </g>
    );
  }

  return (
    <g transform={`scale(${s})`}>
      <rect x={-2.6} y={-2.6} width={5.2} height={5.2} fill="none" stroke={color} strokeWidth={0.8} />
      <circle r={1.1} fill={color} />
      <path d="M 0 -2.6 V -4 M 0 2.6 V 4 M -2.6 0 H -4 M 2.6 0 H 4" stroke={color} strokeWidth={0.6} strokeOpacity={0.7} />
    </g>
  );
}


/**
 * 2D operational map — the same mission state as the globe, projected
 * equirectangularly and optimised for network routing clarity.
 */
export function MapScene({ state }: { state: OloLinkState }) {
  const { links, route, profile, selection, layers, techFilter, telemetry } = state;

  // scenarios with a clear sky still show a faint ambient cloud field so the
  // weather layer toggle always has a visible effect
  const weatherCells = profile.weather.length ? profile.weather : AMBIENT_CELLS;

  // shared scene clock -> live satellite ground tracks
  const [t, setT] = useState(() => sceneTime());
  const raf = useRef<number>(0);
  useEffect(() => {
    if (!state.running) return;
    const loop = () => {
      setT(sceneTime());
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [state.running]);

  const positions = useMemo(() => {
    const map: Record<string, LatLon> = {};
    for (const a of ASSETS) map[a.id] = livePosition(a, t);
    return map;
  }, [t]);

  const routeIds = useMemo(() => new Set(route.map((s) => s.id)), [route]);
  const visibleLinks = useMemo(
    () => links.filter((l) => techFilter[l.segment.tech]),
    [links, techFilter]
  );

  const selectedAsset = selection?.type === 'asset' ? selection.id : null;
  const selectedLink = selection?.type === 'link' ? selection.id : null;
  const activeRegion = selectedAsset ? ASSET_BY_ID[selectedAsset]?.region ?? null : null;

  /* ------------------------------------------------ flattened earth base */
  const [basemap, setBasemap] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    earthBasemap()
      .then((url) => {
        if (alive) setBasemap(url);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  /* --------------------------------------------------------- pan & zoom */
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const clamp = (z: number, x: number, y: number) => ({
    z,
    x: Math.min(0, Math.max(MAP_W * (1 - z), x)),
    y: Math.min(0, Math.max(MAP_H * (1 - z), y)),
  });

  /** client point -> untransformed SVG user units */
  const toSvg = (cx: number, cy: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = svg.createSVGPoint();
    p.x = cx;
    p.y = cy;
    const q = p.matrixTransform(ctm.inverse());
    return { x: q.x, y: q.y };
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const cur = viewRef.current;
      const next = Math.min(14, Math.max(1, cur.z * Math.exp(-dy * 0.0016)));
      if (next === cur.z) return;
      const p = toSvg(e.clientX, e.clientY);
      const k = next / cur.z;
      setView(clamp(next, p.x - (p.x - cur.x) * k, p.y - (p.y - cur.y) * k));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const [grabbing, setGrabbing] = useState(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY, moved: false };
    setGrabbing(true);
    try {
      (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    } catch {
      /* capture unavailable */
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    const scale = ctm ? ctm.a || 1 : 1;
    const dx = (e.clientX - d.x) / scale;
    const dy = (e.clientY - d.y) / scale;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
    const cur = viewRef.current;
    setView(clamp(cur.z, cur.x + dx, cur.y + dy));
  };
  const endDrag = (e: React.PointerEvent) => {
    if (dragRef.current) {
      try {
        (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
    }
    setGrabbing(false);
    window.setTimeout(() => {
      dragRef.current = null;
    }, 0);
  };
  const dragged = () => dragRef.current?.moved ?? false;


  const z = view.z;
  const inv = 1 / z;

  const pointOf = (id: string) => {
    const ll = positions[id];
    const asset = ASSET_BY_ID[id];
    if (!ll || !asset) return null;
    const p = project(ll.lat, ll.lon);
    const o = PIXEL_OFFSET[asset.kind];
    // pixel fan-out is a screen-space nicety — undo it as the operator zooms in
    return { x: p.x + o.x * inv, y: p.y + o.y * inv };
  };

  /** keep link endpoints on the same side of the antimeridian */
  const pairPoints = (fromId: string, toId: string) => {
    const a = pointOf(fromId);
    const b = pointOf(toId);
    if (!a || !b) return null;
    const shifted = { ...b };
    if (Math.abs(shifted.x - a.x) > MAP_W / 2) shifted.x += shifted.x > a.x ? -MAP_W : MAP_W;
    return { a, b: shifted };
  };

  return (
    <div className="relative h-full w-full bg-[#03060d]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        preserveAspectRatio="xMidYMid slice"
        className={cn(
          'h-full w-full touch-none select-none [&_text]:select-none',
          grabbing ? 'cursor-grabbing' : 'cursor-grab'
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        onDragStart={(e) => e.preventDefault()}
        onClick={() => {
          if (!dragged()) state.select(null);
        }}
      >
        <defs>
          <clipPath id="map-clip">
            <rect x={0} y={0} width={MAP_W} height={MAP_H} />
          </clipPath>
          <radialGradient id="map-vignette" cx="50%" cy="50%" r="72%">
            <stop offset="55%" stopColor="#03060d" stopOpacity="0" />
            <stop offset="100%" stopColor="#03060d" stopOpacity="0.92" />
          </radialGradient>
          <linearGradient id="map-atmos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7fb3e8" stopOpacity="0.16" />
            <stop offset="26%" stopColor="#4a86c8" stopOpacity="0.04" />
            <stop offset="74%" stopColor="#4a86c8" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#7fb3e8" stopOpacity="0.16" />
          </linearGradient>
          {/* smooth heat-map style weather gradients */}
          <radialGradient id="wx-cloud">
            <stop offset="0%" stopColor="#cbd5e1" stopOpacity="0.28" />
            <stop offset="45%" stopColor="#b6c3d4" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#b6c3d4" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="wx-rain">
            <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.3" />
            <stop offset="45%" stopColor="#38bdf8" stopOpacity="0.17" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="wx-storm">
            <stop offset="0%" stopColor="#f9a8d4" stopOpacity="0.32" />
            <stop offset="45%" stopColor="#f472b6" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#f472b6" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g clipPath="url(#map-clip)">
        <g transform={`translate(${view.x} ${view.y}) scale(${z})`}>

          {/* deep ocean fallback */}
          <rect width={MAP_W} height={MAP_H} fill="#0a1a2e" />
          {/* flattened earth — same albedo / clouds / night lights as the globe */}
          <image
            href={basemap ?? EARTH_8K_URL}
            x={0}
            y={0}
            width={MAP_W}
            height={MAP_H}
            preserveAspectRatio="none"
          />



        </g>
        </g>


      </svg>


    </div>
  );
}
