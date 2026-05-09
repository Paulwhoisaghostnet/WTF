import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GUINEA_PIG_RACEWAY_ASSET_ROOT,
  GUINEA_PIG_RACEWAY_REQUIRED_ANIMATIONS,
} from "../server/features/casino/games/guinea-pig-raceway/assets";
import {
  GUINEA_PIG_RACEWAY_RULES,
  type RacewayStats,
} from "../server/features/casino/games/guinea-pig-raceway/rules";

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];
type Rgba = [number, number, number, number];

type MeshData = {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
};

type RacerProfile = {
  id: string;
  personality: string;
  idleLoop: string;
  startMood: string;
  winMood: string;
  lossMood: string;
  bodyColor: Rgba;
  patchColor: Rgba;
  accentColor: Rgba;
  earColor: Rgba;
  pawColor: Rgba;
  noseColor: Rgba;
  eyeColor: Rgba;
  bodyScale: Vec3;
  headScale: Vec3;
  idleDuration: number;
  sprintCadence: number;
  twitchAmp: number;
  victoryHop: number;
  lossDroop: number;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const assetRoot = path.join(repoRoot, "public", GUINEA_PIG_RACEWAY_ASSET_ROOT);
const modelDir = path.join(assetRoot, "models", "racers");
const thumbnailDir = path.join(assetRoot, "thumbnails");
const trackDir = path.join(assetRoot, "tracks");

const ACCESSOR_COMPONENT_TYPE = {
  FLOAT: 5126,
  UNSIGNED_SHORT: 5123,
} as const;

const ACCESSOR_TYPE_COMPONENTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
};

