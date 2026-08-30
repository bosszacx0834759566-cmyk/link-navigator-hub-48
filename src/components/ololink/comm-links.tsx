'use client';

/**
 * Communication architecture rendering.
 *
 * Data flow: LEO → HAPS → Relay Drone → Ground Station
 *   LEO  → HAPS   : optical laser — straight green beam, only while the
 *                   line-of-sight (pass geometry) is good enough
 *   HAPS → Drone  : RF / microwave only — drawn as travelling wavefronts,
 *                   never as a straight laser beam
 *   Drone→ Ground : laser (straight green) or RF / microwave (wavefronts)
 *
 * Everything is sampled from live positions each frame, so links follow the
 * orbiting LEO layer and react to the simulation state (scenario, weather,
 * reroutes) through each link's `status`.
 */

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { ASSET_BY_ID, TECH_META, type LinkState, type Segment } from '@/lib/ololink';
import { windowScore } from '@/lib/orbits';
import type { Selection } from '@/hooks/use-ololink';

export type LiveMap = Map<string, THREE.Vector3>;

/** Laser green — every optical link uses it. */
export const LASER_GREEN = '#22c55e';

const SEGMENTS_N = 20;

/** Is this hop the space → stratosphere laser (LOS gated)? */
function isSpaceHop(segment: Segment) {
  return ASSET_BY_ID[segment.from]?.kind === 'satellite';
}

/* ------------------------------------------------------------- laser hop */

function LaserLink({
  link,
  live,
  gated,
  boost,
  onSelect,
}: {
  link: LinkState;
  live: LiveMap;
  gated: boolean;
  boost: number;
  onSelect: (s: Selection) => void;
}) {
  const core = useRef<THREE.Line>(null);
  const glow = useRef<THREE.Line>(null);
  const packs = useRef<THREE.Group>(null);
  const hit = useRef<THREE.Mesh>(null);
  const vis = useRef(0);
  const flow = useRef(Math.random());

  const degraded = link.status === 'DEGRADED';
  const off = link.status === 'UNAVAILABLE' || link.status === 'STANDBY';

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
    return g;
  }, []);

  const scratch = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), p: new THREE.Vector3() }), []);

  useFrame((_, d) => {
    const from = live.get(link.segment.from);
    const to = live.get(link.segment.to);
    if (!from || !to) return;
    const { a, b, p } = scratch;
    a.copy(from);
    b.copy(to);

    // line-of-sight gate: the laser only closes when the geometry allows it
    const los = gated ? THREE.MathUtils.smoothstep(windowScore(a, b), 0.16, 0.5) : 1;
    const target = off ? 0 : los;
    vis.current += (target - vis.current) * Math.min(1, d * 2.2);
    const v = vis.current * boost;
    flow.current = (flow.current + d * 0.55) % 1;

    const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    arr[0] = a.x; arr[1] = a.y; arr[2] = a.z;
    arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
    attr.needsUpdate = true;

    const colour = degraded ? '#fbbf24' : LASER_GREEN;
    if (glow.current) {
      const m = glow.current.material as THREE.LineBasicMaterial;
      m.color.set(colour);
      m.opacity = v * 0.55;
      glow.current.visible = v > 0.02;
    }
    if (core.current) {
      const m = core.current.material as THREE.LineBasicMaterial;
      m.opacity = v * 0.9;
      core.current.visible = v > 0.02;
    }
    if (packs.current) {
      packs.current.visible = v > 0.06;
      packs.current.children.forEach((child, i) => {
        const t = (flow.current + i / packs.current!.children.length) % 1;
        child.position.copy(p.copy(a).lerp(b, t));
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.color.set(colour);
        mat.opacity = v * 0.95;
      });
    }
    if (hit.current) hit.current.position.copy(p.copy(a).lerp(b, 0.5));
  });

  return (
    <group>
      {/* @ts-expect-error three line primitive */}
      <line ref={glow} geometry={geometry}>
        <lineBasicMaterial
          color={LASER_GREEN}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </line>
      {/* @ts-expect-error three line primitive */}
      <line ref={core} geometry={geometry}>
        <lineBasicMaterial
          color="#d9fbe5"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </line>
      <group ref={packs}>
        {[0, 1, 2].map((i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.004, 8, 8]} />
            <meshBasicMaterial
              color={LASER_GREEN}
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        ))}
      </group>
      <mesh
        ref={hit}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelect({ type: 'link', id: link.segment.id });
        }}
      >
        <sphereGeometry args={[0.016, 8, 8]} />
        <meshBasicMaterial color={LASER_GREEN} transparent opacity={0.01} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* --------------------------------------------------- RF / microwave hop */

const RINGS = 4;

/**
 * RF / microwave: no beam line — expanding wavefronts travelling from the
 * transmitter to the receiver.
 */
