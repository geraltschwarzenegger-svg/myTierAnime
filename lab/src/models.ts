import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { type TierId } from "./data";
export interface Sculpture {
  root: THREE.Group;
  name: string;
  stats: { meshes: number; triangles: number };
  dispose: () => void;
}
const GOLD = 0xe7b95d,
  SILVER = 0xc9d8e9;
function metal(color: number) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.88,
    roughness: 0.24,
    clearcoat: 1,
    clearcoatRoughness: 0.18,
  });
}
function jewel(color: number) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.25,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    emissive: color,
    emissiveIntensity: 0.12,
  });
}
function add(
  parent: THREE.Group,
  g: THREE.BufferGeometry,
  m: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
) {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function tube(
  parent: THREE.Group,
  points: THREE.Vector3[],
  radius: number,
  m: THREE.Material,
) {
  return add(
    parent,
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points),
      40,
      radius,
      6,
      false,
    ),
    m,
  );
}
function petal(length: number, width: number) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(-width, 0.3 * length, -width, 0.75 * length, 0, length);
  s.bezierCurveTo(width, 0.75 * length, width, 0.3 * length, 0, 0);
  return new THREE.ExtrudeGeometry(s, {
    depth: 0.035,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.025,
    bevelThickness: 0.025,
    curveSegments: 10,
  });
}
function bake(group: THREE.Group): THREE.Group {
  group.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && !Array.isArray(o.material)) {
      const geom = o.geometry.index
        ? o.geometry.toNonIndexed()
        : o.geometry.clone();
      geom.applyMatrix4(o.matrixWorld);
      const list = buckets.get(o.material) ?? [];
      list.push(geom);
      buckets.set(o.material, list);
    }
  });
  const result = new THREE.Group();
  result.name = group.name;
  for (const [material, parts] of buckets) {
    const geom = mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    if (!geom) throw new Error("Не удалось собрать геометрию.");
    add(result, geom, material);
  }
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
  return result;
}
export function makeSculpture(tier: TierId): Sculpture {
  const root = new THREE.Group();
  root.name = "ASTRAVA " + tier;
  const gold = metal(GOLD),
    silver = metal(SILVER),
    dark = metal(0x425566),
    ruby = jewel(0xd43564),
    jade = jewel(0x59cda8),
    amethyst = jewel(0x9567db),
    pearl = jewel(0xe9c5d9);
  const shared = [gold, silver, dark, ruby, jade, amethyst, pearl];
  if (tier === "S") {
    const band = add(
      root,
      new THREE.TorusGeometry(0.98, 0.13, 12, 72),
      gold,
      0,
      -0.48,
    );
    band.rotation.x = Math.PI / 2;
    for (const y of [-0.62, -0.37]) {
      const ring = add(
        root,
        new THREE.TorusGeometry(1, 0.035, 8, 72),
        gold,
        0,
        y,
      );
      ring.rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < 9; i++) {
      const a = (i * Math.PI * 2) / 9,
        x = Math.sin(a),
        z = Math.cos(a),
        height = i % 3 === 0 ? 1.35 : 1.05;
      const fin = add(
        root,
        petal(height, 0.24),
        gold,
        x * 0.93,
        -0.4,
        z * 0.93,
      );
      fin.rotation.y = a;
      fin.rotation.x = -0.1;
      const gem = add(
        root,
        new THREE.OctahedronGeometry(0.135, 0),
        ruby,
        x * 1.01,
        0.08,
        z * 1.01,
      );
      gem.scale.set(0.7, 1.4, 0.55);
      gem.rotation.y = a;
      add(
        root,
        new THREE.SphereGeometry(0.055, 10, 8),
        gold,
        x * 0.9,
        -0.4 + height,
        z * 0.9,
      );
    }
    const halo = add(
      root,
      new THREE.TorusGeometry(1.55, 0.028, 8, 96),
      gold,
      0,
      0.14,
      -0.6,
    );
    halo.rotation.x = 0.12;
    for (let i = 0; i < 18; i++) {
      const a = (i * 2 * Math.PI) / 18;
      const ray = add(
        root,
        new THREE.ConeGeometry(0.045, i % 3 === 0 ? 0.4 : 0.23, 4),
        gold,
        Math.sin(a) * 1.73,
        0.14 + Math.cos(a) * 1.73,
        -0.6,
      );
      ray.rotation.z = -a;
    }
    const center = add(
      root,
      new THREE.OctahedronGeometry(0.26, 0),
      ruby,
      0,
      0.17,
      1.03,
    );
    center.scale.set(0.7, 1.4, 0.5);
  } else if (tier === "A") {
    add(
      root,
      new THREE.IcosahedronGeometry(0.38, 1),
      jade,
      0,
      -0.06,
      0.12,
    ).scale.set(0.72, 1.45, 0.7);
    for (const side of [-1, 1]) {
      tube(
        root,
        [
          new THREE.Vector3(0, -0.6, 0),
          new THREE.Vector3(side * 0.8, -0.2, 0),
          new THREE.Vector3(side * 1.35, 0.7, 0),
          new THREE.Vector3(side * 1.1, 1.55, 0),
        ],
        0.045,
        gold,
      );
      for (let i = 0; i < 7; i++) {
        const p = add(
          root,
          petal(0.95 - i * 0.055, 0.14),
          i % 2 === 0 ? jade : gold,
          side * (0.2 + i * 0.16),
          -0.48 + i * 0.13,
          0.03 - i * 0.03,
        );
        p.rotation.z = -side * (0.3 + i * 0.11);
        p.rotation.y = side * 0.2;
      }
    }
    const head = add(
      root,
      new THREE.OctahedronGeometry(0.15),
      gold,
      0,
      0.7,
      0.03,
    );
    head.rotation.z = 0.2;
    tube(
      root,
      [
        new THREE.Vector3(0, -0.4, 0),
        new THREE.Vector3(-0.38, -0.9, 0.1),
        new THREE.Vector3(-0.2, -1.3, 0),
        new THREE.Vector3(0.4, -1.4, 0),
      ],
      0.035,
      gold,
    );
    const ring = add(
      root,
      new THREE.TorusGeometry(1.15, 0.018, 6, 96),
      gold,
      0,
      0.1,
      -0.25,
    );
    ring.scale.set(1, 1.15, 1);
  } else if (tier === "B") {
    add(
      root,
      new THREE.OctahedronGeometry(0.77, 0),
      amethyst,
      0,
      0.05,
      0,
    ).scale.set(0.74, 1.65, 0.74);
    for (const side of [-1, 1]) {
      const spine = add(
        root,
        new THREE.BoxGeometry(0.075, 2.25, 0.12),
        silver,
        side * 0.95,
        0,
        0,
      );
      spine.rotation.z = -side * 0.22;
      for (let i = 0; i < 5; i++) {
        const leaf = add(
          root,
          petal(0.9, 0.18),
          silver,
          side * 0.38,
          -0.85 + i * 0.38,
          -0.12,
        );
        leaf.rotation.z = -side * (1.1 - i * 0.15);
        leaf.rotation.y = side * 0.45;
      }
    }
    for (const y of [-1.35, 1.35])
      add(root, new THREE.OctahedronGeometry(0.12), gold, 0, y, 0);
    const diamond = new THREE.Shape();
    diamond.moveTo(0, 1.6);
    diamond.lineTo(1.2, 0);
    diamond.lineTo(0, -1.6);
    diamond.lineTo(-1.2, 0);
    diamond.closePath();
    const pts = diamond
      .getPoints()
      .map((p) => new THREE.Vector3(p.x, p.y, -0.2));
    tube(root, pts, 0.035, gold);
  } else {
    const moon = add(
      root,
      new THREE.TorusGeometry(1.22, 0.075, 10, 80, Math.PI * 1.65),
      silver,
      0,
      0.05,
      -0.18,
    );
    moon.rotation.z = 0.55;
    add(
      root,
      new THREE.IcosahedronGeometry(0.44, 2),
      pearl,
      0,
      0.15,
      0.05,
    ).scale.set(0.85, 1.15, 0.8);
    for (const side of [-1, 1]) {
      tube(
        root,
        [
          new THREE.Vector3(side * 0.05, -1.3, 0),
          new THREE.Vector3(side * 0.72, -0.85, 0.05),
          new THREE.Vector3(side * 0.93, 0.1, 0),
          new THREE.Vector3(side * 0.64, 0.9, 0),
        ],
        0.035,
        silver,
      );
      for (let j = 0; j < 4; j++) {
        const x = side * (0.65 + Math.sin(j) * 0.2),
          y = -0.85 + j * 0.48;
        for (let i = 0; i < 5; i++) {
          const p = add(root, petal(0.28, 0.13), pearl, x, y, 0.1);
          p.rotation.z = (i * 2 * Math.PI) / 5;
          p.rotation.x = 0.15;
        }
        add(root, new THREE.SphereGeometry(0.055, 8, 6), gold, x, y, 0.16);
        const l = add(root, petal(0.35, 0.1), silver, x, y - 0.1, -0.03);
        l.rotation.z = side * 1.3;
      }
    }
  }
  const merged = bake(root);
  const box = new THREE.Box3().setFromObject(merged),
    center = box.getCenter(new THREE.Vector3());
  merged.children.forEach((o) => o.position.sub(center));
  const used = new Set<THREE.Material>();
  let triangles = 0;
  merged.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      used.add(o.material);
      triangles +=
        (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    }
  });
  shared.filter((m) => !used.has(m)).forEach((m) => m.dispose());
  const names = {
    S: "Солнечный венец",
    A: "Нефритовый феникс",
    B: "Аметистовый архив",
    C: "Лунный гербарий",
  };
  return {
    root: merged,
    name: names[tier],
    stats: { meshes: merged.children.length, triangles },
    dispose: () => disposeObject(merged),
  };
}
export function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(m);
        for (const value of Object.values(m))
          if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
  root.removeFromParent();
}
