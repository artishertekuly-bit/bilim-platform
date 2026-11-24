// 3D scene for the nomad seasons simulation (React Three Fiber v8).
// Procedural meshes only (no external assets, no licence risk). Animation runs through refs in
// useFrame; React state is never updated from the render loop.
import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Color, Object3D, Vector3, type Group, type InstancedMesh, type Points } from 'three';

import { PASTURE_INFO } from '../../domain/nomad-seasons/content';
import { PASTURES, SEASONS, type PastureId, type Season } from '../../domain/nomad-seasons/model';
import { GROUND_COLORS, MAX_HERD_MARKS, PASTURE_POSITIONS, SKY_COLORS, herdMarks, herdOffset, pastureColor } from './layout';

export interface NomadSceneProps {
  season: Season;
  pasture: PastureId;
  grassPct: Record<PastureId, number>;
  herd: number;
  harshWinter: boolean;
  reducedMotion: boolean;
  /** Stops the render loop entirely (tab hidden or playback paused by the page). */
  paused: boolean;
  onContextLost: () => void;
}

const TRAVEL_MS = 1400;
const SHEEP_COLORS = ['#F6F3EC', '#ECE3D2', '#F6F3EC', '#8A6A4B', '#F6F3EC', '#E2D6C0'];
const MOUNTAINS: readonly [number, number, number, number][] = [
  [-8, -10.5, 3.2, 4.4],
  [-3, -11.5, 3.9, 5.8],
  [2.6, -11, 3.5, 5],
  [7.6, -10.2, 2.9, 3.9],
];

function Background({ color }: { color: string }) {
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    scene.background = new Color(color);
    invalidate();
  }, [color, scene, invalidate]);
  return null;
}