function WaveLink({
  link,
  live,
  boost,
  onSelect,
}: {
  link: LinkState;
  live: LiveMap;
  boost: number;
  onSelect: (s: Selection) => void;
}) {
  const rings = useRef<THREE.Group>(null);
  const hit = useRef<THREE.Mesh>(null);
  const vis = useRef(0);
  const flow = useRef(Math.random());

  const meta = TECH_META[link.segment.tech];
  const degraded = link.status === 'DEGRADED';
  const off = link.status === 'UNAVAILABLE' || link.status === 'STANDBY';

  const scratch = useMemo(
    () => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), p: new THREE.Vector3(), dir: new THREE.Vector3() }),
    []
  );

  useFrame((_, d) => {
    const from = live.get(link.segment.from);
    const to = live.get(link.segment.to);
    if (!from || !to) return;
    const { a, b, p, dir } = scratch;
    a.copy(from);
    b.copy(to);
    dir.copy(b).sub(a);
    const span = dir.length();

    vis.current += ((off ? 0 : 1) - vis.current) * Math.min(1, d * 2);
    const v = vis.current * boost;
    flow.current = (flow.current + d * 0.35) % 1;

    const colour = degraded ? '#fbbf24' : meta.color;
    if (rings.current) {
      rings.current.visible = v > 0.03;
      rings.current.children.forEach((child, i) => {
        const t = (flow.current + i / RINGS) % 1;
        p.copy(a).lerp(b, t);
        child.position.copy(p);
        child.lookAt(p.clone().add(dir));
        // wavefront widens as it propagates away from the transmitter
        child.scale.setScalar((0.35 + t * 1.5) * Math.max(0.4, span * 12));
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.color.set(colour);
        mat.opacity = v * Math.sin(t * Math.PI) * 0.75;
      });
    }
    if (hit.current) hit.current.position.copy(p.copy(a).lerp(b, 0.5));
  });

  return (
    <group>
      <group ref={rings}>
        {Array.from({ length: RINGS }, (_, i) => (
          <mesh key={i}>
            <torusGeometry args={[0.01, 0.0016, 6, 28]} />
            <meshBasicMaterial color={meta.color} transparent opacity={0} depthWrite={false} />
          </mesh>
        ))}
      </group>
      <mesh
        ref={hit}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelect({ type: 'link', id: link.segment.id });
        }}
      >
        <sphereGeometry args={[0.016, 8, 8]} />
        <meshBasicMaterial color={meta.color} transparent opacity={0.01} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------- ground fiber handoff */

function FiberLink({ link, live, boost }: { link: LinkState; live: LiveMap; boost: number }) {
  const line = useRef<THREE.Line>(null);
  const pulse = useRef<THREE.Mesh>(null);
  const t = useRef(Math.random());

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
    return g;
  }, []);
  const scratch = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), p: new THREE.Vector3() }), []);

  useFrame((_, d) => {
    const from = live.get(link.segment.from);
    const to = live.get(link.segment.to);
    if (!from || !to) return;
    const { a, b, p } = scratch;
    a.copy(from);
    b.copy(to);
    const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    arr[0] = a.x; arr[1] = a.y; arr[2] = a.z;
    arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
    attr.needsUpdate = true;
    t.current = (t.current + d * 0.4) % 1;
    if (pulse.current) {
      pulse.current.position.copy(p.copy(a).lerp(b, t.current));
      (pulse.current.material as THREE.MeshBasicMaterial).opacity = 0.85 * boost;
    }
    if (line.current) (line.current.material as THREE.LineBasicMaterial).opacity = 0.5 * boost;
  });

  return (
    <group>
      {/* @ts-expect-error three line primitive */}
      <line ref={line} geometry={geometry}>
        <lineBasicMaterial color={TECH_META.FIBER.color} transparent opacity={0} depthWrite={false} />
      </line>
      <mesh ref={pulse}>
        <sphereGeometry args={[0.005, 8, 8]} />
        <meshBasicMaterial color="#d1fae5" transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------- one link */

export function CommLink({
  link,
  live,
  highlighted,
  selected,
  onSelect,
}: {
  link: LinkState;
  live: LiveMap;
  highlighted: boolean;
  selected: boolean;
  onSelect: (s: Selection) => void;
}) {
  const family = TECH_META[link.segment.tech].family;
  const onPath = highlighted || selected;
  const boost = selected ? 1.35 : highlighted ? 1.1 : 0.55;

  if (family === 'fiber') return <FiberLink link={link} live={live} boost={onPath ? 1 : 0.5} />;
  if (family === 'optical')
    return (
      <LaserLink
        link={link}
        live={live}
        gated={isSpaceHop(link.segment)}
        boost={boost}
        onSelect={onSelect}
      />
    );
  return <WaveLink link={link} live={live} boost={boost} onSelect={onSelect} />;
}

/* ------------------------------------------------- end-to-end data flow */

const FLOW_PACKETS = 3;

/**
 * Data flow animation: bright payload pulses run the whole selected path,
 * hop by hop — LEO → HAPS → Drone → Ground Station → customer.
 */
export function DataFlow({ segments, live }: { segments: Segment[]; live: LiveMap }) {
  const group = useRef<THREE.Group>(null);
  const t = useRef(0);
  const scratch = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3() }), []);

  useFrame((_, d) => {
    const g = group.current;
    const n = segments.length;
    if (!g || n === 0) return;
    // one full traversal of the chain every ~n * 1.6 seconds
    t.current = (t.current + d / 1.6) % n;

    g.children.forEach((child, i) => {
      const p = (t.current + (i * n) / FLOW_PACKETS) % n;
      const idx = Math.min(n - 1, Math.floor(p));
      const local = p - idx;
      const s = segments[idx]!;
      const from = live.get(s.from);
      const to = live.get(s.to);
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (!from || !to) {
        mat.opacity = 0;
        return;
      }
      const { a, b } = scratch;
      mesh.position.copy(a.copy(from).lerp(b.copy(to), local));
      // fade at each hand-off so the relay through every node reads clearly
      mat.opacity = 0.55 + 0.45 * Math.sin(local * Math.PI);
      const pulse = 1 + 0.45 * Math.sin(local * Math.PI);
      mesh.scale.setScalar(pulse);
    });
  });

  if (!segments.length) return null;

  return (
    <group ref={group}>
      {Array.from({ length: FLOW_PACKETS }, (_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.0075, 10, 10]} />
          <meshBasicMaterial
            color="#eafff2"
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}