const profiles: Record<string, Omit<RacerProfile, "id">> = {
  "miso-missile": {
    personality: "Impatient gate-snapper who keeps checking the rail for a launch lane.",
    idleLoop: "rapid nose twitch, paw taps, and a tiny forward lean",
    startMood: "crouches early and rocks twice before the bell",
    winMood: "does two punchy hops and stares down the finish camera",
    lossMood: "sits tall for a beat, then gives a single annoyed ear flick",
    bodyColor: [0.74, 0.42, 0.21, 1],
    patchColor: [0.18, 0.11, 0.08, 1],
    accentColor: [0.92, 0.7, 0.42, 1],
    earColor: [0.86, 0.48, 0.4, 1],
    pawColor: [0.62, 0.34, 0.22, 1],
    noseColor: [0.17, 0.08, 0.07, 1],
    eyeColor: [0.02, 0.018, 0.014, 1],
    bodyScale: [1.06, 0.42, 0.39],
    headScale: [0.35, 0.3, 0.3],
    idleDuration: 2.1,
    sprintCadence: 0.48,
    twitchAmp: 1.2,
    victoryHop: 1.18,
    lossDroop: 0.72,
  },
  "pickle-jet": {
    personality: "Calm rail technician who saves energy and makes late, clean passes.",
    idleLoop: "slow breathing, smooth head scan, and a measured blink",
    startMood: "sets paws perfectly square and waits without wasting motion",
    winMood: "glides into a proud slow turn with one polished paw lift",
    lossMood: "looks at the scoreboard, exhales, and resets into training mode",
    bodyColor: [0.66, 0.68, 0.67, 1],
    patchColor: [0.22, 0.25, 0.25, 1],
    accentColor: [0.86, 0.91, 0.88, 1],
    earColor: [0.74, 0.58, 0.58, 1],
    pawColor: [0.52, 0.52, 0.5, 1],
    noseColor: [0.1, 0.08, 0.08, 1],
    eyeColor: [0.02, 0.02, 0.018, 1],
    bodyScale: [1.02, 0.43, 0.41],
    headScale: [0.34, 0.29, 0.29],
    idleDuration: 3.2,
    sprintCadence: 0.58,
    twitchAmp: 0.72,
    victoryHop: 0.82,
    lossDroop: 0.62,
  },
  "button-biscuit": {
    personality: "Stubborn distance grinder who looks sleepy until the track gets ugly.",
    idleLoop: "soft loaf posture, slow sniff, and a stubborn cheek puff",
    startMood: "takes a low heavy stance and blinks at the noise",
    winMood: "does a tiny satisfied nibble before acknowledging anyone",
    lossMood: "turns away from the camera and resumes calm chewing",
    bodyColor: [0.92, 0.89, 0.79, 1],
    patchColor: [0.05, 0.05, 0.045, 1],
    accentColor: [0.98, 0.96, 0.88, 1],
    earColor: [0.82, 0.55, 0.53, 1],
    pawColor: [0.82, 0.78, 0.65, 1],
    noseColor: [0.18, 0.1, 0.1, 1],
    eyeColor: [0.02, 0.02, 0.02, 1],
    bodyScale: [1.12, 0.46, 0.43],
    headScale: [0.38, 0.31, 0.31],
    idleDuration: 3.6,
    sprintCadence: 0.64,
    twitchAmp: 0.54,
    victoryHop: 0.66,
    lossDroop: 0.58,
  },
  "waffle-thunder": {
    personality: "Big-hearted traffic diver who races like every lane owes them money.",
    idleLoop: "shoulder shimmy, bold chest lift, and side-to-side courage check",
    startMood: "leans toward the nearest rival and paws at the lane divider",
    winMood: "launches into a rowdy double bounce with a head toss",
    lossMood: "plants both front paws and gives the winner a theatrical glare",
    bodyColor: [0.88, 0.63, 0.22, 1],
    patchColor: [0.46, 0.26, 0.1, 1],
    accentColor: [1, 0.82, 0.42, 1],
    earColor: [0.92, 0.58, 0.46, 1],
    pawColor: [0.73, 0.45, 0.2, 1],
    noseColor: [0.15, 0.08, 0.05, 1],
    eyeColor: [0.025, 0.02, 0.015, 1],
    bodyScale: [1.09, 0.45, 0.42],
    headScale: [0.37, 0.31, 0.3],
    idleDuration: 2.4,
    sprintCadence: 0.44,
    twitchAmp: 1.05,
    victoryHop: 1.35,
    lossDroop: 0.8,
  },
  "nori-nova": {
    personality: "Quiet tactician who watches every tunnel shadow before committing.",
    idleLoop: "slow head tilt, whisker map-read, and patient ear pivots",
    startMood: "sets up slightly back from the line and studies the field",
    winMood: "takes a reserved bow and then finally lets the ears celebrate",
    lossMood: "freezes in analysis mode, then calmly walks back to lane tape",
    bodyColor: [0.18, 0.18, 0.2, 1],
    patchColor: [0.04, 0.05, 0.06, 1],
    accentColor: [0.42, 0.45, 0.49, 1],
    earColor: [0.56, 0.42, 0.46, 1],
    pawColor: [0.22, 0.22, 0.24, 1],
    noseColor: [0.08, 0.06, 0.07, 1],
    eyeColor: [0.015, 0.016, 0.02, 1],
    bodyScale: [1.0, 0.41, 0.39],
    headScale: [0.33, 0.29, 0.28],
    idleDuration: 3.8,
    sprintCadence: 0.56,
    twitchAmp: 0.68,
    victoryHop: 0.78,
    lossDroop: 0.56,
  },
  "hazel-havoc": {
    personality: "Fearless long-haired chaos racer who can turn a bad break into a miracle.",
    idleLoop: "hairy shoulder shake, sudden half-hop, and suspicious snack search",
    startMood: "almost false-starts, catches themself, then grins through the gate",
    winMood: "erupts into a scruffy victory spiral",
    lossMood: "flops dramatically for one breath, then pops right back up",
    bodyColor: [0.53, 0.31, 0.16, 1],
    patchColor: [0.22, 0.12, 0.07, 1],
    accentColor: [0.72, 0.5, 0.28, 1],
    earColor: [0.74, 0.43, 0.38, 1],
    pawColor: [0.48, 0.25, 0.13, 1],
    noseColor: [0.12, 0.06, 0.05, 1],
    eyeColor: [0.02, 0.014, 0.01, 1],
    bodyScale: [1.15, 0.47, 0.44],
    headScale: [0.39, 0.32, 0.31],
    idleDuration: 2.0,
    sprintCadence: 0.42,
    twitchAmp: 1.32,
    victoryHop: 1.45,
    lossDroop: 0.92,
  },
  "mochi-moon": {
    personality: "Dreamy outside-lane cruiser who wakes up when the surface gets slick.",
    idleLoop: "sleepy sway, slow blink, and moon-calm nose lift",
    startMood: "arrives last to the marks but lands perfectly balanced",
    winMood: "floats through a gentle victory sway like it was obvious",
    lossMood: "does a sleepy shrug and asks for another lap",
    bodyColor: [0.92, 0.84, 0.66, 1],
    patchColor: [0.78, 0.65, 0.48, 1],
    accentColor: [1, 0.94, 0.78, 1],
    earColor: [0.9, 0.62, 0.58, 1],
    pawColor: [0.78, 0.67, 0.52, 1],
    noseColor: [0.2, 0.12, 0.11, 1],
    eyeColor: [0.025, 0.02, 0.016, 1],
    bodyScale: [1.08, 0.44, 0.42],
    headScale: [0.36, 0.3, 0.3],
    idleDuration: 4.1,
    sprintCadence: 0.66,
    twitchAmp: 0.48,
    victoryHop: 0.62,
    lossDroop: 0.5,
  },
  "kimchi-comet": {
    personality: "Straight-line rocket who believes brakes are someone else's problem.",
    idleLoop: "fast shoulder pulse, forward stare, and impatient ear snaps",
    startMood: "locks onto the finish line and ignores everything else",
    winMood: "skids into a sharp turn and poses like a poster",
    lossMood: "keeps sprinting two extra steps before realizing the race is over",
    bodyColor: [0.76, 0.22, 0.13, 1],
    patchColor: [0.98, 0.74, 0.55, 1],
    accentColor: [0.42, 0.08, 0.05, 1],
    earColor: [0.9, 0.43, 0.34, 1],
    pawColor: [0.62, 0.16, 0.1, 1],
    noseColor: [0.11, 0.05, 0.05, 1],
    eyeColor: [0.02, 0.014, 0.012, 1],
    bodyScale: [1.03, 0.4, 0.38],
    headScale: [0.33, 0.28, 0.28],
    idleDuration: 1.9,
    sprintCadence: 0.36,
    twitchAmp: 1.42,
    victoryHop: 1.22,
    lossDroop: 0.74,
  },
};

function createSphereMesh(latSegments = 10, lonSegments = 18): MeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let lat = 0; lat <= latSegments; lat += 1) {
    const v = lat / latSegments;
    const theta = v * Math.PI;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    for (let lon = 0; lon <= lonSegments; lon += 1) {
      const u = lon / lonSegments;
      const phi = u * Math.PI * 2;
      const x = Math.cos(phi) * sinTheta;
      const y = cosTheta;
      const z = Math.sin(phi) * sinTheta;
      positions.push(x, y, z);
      normals.push(x, y, z);
      uvs.push(u, 1 - v);
    }
  }
  for (let lat = 0; lat < latSegments; lat += 1) {
    for (let lon = 0; lon < lonSegments; lon += 1) {
      const a = lat * (lonSegments + 1) + lon;
      const b = a + lonSegments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions, normals, uvs, indices };
}

function createCylinderMesh(segments = 8): MeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let side = 0; side <= 1; side += 1) {
    const x = side - 0.5;
    for (let index = 0; index <= segments; index += 1) {
      const u = index / segments;
      const theta = u * Math.PI * 2;
      const y = Math.cos(theta);
      const z = Math.sin(theta);
      positions.push(x, y, z);
      normals.push(0, y, z);
      uvs.push(side, u);
    }
  }
  for (let index = 0; index < segments; index += 1) {
    const a = index;
    const b = index + segments + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return { positions, normals, uvs, indices };
}