function Landscape({ season }: { season: Season }) {
  const frozen = season === 'winter';
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[19, 64]} />
        <meshStandardMaterial color={GROUND_COLORS[season]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, 10.2]}>
        <planeGeometry args={[34, 1.1]} />
        <meshStandardMaterial color={frozen ? '#DDE9F1' : '#6FA8D0'} />
      </mesh>
      {[-4.4, 4.4].map((x) => (
        <mesh key={x} position={[x, 0, 7.4]} scale={[1.9, 0.8, 1.3]}>
          <sphereGeometry args={[1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={frozen ? '#E9EDF0' : '#9C9A6A'} />
        </mesh>
      ))}
      {MOUNTAINS.map(([x, z, r, h]) => (
        <group key={`${x}:${z}`} position={[x, 0, z]}>
          <mesh position-y={h / 2}>
            <coneGeometry args={[r, h, 7]} />
            <meshStandardMaterial color="#8C8F86" flatShading />
          </mesh>
          <mesh position-y={h * 0.82}>
            <coneGeometry args={[r * 0.36, h * 0.36, 7]} />
            <meshStandardMaterial color="#F7F8F9" flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Small stones that trace the seasonal loop spring → summer → autumn → winter → spring. */
function RouteMarks() {
  const mesh = useRef<InstancedMesh>(null);
  const points = useMemo(() => {
    const out: [number, number][] = [];
    const order = SEASONS.map((_, i) => PASTURES[i]);
    order.forEach((from, i) => {
      const to = order[(i + 1) % order.length];
      const [ax, az] = PASTURE_POSITIONS[from];
      const [bx, bz] = PASTURE_POSITIONS[to];
      for (let k = 1; k < 9; k += 1) {
        const t = k / 9;
        // Bow each leg outwards so the path circles the steppe instead of crossing it.
        const mx = (ax + bx) / 2 * 1.35;
        const mz = (az + bz) / 2 * 1.35;
        const x = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * mx + t * t * bx;
        const z = (1 - t) * (1 - t) * az + 2 * (1 - t) * t * mz + t * t * bz;
        out.push([x, z]);
      }
    });
    return out;
  }, []);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const dummy = new Object3D();
    points.forEach(([x, z], i) => {
      dummy.position.set(x, 0.03, z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [points]);

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, points.length]}>
      <circleGeometry args={[0.09, 10]} />
      <meshBasicMaterial color="#6E675B" transparent opacity={0.55} />
    </instancedMesh>
  );
}

function PasturePatch({ id, pct, season, harshWinter, active }: { id: PastureId; pct: number; season: Season; harshWinter: boolean; active: boolean }) {
  const [x, z] = PASTURE_POSITIONS[id];
  return (
    <group position={[x, 0, z]}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
        <circleGeometry args={[2.6, 48]} />
        <meshStandardMaterial color={pastureColor(id, pct, season, harshWinter)} />
      </mesh>
      {active ? (
        <mesh rotation-x={-Math.PI / 2} position-y={0.035}>
          <ringGeometry args={[2.6, 2.8, 56]} />
          <meshBasicMaterial color="#111111" />
        </mesh>
      ) : null}
      <Html position={[0, 0.05, 3.2]} center zIndexRange={[20, 0]} pointerEvents="none">
        <div
          className={
            active
              ? 'whitespace-nowrap rounded-full bg-bl-ink px-2.5 py-1 text-[12px] font-semibold text-white'
              : 'whitespace-nowrap rounded-full border border-bl-line bg-white/95 px-2.5 py-1 text-[12px] font-semibold text-bl-ink'
          }
        >
          {PASTURE_INFO[id].title} · {pct}%
        </div>
      </Html>
    </group>
  );
}

function Yurt() {
  return (
    <group>
      <mesh position-y={0.3}>
        <cylinderGeometry args={[0.72, 0.72, 0.6, 28]} />
        <meshStandardMaterial color="#F2ECDF" />
      </mesh>
      <mesh position-y={0.56}>
        <cylinderGeometry args={[0.735, 0.735, 0.08, 28]} />
        <meshStandardMaterial color="#B03A2E" />
      </mesh>
      <mesh position-y={0.82}>
        <coneGeometry args={[0.78, 0.46, 28]} />
        <meshStandardMaterial color="#E7DFCF" />
      </mesh>
      <mesh position-y={1.03} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.13, 0.035, 8, 20]} />
        <meshStandardMaterial color="#7A4E2A" />
      </mesh>
      <mesh position={[0, 0.22, 0.715]}>
        <boxGeometry args={[0.3, 0.42, 0.04]} />
        <meshStandardMaterial color="#9C3B2E" />
      </mesh>
    </group>
  );
}

function Herd({ count, reducedMotion }: { count: number; reducedMotion: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const offsets = useMemo(() => Array.from({ length: MAX_HERD_MARKS }, (_, i) => herdOffset(i)), []);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const color = new Color();
    offsets.forEach(([ox, oz], i) => {
      dummy.position.set(ox, 0.1, oz);
      dummy.rotation.set(0, -i * 2.399963, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, color.set(SHEEP_COLORS[i % SHEEP_COLORS.length]));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [dummy, offsets]);

  useLayoutEffect(() => {
    if (mesh.current) mesh.current.count = count;
  }, [count]);

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m || reducedMotion) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < m.count; i += 1) {
      const [ox, oz] = offsets[i];
      dummy.position.set(ox, 0.1 + Math.abs(Math.sin(t * 1.8 + i * 1.3)) * 0.035, oz);
      dummy.rotation.set(0, -i * 2.399963 + Math.sin(t * 0.6 + i) * 0.25, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX_HERD_MARKS]} frustumCulled={false}>
      <boxGeometry args={[0.26, 0.18, 0.16]} />
      <meshStandardMaterial />
    </instancedMesh>
  );
}

/** The aul (yurt + herd) travels to the season's pasture along a short hop. */
function Camp({ pasture, herd, reducedMotion }: { pasture: PastureId; herd: number; reducedMotion: boolean }) {
  const group = useRef<Group>(null);
  const travel = useRef<{ from: Vector3; to: Vector3; start: number } | null>(null);
  const placed = useRef(false);
  const invalidate = useThree((s) => s.invalidate);
  const [x, z] = PASTURE_POSITIONS[pasture];

  useLayoutEffect(() => {
    const g = group.current;
    if (!g) return;
    const target = new Vector3(x, 0, z);
    if (reducedMotion || !placed.current) {
      g.position.copy(target);
      placed.current = true;
      travel.current = null;
    } else if (g.position.distanceTo(target) > 0.01) {
      travel.current = { from: g.position.clone(), to: target, start: performance.now() };
    }
    invalidate();
  }, [x, z, reducedMotion, invalidate]);

  useFrame(() => {
    const t = travel.current;
    const g = group.current;
    if (!t || !g) return;
    const k = Math.min(1, (performance.now() - t.start) / TRAVEL_MS);
    const eased = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    g.position.lerpVectors(t.from, t.to, eased);
    g.position.y = Math.sin(Math.PI * k) * 0.25;
    if (k >= 1) {
      g.position.copy(t.to);
      travel.current = null;
    }
    invalidate();
  });

  return (
    <group ref={group}>
      <Yurt />
      <Herd count={herdMarks(herd)} reducedMotion={reducedMotion} />
    </group>
  );
}

const SNOW_COUNT = 260;

function Snowfall({ reducedMotion }: { reducedMotion: boolean }) {
  const points = useRef<Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(SNOW_COUNT * 3);
    const hash = (n: number) => {
      const v = Math.sin(n * 12.9898) * 43758.5453;
      return v - Math.floor(v);
    };
    for (let i = 0; i < SNOW_COUNT; i += 1) {
      arr[i * 3] = (hash(i + 1) - 0.5) * 30;
      arr[i * 3 + 1] = hash(i + 101) * 9;
      arr[i * 3 + 2] = (hash(i + 201) - 0.5) * 26;
    }
    return arr;
  }, []);

  useFrame((_, delta) => {
    const p = points.current;
    if (!p || reducedMotion) return;
    const attr = p.geometry.attributes.position;
    const step = Math.min(delta, 0.1);
    for (let i = 0; i < SNOW_COUNT; i += 1) {
      let y = attr.getY(i) - step * (0.6 + (i % 5) * 0.12);
      if (y < 0) y += 9;
      attr.setY(i, y);
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#FFFFFF" size={0.09} sizeAttenuation />
    </points>
  );
}

export default function NomadScene3D({ season, pasture, grassPct, herd, harshWinter, reducedMotion, paused, onContextLost }: NomadSceneProps) {
  const lost = useRef(onContextLost);
  // R3F releases the WebGL context shortly after unmount; that planned loss must not count as a failure.
  const mounted = useRef(true);
  useEffect(() => {
    lost.current = onContextLost;
  }, [onContextLost]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const frameloop = paused ? 'never' : reducedMotion ? 'demand' : 'always';

  return (
    <Canvas
      aria-hidden="true"
      dpr={[1, 1.5]}
      frameloop={frameloop}
      camera={{ position: [0, 14.5, 17.5], fov: 42, near: 0.5, far: 90 }}
      gl={{ antialias: true, powerPreference: 'low-power' }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (event) => {
          event.preventDefault();
          if (mounted.current) lost.current();
        });
      }}
    >
      <Background color={SKY_COLORS[season]} />
      <hemisphereLight args={['#FFFFFF', '#7D6F52', 0.95]} />
      <directionalLight position={[6, 12, 5]} intensity={1.15} />
      <Landscape season={season} />
      <RouteMarks />
      {PASTURES.map((id) => (
        <PasturePatch key={id} id={id} pct={grassPct[id]} season={season} harshWinter={harshWinter} active={id === pasture} />
      ))}
      <Camp pasture={pasture} herd={herd} reducedMotion={reducedMotion} />
      {season === 'winter' ? <Snowfall reducedMotion={reducedMotion} /> : null}
      <OrbitControls
        enablePan={false}
        minDistance={11}
        maxDistance={30}
        minPolarAngle={0.45}
        maxPolarAngle={1.15}
        target={[0, 0, 0.8]}
        enableDamping={!reducedMotion}
      />
    </Canvas>
  );
}