function createCuboidMesh(): MeshData {
  const p = [
    [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5],
    [0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5],
    [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5],
    [0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5],
    [-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5],
  ];
  const n = [
    [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0],
  ];
  const positions = p.flat();
  const normals = n.flatMap((normal) => Array.from({ length: 4 }, () => normal).flat());
  const uvs = Array.from({ length: 6 }, () => [0, 0, 1, 0, 1, 1, 0, 1]).flat();
  const indices = Array.from({ length: 6 }, (_, face) => {
    const base = face * 4;
    return [base, base + 1, base + 2, base, base + 2, base + 3];
  }).flat();
  return { positions, normals, uvs, indices };
}

function eulerToQuat(x: number, y: number, z: number): Quat {
  const cx = Math.cos(x / 2);
  const sx = Math.sin(x / 2);
  const cy = Math.cos(y / 2);
  const sy = Math.sin(y / 2);
  const cz = Math.cos(z / 2);
  const sz = Math.sin(z / 2);
  return [
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ];
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function pad4(buffer: Buffer, padByte: number): Buffer {
  const padding = (4 - (buffer.length % 4)) % 4;
  return padding ? Buffer.concat([buffer, Buffer.alloc(padding, padByte)]) : buffer;
}

function minMax(values: number[], components: number): { min: number[]; max: number[] } {
  const min = Array.from({ length: components }, () => Number.POSITIVE_INFINITY);
  const max = Array.from({ length: components }, () => Number.NEGATIVE_INFINITY);
  for (let index = 0; index < values.length; index += components) {
    for (let component = 0; component < components; component += 1) {
      const value = values[index + component];
      min[component] = Math.min(min[component], value);
      max[component] = Math.max(max[component], value);
    }
  }
  return { min, max };
}

class GlbBuilder {
  private chunks: Buffer[] = [];
  private byteLength = 0;
  readonly bufferViews: Record<string, unknown>[] = [];
  readonly accessors: Record<string, unknown>[] = [];
  readonly materials: Record<string, unknown>[] = [];
  readonly meshes: Record<string, unknown>[] = [];
  readonly nodes: Record<string, unknown>[] = [];
  readonly animations: Record<string, unknown>[] = [];

  addMaterial(name: string, color: Rgba, roughness = 0.88): number {
    const index = this.materials.length;
    this.materials.push({
      name,
      pbrMetallicRoughness: {
        baseColorFactor: color,
        metallicFactor: 0,
        roughnessFactor: roughness,
      },
    });
    return index;
  }

  addAccessor(values: number[], componentType: number, type: string, target?: number): number {
    const components = ACCESSOR_TYPE_COMPONENTS[type];
    const typed =
      componentType === ACCESSOR_COMPONENT_TYPE.UNSIGNED_SHORT
        ? new Uint16Array(values)
        : new Float32Array(values);
    const raw = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const alignedOffset = this.byteLength + ((4 - (this.byteLength % 4)) % 4);
    if (alignedOffset > this.byteLength) {
      this.chunks.push(Buffer.alloc(alignedOffset - this.byteLength));
      this.byteLength = alignedOffset;
    }
    const bufferView = this.bufferViews.length;
    this.bufferViews.push({
      buffer: 0,
      byteOffset: this.byteLength,
      byteLength: raw.length,
      ...(target ? { target } : {}),
    });
    this.chunks.push(raw);
    this.byteLength += raw.length;
    const accessor = this.accessors.length;
    const numericValues = Array.from(typed as Float32Array | Uint16Array);
    const bounds = type === "SCALAR" || type === "VEC3" ? minMax(numericValues, components) : null;
    this.accessors.push({
      bufferView,
      componentType,
      count: typed.length / components,
      type,
      ...(bounds ? { min: bounds.min, max: bounds.max } : {}),
    });
    return accessor;
  }

  addMesh(name: string, data: MeshData, material: number): number {
    const position = this.addAccessor(data.positions, ACCESSOR_COMPONENT_TYPE.FLOAT, "VEC3", 34962);
    const normal = this.addAccessor(data.normals, ACCESSOR_COMPONENT_TYPE.FLOAT, "VEC3", 34962);
    const uv = this.addAccessor(data.uvs, ACCESSOR_COMPONENT_TYPE.FLOAT, "VEC2", 34962);
    const indices = this.addAccessor(
      data.indices,
      ACCESSOR_COMPONENT_TYPE.UNSIGNED_SHORT,
      "SCALAR",
      34963
    );
    const index = this.meshes.length;
    this.meshes.push({
      name,
      primitives: [
        {
          attributes: {
            POSITION: position,
            NORMAL: normal,
            TEXCOORD_0: uv,
          },
          indices,
          material,
        },
      ],
    });
    return index;
  }

  addNode(node: Record<string, unknown>): number {
    const index = this.nodes.length;
    this.nodes.push(node);
    return index;
  }

  addAnimation(name: string, channels: Array<{
    node: number;
    path: "translation" | "rotation" | "scale";
    times: number[];
    values: number[];
    type: "VEC3" | "VEC4";
  }>): void {
    const samplers: Record<string, unknown>[] = [];
    const animationChannels: Record<string, unknown>[] = [];
    for (const channel of channels) {
      const input = this.addAccessor(channel.times, ACCESSOR_COMPONENT_TYPE.FLOAT, "SCALAR");
      const output = this.addAccessor(channel.values, ACCESSOR_COMPONENT_TYPE.FLOAT, channel.type);
      const sampler = samplers.length;
      samplers.push({ input, output, interpolation: "LINEAR" });
      animationChannels.push({
        sampler,
        target: { node: channel.node, path: channel.path },
      });
    }
    this.animations.push({ name, samplers, channels: animationChannels });
  }

  toGlb(sceneNode: number, extras: Record<string, unknown>): Buffer {
    const bin = pad4(Buffer.concat(this.chunks), 0);
    const gltf = {
      asset: {
        version: "2.0",
        generator: "WTF Guinea Pig Raceway procedural asset generator",
      },
      scene: 0,
      scenes: [{ nodes: [sceneNode] }],
      nodes: this.nodes,
      meshes: this.meshes,
      materials: this.materials,
      bufferViews: this.bufferViews,
      accessors: this.accessors,
      animations: this.animations,
      buffers: [{ byteLength: bin.length }],
      extras,
    };
    const json = pad4(Buffer.from(JSON.stringify(gltf)), 0x20);
    const totalLength = 12 + 8 + json.length + 8 + bin.length;
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(totalLength, 8);
    const jsonHeader = Buffer.alloc(8);
    jsonHeader.writeUInt32LE(json.length, 0);
    jsonHeader.writeUInt32LE(0x4e4f534a, 4);
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(bin.length, 0);
    binHeader.writeUInt32LE(0x004e4942, 4);
    return Buffer.concat([header, jsonHeader, json, binHeader, bin]);
  }
}

function times(duration: number): number[] {
  return [0, duration * 0.25, duration * 0.5, duration * 0.75, duration];
}

function vec3Keys(values: Vec3[]): number[] {
  return values.flat();
}

function quatKeys(values: Quat[]): number[] {
  return values.flat();
}

function createRacerGlb(racer: (typeof GUINEA_PIG_RACEWAY_RULES.defaultRacerStable)[number], profile: RacerProfile): {
  buffer: Buffer;
  triangleCount: number;
  nodeNames: string[];
  animations: Array<{ name: string; durationSeconds: number; personalityNote: string }>;
} {
  const builder = new GlbBuilder();
  const bodyMat = builder.addMaterial("fur_body", profile.bodyColor);
  const patchMat = builder.addMaterial("fur_patch", profile.patchColor);
  const accentMat = builder.addMaterial("fur_accent", profile.accentColor);
  const earMat = builder.addMaterial("ear_skin", profile.earColor);
  const pawMat = builder.addMaterial("paw_fur", profile.pawColor);
  const noseMat = builder.addMaterial("nose", profile.noseColor);
  const eyeMat = builder.addMaterial("wet_eye", profile.eyeColor, 0.45);
  const whiskerMat = builder.addMaterial("whiskers", [0.96, 0.9, 0.78, 1], 0.62);

  const sphere = createSphereMesh();
  const cylinder = createCylinderMesh();
  const cuboid = createCuboidMesh();
  const sphereTriangles = sphere.indices.length / 3;
  const cylinderTriangles = cylinder.indices.length / 3;
  const cuboidTriangles = cuboid.indices.length / 3;

  const bodyMesh = builder.addMesh("soft_ellipsoid_body", sphere, bodyMat);
  const headMesh = builder.addMesh("rounded_head", sphere, bodyMat);
  const patchMesh = builder.addMesh("coat_patch", sphere, patchMat);
  const accentMesh = builder.addMesh("crest_accent", sphere, accentMat);
  const earMesh = builder.addMesh("soft_round_ear", sphere, earMat);
  const pawMesh = builder.addMesh("small_paw", sphere, pawMat);
  const eyeMesh = builder.addMesh("gloss_eye", sphere, eyeMat);
  const noseMesh = builder.addMesh("nose_button", sphere, noseMat);
  const whiskerMesh = builder.addMesh("whisker", cylinder, whiskerMat);
  const hairMesh = builder.addMesh("long_fur_tuft", cuboid, accentMat);

  const body = builder.addNode({
    name: "body",
    mesh: bodyMesh,
    translation: [0, 0.45, 0],
    scale: profile.bodyScale,
    extras: { role: "breathing_body" },
  });
  const head = builder.addNode({
    name: "head",
    mesh: headMesh,
    translation: [0.9, 0.56, 0],
    scale: profile.headScale,
    extras: { role: "expression_driver" },
  });
  const leftEar = builder.addNode({
    name: "left_ear",
    mesh: earMesh,
    translation: [0.78, 0.83, 0.2],
    rotation: eulerToQuat(0.18, 0.2, 0.35),
    scale: [0.1, 0.035, 0.14],
  });
  const rightEar = builder.addNode({
    name: "right_ear",
    mesh: earMesh,
    translation: [0.78, 0.83, -0.2],
    rotation: eulerToQuat(0.18, -0.2, -0.35),
    scale: [0.1, 0.035, 0.14],
  });
  const leftEye = builder.addNode({
    name: "left_eye",
    mesh: eyeMesh,
    translation: [1.18, 0.63, 0.13],
    scale: [0.035, 0.035, 0.035],
  });
  const rightEye = builder.addNode({
    name: "right_eye",
    mesh: eyeMesh,
    translation: [1.18, 0.63, -0.13],
    scale: [0.035, 0.035, 0.035],
  });
  const nose = builder.addNode({
    name: "nose",
    mesh: noseMesh,
    translation: [1.27, 0.52, 0],
    scale: [0.055, 0.04, 0.045],
  });
  const frontLeftPaw = builder.addNode({
    name: "front_left_paw",
    mesh: pawMesh,
    translation: [0.54, 0.1, 0.22],
    scale: [0.13, 0.07, 0.08],
  });
  const frontRightPaw = builder.addNode({
    name: "front_right_paw",
    mesh: pawMesh,
    translation: [0.54, 0.1, -0.22],
    scale: [0.13, 0.07, 0.08],
  });
  const backLeftPaw = builder.addNode({
    name: "back_left_paw",
    mesh: pawMesh,
    translation: [-0.52, 0.1, 0.23],
    scale: [0.16, 0.08, 0.09],
  });
  const backRightPaw = builder.addNode({
    name: "back_right_paw",
    mesh: pawMesh,
    translation: [-0.52, 0.1, -0.23],
    scale: [0.16, 0.08, 0.09],
  });
  const patchA = builder.addNode({
    name: "coat_patch_left_flank",
    mesh: patchMesh,
    translation: [-0.14, 0.64, 0.3],
    rotation: eulerToQuat(0.1, 0.15, -0.08),
    scale: [0.38, 0.18, 0.04],
  });
  const patchB = builder.addNode({
    name: "coat_patch_right_hip",
    mesh: patchMesh,
    translation: [-0.5, 0.48, -0.31],
    rotation: eulerToQuat(-0.12, -0.2, 0.05),
    scale: [0.3, 0.15, 0.035],
  });
  const crest = builder.addNode({
    name: "personality_crest",
    mesh: accentMesh,
    translation: [0.62, 0.9, 0],
    scale: [0.2, 0.055, 0.11],
  });
  const hairTuft = builder.addNode({
    name: "long_fur_tuft",
    mesh: hairMesh,
    translation: [-0.18, 0.9, 0],
    rotation: eulerToQuat(0.1, 0, 0.18),
    scale: [0.34, 0.04, 0.02],
  });

  const whiskers = [-0.13, 0, 0.13].flatMap((z, index) => [
    builder.addNode({
      name: `left_whisker_${index + 1}`,
      mesh: whiskerMesh,
      translation: [1.29, 0.52 + index * 0.015, 0.05 + z],
      rotation: eulerToQuat(0, 0.55 + index * 0.07, 0.08 - index * 0.04),
      scale: [0.42, 0.006, 0.006],
    }),
    builder.addNode({
      name: `right_whisker_${index + 1}`,
      mesh: whiskerMesh,
      translation: [1.29, 0.52 + index * 0.015, -0.05 - z],
      rotation: eulerToQuat(0, -0.55 - index * 0.07, -0.08 + index * 0.04),
      scale: [0.42, 0.006, 0.006],
    }),
  ]);

  const root = builder.addNode({
    name: "root",
    children: [
      body,
      head,
      leftEar,
      rightEar,
      leftEye,
      rightEye,
      nose,
      frontLeftPaw,
      frontRightPaw,
      backLeftPaw,
      backRightPaw,
      patchA,
      patchB,
      crest,
      hairTuft,
      ...whiskers,
    ],
    extras: {
      racerId: racer.id,
      displayName: racer.displayName,
      personality: profile.personality,
      idleLoop: profile.idleLoop,
    },
  });

  const idleTimes = times(profile.idleDuration);
  const idleAmp = profile.twitchAmp;
  builder.addAnimation("idle", [
    {
      node: body,
      path: "scale",
      times: idleTimes,
      values: vec3Keys([
        profile.bodyScale,
        [profile.bodyScale[0] * 1.01, profile.bodyScale[1] * 1.035, profile.bodyScale[2] * 0.99],
        profile.bodyScale,
        [profile.bodyScale[0] * 0.995, profile.bodyScale[1] * 1.02, profile.bodyScale[2] * 1.01],
        profile.bodyScale,
      ]),
      type: "VEC3",
    },
    {
      node: head,
      path: "rotation",
      times: idleTimes,
      values: quatKeys([
        eulerToQuat(0, 0, 0),
        eulerToQuat(0.06 * idleAmp, 0.12 * idleAmp, 0.08 * idleAmp),
        eulerToQuat(0, -0.08 * idleAmp, -0.04 * idleAmp),
        eulerToQuat(-0.04 * idleAmp, 0.04 * idleAmp, 0.05 * idleAmp),
        eulerToQuat(0, 0, 0),
      ]),
      type: "VEC4",
    },
    {
      node: nose,
      path: "scale",
      times: idleTimes,
      values: vec3Keys([
        [0.055, 0.04, 0.045],
        [0.061 * idleAmp, 0.038, 0.044],
        [0.052, 0.044 * idleAmp, 0.046],
        [0.06, 0.039, 0.044],
        [0.055, 0.04, 0.045],
      ]),
      type: "VEC3",
    },
    {
      node: leftEar,
      path: "rotation",
      times: idleTimes,
      values: quatKeys([
        eulerToQuat(0.18, 0.2, 0.35),
        eulerToQuat(0.28 * idleAmp, 0.1, 0.48),
        eulerToQuat(0.18, 0.2, 0.35),
        eulerToQuat(0.12, 0.28, 0.24),
        eulerToQuat(0.18, 0.2, 0.35),
      ]),
      type: "VEC4",
    },
    {
      node: rightEar,
      path: "rotation",
      times: idleTimes,
      values: quatKeys([
        eulerToQuat(0.18, -0.2, -0.35),
        eulerToQuat(0.14, -0.28, -0.25),
        eulerToQuat(0.3 * idleAmp, -0.12, -0.48),
        eulerToQuat(0.18, -0.2, -0.35),
        eulerToQuat(0.18, -0.2, -0.35),
      ]),
      type: "VEC4",
    },
  ]);

  builder.addAnimation("take_marks", [
    {
      node: body,
      path: "translation",
      times: times(1.75),
      values: vec3Keys([
        [0, 0.45, 0],
        [0.02, 0.4, 0],
        [0.08, 0.35, 0],
        [0.05, 0.37, 0],
        [0.12, 0.34, 0],
      ]),
      type: "VEC3",
    },
    {
      node: head,
      path: "rotation",
      times: times(1.75),
      values: quatKeys([
        eulerToQuat(0, 0, 0),
        eulerToQuat(-0.12, 0, 0),
        eulerToQuat(-0.22, 0.04 * idleAmp, 0),
        eulerToQuat(-0.18, -0.03 * idleAmp, 0),
        eulerToQuat(-0.25, 0, 0),
      ]),
      type: "VEC4",
    },
  ]);

  const sprintDuration = profile.sprintCadence * 4;
  builder.addAnimation("sprint", [
    {
      node: body,
      path: "translation",
      times: times(sprintDuration),
      values: vec3Keys([
        [0, 0.45, 0],
        [0.04, 0.51, 0],
        [0, 0.44, 0],
        [-0.03, 0.5, 0],
        [0, 0.45, 0],
      ]),
      type: "VEC3",
    },
    {
      node: frontLeftPaw,
      path: "translation",
      times: times(sprintDuration),
      values: vec3Keys([
        [0.54, 0.1, 0.22],
        [0.68, 0.14, 0.22],
        [0.45, 0.08, 0.22],
        [0.5, 0.11, 0.22],
        [0.54, 0.1, 0.22],
      ]),
      type: "VEC3",
    },
    {
      node: frontRightPaw,
      path: "translation",
      times: times(sprintDuration),
      values: vec3Keys([
        [0.54, 0.1, -0.22],
        [0.42, 0.08, -0.22],
        [0.69, 0.14, -0.22],
        [0.48, 0.11, -0.22],
        [0.54, 0.1, -0.22],
      ]),
      type: "VEC3",
    },
    {
      node: backLeftPaw,
      path: "translation",
      times: times(sprintDuration),
      values: vec3Keys([
        [-0.52, 0.1, 0.23],
        [-0.65, 0.08, 0.23],
        [-0.43, 0.14, 0.23],
        [-0.55, 0.09, 0.23],
        [-0.52, 0.1, 0.23],
      ]),
      type: "VEC3",
    },
    {
      node: backRightPaw,
      path: "translation",
      times: times(sprintDuration),
      values: vec3Keys([
        [-0.52, 0.1, -0.23],
        [-0.42, 0.14, -0.23],
        [-0.65, 0.08, -0.23],
        [-0.5, 0.1, -0.23],
        [-0.52, 0.1, -0.23],
      ]),
      type: "VEC3",
    },
  ]);

  builder.addAnimation("stumble", [
    {
      node: body,
      path: "rotation",
      times: times(1.1),
      values: quatKeys([
        eulerToQuat(0, 0, 0),
        eulerToQuat(0.08, 0.05, 0.18),
        eulerToQuat(-0.04, -0.04, -0.22),
        eulerToQuat(0.02, 0.02, 0.08),
        eulerToQuat(0, 0, 0),
      ]),
      type: "VEC4",
    },
    {
      node: head,
      path: "translation",
      times: times(1.1),
      values: vec3Keys([
        [0.9, 0.56, 0],
        [0.96, 0.5, 0.04],
        [0.82, 0.48, -0.05],
        [0.9, 0.55, 0.02],
        [0.9, 0.56, 0],
      ]),
      type: "VEC3",
    },
  ]);

  builder.addAnimation("nibble", [
    {
      node: head,
      path: "rotation",
      times: times(1.8),
      values: quatKeys([
        eulerToQuat(0, 0, 0),
        eulerToQuat(-0.42, 0.08, 0),
        eulerToQuat(-0.36, -0.04, 0.02),
        eulerToQuat(-0.44, 0.02, -0.02),
        eulerToQuat(0, 0, 0),
      ]),
      type: "VEC4",
    },
    {
      node: nose,
      path: "translation",
      times: times(1.8),
      values: vec3Keys([
        [1.27, 0.52, 0],
        [1.29, 0.47, 0],
        [1.26, 0.48, 0],
        [1.29, 0.46, 0],
        [1.27, 0.52, 0],
      ]),
      type: "VEC3",
    },
  ]);

  builder.addAnimation("cheer", [
    {
      node: body,
      path: "translation",
      times: times(1.55),
      values: vec3Keys([
        [0, 0.45, 0],
        [0, 0.58 * profile.victoryHop, 0],
        [0, 0.44, 0],
        [0, 0.54 * profile.victoryHop, 0],
        [0, 0.45, 0],
      ]),
      type: "VEC3",
    },
    {
      node: frontLeftPaw,
      path: "translation",
      times: times(1.55),
      values: vec3Keys([
        [0.54, 0.1, 0.22],
        [0.7, 0.34, 0.24],
        [0.54, 0.1, 0.22],
        [0.66, 0.3, 0.24],
        [0.54, 0.1, 0.22],
      ]),
      type: "VEC3",
    },
    {
      node: frontRightPaw,
      path: "translation",
      times: times(1.55),
      values: vec3Keys([
        [0.54, 0.1, -0.22],
        [0.68, 0.31, -0.24],
        [0.54, 0.1, -0.22],
        [0.7, 0.35, -0.24],
        [0.54, 0.1, -0.22],
      ]),
      type: "VEC3",
    },
  ]);

  builder.addAnimation("victory", [
    {
      node: body,
      path: "translation",
      times: times(2.2),
      values: vec3Keys([
        [0, 0.45, 0],
        [0.08, 0.62 * profile.victoryHop, 0.04],
        [0.0, 0.48, -0.04],
        [-0.06, 0.58 * profile.victoryHop, 0.02],
        [0, 0.45, 0],
      ]),
      type: "VEC3",
    },
    {
      node: head,
      path: "rotation",
      times: times(2.2),
      values: quatKeys([
        eulerToQuat(0, 0, 0),
        eulerToQuat(-0.12, 0.32 * idleAmp, 0.18),
        eulerToQuat(0.14, -0.25 * idleAmp, -0.12),
        eulerToQuat(-0.06, 0.18, 0.22),
        eulerToQuat(0, 0, 0),
      ]),
      type: "VEC4",
    },
  ]);

  builder.addAnimation("loss", [
    {
      node: body,
      path: "translation",
      times: times(2.35),
      values: vec3Keys([
        [0, 0.45, 0],
        [0, 0.4 * profile.lossDroop, 0],
        [0.02, 0.38 * profile.lossDroop, 0],
        [0, 0.42, 0],
        [0, 0.45, 0],
      ]),
      type: "VEC3",
    },
    {
      node: head,
      path: "rotation",
      times: times(2.35),
      values: quatKeys([
        eulerToQuat(0, 0, 0),
        eulerToQuat(0.36 * profile.lossDroop, -0.08, -0.04),
        eulerToQuat(0.44 * profile.lossDroop, 0.08, 0.02),
        eulerToQuat(0.2, 0, 0),
        eulerToQuat(0, 0, 0),
      ]),
      type: "VEC4",
    },
  ]);

  const animations = [
    { name: "idle", durationSeconds: profile.idleDuration, personalityNote: profile.idleLoop },
    { name: "take_marks", durationSeconds: 1.75, personalityNote: profile.startMood },
    { name: "sprint", durationSeconds: sprintDuration, personalityNote: `Cadence ${profile.sprintCadence.toFixed(2)} seconds per stride loop.` },
    { name: "stumble", durationSeconds: 1.1, personalityNote: "Brief recoverable race interruption." },
    { name: "nibble", durationSeconds: 1.8, personalityNote: "Snack-check loop for staging and replay cutaways." },
    { name: "cheer", durationSeconds: 1.55, personalityNote: "Crowd-response loop." },
    { name: "victory", durationSeconds: 2.2, personalityNote: profile.winMood },
    { name: "loss", durationSeconds: 2.35, personalityNote: profile.lossMood },
  ];

  const triangleCount =
    sphereTriangles * 15 + cylinderTriangles * whiskers.length + cuboidTriangles;
  return {
    buffer: builder.toGlb(root, {
      racerId: racer.id,
      displayName: racer.displayName,
      modelVariant: racer.modelVariant,
      coat: racer.coat,
      laneStyle: racer.laneStyle,
      scoutingReport: racer.scoutingReport,
      personality: profile.personality,
      animationSet: animations,
      stats: racer.stats,
    }),
    triangleCount,
    nodeNames: builder.nodes.map((node) => String(node.name)),
    animations,
  };
}

function makeProfile(racer: (typeof GUINEA_PIG_RACEWAY_RULES.defaultRacerStable)[number]): RacerProfile {
  const profile = profiles[racer.id];
  if (!profile) throw new Error(`Missing profile for ${racer.id}`);
  return { id: racer.id, ...profile };
}

function createThumbnailSvg(
  racer: (typeof GUINEA_PIG_RACEWAY_RULES.defaultRacerStable)[number],
  profile: RacerProfile
): string {
  const body = toHex(profile.bodyColor);
  const patch = toHex(profile.patchColor);
  const accent = toHex(profile.accentColor);
  const ear = toHex(profile.earColor);
  const paw = toHex(profile.pawColor);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270" role="img" aria-label="${racer.displayName} raceway card">
  <rect width="480" height="270" rx="16" fill="#151713"/>
  <path d="M30 214 C120 190 260 198 450 178" stroke="#8fbf65" stroke-width="8" fill="none" opacity=".55"/>
  <ellipse cx="220" cy="145" rx="118" ry="58" fill="${body}"/>
  <ellipse cx="314" cy="130" rx="48" ry="42" fill="${body}"/>
  <ellipse cx="180" cy="118" rx="48" ry="28" fill="${patch}" opacity=".92"/>
  <ellipse cx="248" cy="160" rx="42" ry="24" fill="${patch}" opacity=".82"/>
  <ellipse cx="302" cy="89" rx="18" ry="28" fill="${ear}" transform="rotate(18 302 89)"/>
  <ellipse cx="337" cy="91" rx="18" ry="28" fill="${ear}" transform="rotate(-18 337 91)"/>
  <circle cx="333" cy="124" r="7" fill="#050505"/>
  <circle cx="356" cy="139" r="8" fill="#2a1111"/>
  <path d="M344 143 C386 132 401 126 419 112" stroke="#f1e2bc" stroke-width="3" fill="none"/>
  <path d="M343 147 C386 151 405 153 429 164" stroke="#f1e2bc" stroke-width="3" fill="none"/>
  <ellipse cx="154" cy="195" rx="23" ry="13" fill="${paw}"/>
  <ellipse cx="246" cy="195" rx="23" ry="13" fill="${paw}"/>
  <path d="M182 83 C215 64 248 67 277 84" stroke="${accent}" stroke-width="10" stroke-linecap="round" opacity=".9"/>
  <text x="24" y="36" font-family="Verdana, Arial, sans-serif" font-size="24" font-weight="700" fill="#f5e8bc">${racer.displayName}</text>
  <text x="24" y="62" font-family="Verdana, Arial, sans-serif" font-size="12" fill="#d9cfae">${racer.coat} | ${profile.idleLoop}</text>
  <text x="24" y="242" font-family="Verdana, Arial, sans-serif" font-size="13" fill="#f0d171">SPD ${racer.stats.speed}  STA ${racer.stats.stamina}  COR ${racer.stats.cornering}  FOC ${racer.stats.focus}  CRG ${racer.stats.courage}</text>
</svg>
`;
}

function toHex(color: Rgba): string {
  const [r, g, b] = color;
  return `#${[r, g, b]
    .map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function createTrackLayout(track: (typeof GUINEA_PIG_RACEWAY_RULES.tracks)[number]) {
  const centerline = Array.from({ length: 16 }, (_, index) => {
    const t = index / 15;
    const angle = t * Math.PI * 2;
    const radiusX = track.key.includes("tunnel") ? 16 : track.key.includes("moonlight") ? 24 : 20;
    const radiusZ = track.key.includes("chicane") ? 8 + Math.sin(angle * 3) * 3 : 11;
    return {
      x: Number((Math.cos(angle) * radiusX).toFixed(3)),
      z: Number((Math.sin(angle) * radiusZ).toFixed(3)),
      bankBps: Math.round((Math.sin(angle + track.lengthMeters) + 1) * 220),
    };
  });
  return {
    key: track.key,
    label: track.label,
    lengthMeters: track.lengthMeters,
    laneCount: track.laneCount,
    surface: track.surface,
    replayAngles: track.replayAngles,
    cameraRails: {
      broadcast_follow: { height: 5.5, lagMeters: 5, lens: "35mm-equivalent" },
      finish_line: { height: 1.2, lockedAtMeter: track.lengthMeters, lens: "70mm-equivalent" },
      lane_low: { height: 0.45, lagMeters: 1.5, lens: "wide-low" },
      overhead_tactical: { height: 16, mode: "orthographic-like" },
      winner_closeup: { height: 1.1, target: "winner_head" },
    },
    collisionProxy: {
      laneWidthMeters: 0.72,
      wallHeightMeters: 0.24,
      innerRailRadiusMeters: Number((track.lengthMeters / Math.PI / 2).toFixed(3)),
    },
    centerline,
  };
}

function createPreviewHtml(manifestPath: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Guinea Pig Raceway Asset Preview</title>
  <style>
    body { margin: 0; font-family: Verdana, Arial, sans-serif; background: #111510; color: #f4e9c5; }
    header { padding: 18px 22px; border-bottom: 1px solid #3a4b32; background: #1b2419; }
    h1 { margin: 0; font-size: 22px; letter-spacing: 0; }
    main { padding: 18px; display: grid; gap: 18px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
    .card { border: 1px solid #536247; background: #1c2219; border-radius: 8px; overflow: hidden; }
    .card img { width: 100%; display: block; background: #151713; }
    .body { padding: 12px; font-size: 12px; line-height: 1.45; }
    .name { font-weight: 700; font-size: 15px; color: #ffe07c; }
    .tracks { display: flex; flex-wrap: wrap; gap: 8px; }
    .track { border: 1px solid #536247; padding: 6px 8px; border-radius: 999px; background: #27301f; font-size: 12px; }
  </style>
</head>
<body>
  <header>
    <h1>Guinea Pig Raceway Asset Pack</h1>
    <div id="summary">Loading manifest...</div>
  </header>
  <main>
    <section class="grid" id="racers"></section>
    <section>
      <h2>Track Pack</h2>
      <div class="tracks" id="tracks"></div>
    </section>
  </main>
  <script>
    fetch("${manifestPath}").then((res) => res.json()).then((manifest) => {
      document.querySelector("#summary").textContent =
        manifest.racers.length + " racers | " + manifest.tracks.length + " tracks | " + manifest.requiredAnimations.join(", ");
      document.querySelector("#racers").innerHTML = manifest.racers.map((racer) => \`
        <article class="card">
          <img src="\${racer.thumbnailPath}" alt="\${racer.displayName} thumbnail" />
          <div class="body">
            <div class="name">\${racer.displayName}</div>
            <div>\${racer.personality}</div>
            <div><strong>Idle:</strong> \${racer.idleLoop}</div>
            <div><strong>Win:</strong> \${racer.winMood}</div>
            <div><strong>Loss:</strong> \${racer.lossMood}</div>
            <div><strong>GLB:</strong> \${racer.modelPath}</div>
          </div>
        </article>
      \`).join("");
      document.querySelector("#tracks").innerHTML = manifest.tracks.map((track) => \`
        <span class="track">\${track.label} / \${track.surface} / \${track.laneCount} lanes</span>
      \`).join("");
    });
  </script>
</body>
</html>
`;
}

async function main() {
  await mkdir(modelDir, { recursive: true });
  await mkdir(thumbnailDir, { recursive: true });
  await mkdir(trackDir, { recursive: true });

  const racers = [];
  for (const racer of GUINEA_PIG_RACEWAY_RULES.defaultRacerStable) {
    const profile = makeProfile(racer);
    const glb = createRacerGlb(racer, profile);
    const modelName = `${racer.id}.glb`;
    const thumbnailName = `${racer.id}.svg`;
    await writeFile(path.join(modelDir, modelName), glb.buffer);
    await writeFile(path.join(thumbnailDir, thumbnailName), createThumbnailSvg(racer, profile));
    racers.push({
      id: racer.id,
      displayName: racer.displayName,
      modelVariant: racer.modelVariant,
      coat: racer.coat,
      laneStyle: racer.laneStyle,
      scoutingReport: racer.scoutingReport,
      personality: profile.personality,
      idleLoop: profile.idleLoop,
      startMood: profile.startMood,
      winMood: profile.winMood,
      lossMood: profile.lossMood,
      stats: racer.stats satisfies RacewayStats,
      modelPath: `${GUINEA_PIG_RACEWAY_ASSET_ROOT}/models/racers/${modelName}`,
      thumbnailPath: `${GUINEA_PIG_RACEWAY_ASSET_ROOT}/thumbnails/${thumbnailName}`,
      triangleCount: glb.triangleCount,
      nodeNames: glb.nodeNames,
      animations: glb.animations,
      budget: {
        maxTriangles: GUINEA_PIG_RACEWAY_RULES.modelRequirements.maxTrianglesPerRacer,
        textureSize: GUINEA_PIG_RACEWAY_RULES.modelRequirements.maxTextureSize,
        lods: GUINEA_PIG_RACEWAY_RULES.modelRequirements.lods,
      },
    });
  }

  const tracks = [];
  for (const track of GUINEA_PIG_RACEWAY_RULES.tracks) {
    const layout = createTrackLayout(track);
    const fileName = `${track.key}.json`;
    await writeFile(path.join(trackDir, fileName), `${JSON.stringify(layout, null, 2)}\n`);
    tracks.push({
      ...track,
      layoutPath: `${GUINEA_PIG_RACEWAY_ASSET_ROOT}/tracks/${fileName}`,
    });
  }

  const manifestPath = `${GUINEA_PIG_RACEWAY_ASSET_ROOT}/manifest.json`;
  const manifest = {
    version: "2026-05-08.guinea-pig-raceway-assets-v1",
    generatedBy: "scripts/generate-guinea-pig-raceway-assets.ts",
    assetRoot: GUINEA_PIG_RACEWAY_ASSET_ROOT,
    manifestPath,
    previewPath: `${GUINEA_PIG_RACEWAY_ASSET_ROOT}/preview.html`,
    format: "glb",
    coordinateSystem: {
      upAxis: "Y",
      forwardAxis: "+X",
      units: "meters",
      racerOrigin: "center mass at ground-projected midpoint",
    },
    requiredAnimations: [...GUINEA_PIG_RACEWAY_REQUIRED_ANIMATIONS],
    runtimeNotes: [
      "Use idle during betting-open and intro marks.",
      "Use take_marks for the final 30 second startup phase.",
      "Use sprint as the race locomotion base and layer stumble/nibble as event cutaways.",
      "Use victory/loss in result announcements and replay booth closeups.",
    ],
    racers,
    tracks,
  };

  await writeFile(path.join(assetRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(assetRoot, "preview.html"), createPreviewHtml(manifestPath));
  console.log(
    `Generated ${racers.length} racer GLBs, ${tracks.length} track layouts, and manifest at ${path.join(assetRoot, "manifest.json")}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
