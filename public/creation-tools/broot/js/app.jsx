const { useCallback, useEffect, useMemo, useRef, useState } = React;

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 820;
const AUTOSAVE_ID = "autosave";
const NETWORK_STORAGE_KEY = "broot.network.v1";
const WALLET_SESSION_PREFIX = "broot.wallet.session.v1";
const HEN_TOKEN_CONTRACT = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const HEN_STORAGE_API = `https://api.tzkt.io/v1/contracts/${HEN_TOKEN_CONTRACT}/storage`;
const TEZOS_MINIMAL_FEE_MUTEZ = 100;
const TEZOS_MINIMAL_MUTEZ_PER_BYTE = 1;
const TEZOS_MINIMAL_MUTEZ_PER_GAS_UNIT = 0.1;
const DEFAULT_OPERATION_SIZE_BYTES = 1800;

const NETWORKS = {
  shadownet: {
    label: "Shadownet testnet",
    rpc: "https://tezos-shadownet.octez.io/",
    chainId: "NetXsqzbfFenSTS",
    beaconNetwork: { type: "shadownet" },
    explorer: "https://shadownet.tzkt.io/",
  },
  mainnet: {
    label: "Mainnet",
    rpc: "https://tezos-mainnet.octez.io/",
    chainId: "NetXdQprcVkpaWU",
    beaconNetwork: { type: "mainnet" },
    explorer: "https://tzkt.io/",
  },
};

const PALETTES = [
  "#101114",
  "#f8f2df",
  "#ff5964",
  "#4ad6b8",
  "#f6c85f",
  "#6db9ff",
  "#7947ff",
  "#f07bd8",
  "#ff8b3d",
  "#7dd870",
  "#293642",
  "#655b51",
];

const FX_MODES = [
  { value: "duotone", label: "Duotone" },
  { value: "noir", label: "Noir" },
  { value: "thermal", label: "Thermal" },
  { value: "invert", label: "Invert" },
];

const WARP_MODES = [
  { value: "bulge", label: "Bulge" },
  { value: "pinch", label: "Pinch" },
  { value: "swirl", label: "Swirl" },
  { value: "hex", label: "Hex" },
  { value: "perspective", label: "Perspective" },
];

const VIDEO_EXPORT_MODES = [
  { value: "hold", label: "Still hold" },
  { value: "pulse", label: "Layer pulse" },
  { value: "reveal", label: "Layer reveal" },
];

const FFMPEG_CORE_URL = "./lib/ffmpeg-core.js";
const FFMPEG_WASM_URL = "./lib/ffmpeg-core.wasm";
const HISTORY_LIMIT = 48;
const HEN_MINT_LIMIT_OPTIONS = {
  fallbackGasLimit: 360_000,
  fallbackStorageLimit: 2_200,
  feeTipMutez: 1_000,
};

const BROOT_PROJECT_EXTENSION = ".broot";
const JSON_PROJECT_EXTENSION = ".json";
const BROOT_PROJECT_MIME = "application/json";
const BROOT_PROJECT_SAVE_ACCEPT = { [BROOT_PROJECT_MIME]: [BROOT_PROJECT_EXTENSION] };
const PROJECT_EXTENSIONS = new Set([BROOT_PROJECT_EXTENSION, JSON_PROJECT_EXTENSION]);
const IMAGE_EXTENSIONS = new Set([".apng", ".avif", ".bmp", ".gif", ".jpg", ".jpeg", ".jpe", ".png", ".svg", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".m4v", ".mov", ".mp4", ".ogv", ".ogg", ".webm"]);
const BROOT_OPEN_ACCEPT = {
  [BROOT_PROJECT_MIME]: [BROOT_PROJECT_EXTENSION, JSON_PROJECT_EXTENSION],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg", ".jpe"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "image/avif": [".avif"],
  "image/bmp": [".bmp"],
  "image/svg+xml": [".svg"],
  "video/mp4": [".mp4", ".m4v"],
  "video/quicktime": [".mov"],
  "video/webm": [".webm"],
  "video/ogg": [".ogv", ".ogg"],
};
const BROOT_MEDIA_ACCEPT = Object.fromEntries(
  Object.entries(BROOT_OPEN_ACCEPT).filter(([mime]) => mime.startsWith("image/") || mime.startsWith("video/"))
);
const BROOT_OPEN_ACCEPT_STRING = Object.entries(BROOT_OPEN_ACCEPT)
  .flatMap(([mime, extensions]) => [mime, ...extensions])
  .join(",");
const BROOT_MEDIA_ACCEPT_STRING = Object.entries(BROOT_MEDIA_ACCEPT)
  .flatMap(([mime, extensions]) => [mime, ...extensions])
  .join(",");

let objectCounter = 1;

function safeSlug(value) {
  return String(value || "broot-artifact")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "broot-artifact";
}

function shortAddress(value) {
  if (!value) return "not connected";
  return `${value.slice(0, 7)}...${value.slice(-4)}`;
}

function walletSessionKey(networkKey) {
  const path = typeof location !== "undefined" ? `${location.origin}${location.pathname}` : "local";
  return `${WALLET_SESSION_PREFIX}:${networkKey || "unknown"}:${path}`;
}

function readWalletSession(networkKey) {
  try {
    const raw = localStorage.getItem(walletSessionKey(networkKey));
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function saveWalletSession(networkKey, address, rpcUrl) {
  try {
    localStorage.setItem(
      walletSessionKey(networkKey),
      JSON.stringify({ address, network: networkKey, rpcUrl, savedAt: new Date().toISOString() })
    );
  } catch (_) {
    /* restricted storage */
  }
}

function clearWalletSession(networkKey) {
  try {
    localStorage.removeItem(walletSessionKey(networkKey));
  } catch (_) {
    /* restricted storage */
  }
}

function readStoredNetwork() {
  try {
    const stored = localStorage.getItem(NETWORK_STORAGE_KEY);
    return stored && NETWORKS[stored] ? stored : "shadownet";
  } catch (_) {
    return "shadownet";
  }
}

function saveStoredNetwork(networkKey) {
  try {
    if (NETWORKS[networkKey]) localStorage.setItem(NETWORK_STORAGE_KEY, networkKey);
  } catch (_) {
    /* restricted storage */
  }
}

function accountAddress(account) {
  return account && (account.address || account.publicKeyHash || account.pkh || "");
}

function accountMatchesNetwork(account, config) {
  return Boolean(account && account.network && config && account.network.type === config.beaconNetwork.type);
}

function disableWalletMetrics(client) {
  if (!client) return;
  client.enableMetrics = false;
  client.updateMetricsStorage = async () => {};
  client.sendMetrics = () => {};
}

function operationSizeEstimate(estimate, options) {
  const raw =
    estimate?.operationSize ??
    estimate?.opSize ??
    estimate?.size ??
    options?.operationSize ??
    options?.opSize ??
    DEFAULT_OPERATION_SIZE_BYTES;
  const size = Number(raw);
  return Number.isFinite(size) && size > 0 ? size : DEFAULT_OPERATION_SIZE_BYTES;
}

function feeFloorForGasLimit(gasLimit, estimate, options) {
  const gas = Number(gasLimit || 0);
  if (!Number.isFinite(gas) || gas <= 0) return null;
  const size = operationSizeEstimate(estimate, options);
  const base =
    TEZOS_MINIMAL_FEE_MUTEZ +
    size * TEZOS_MINIMAL_MUTEZ_PER_BYTE +
    gas * TEZOS_MINIMAL_MUTEZ_PER_GAS_UNIT;
  return Math.ceil(base * (options?.feeFloorBuffer || 1.2) + (options?.feeTipMutez || 1_000));
}

async function transferParams(method, transferOptions) {
  try {
    if (method && typeof method.toTransferParams === "function") {
      return await method.toTransferParams(transferOptions || {});
    }
  } catch (_) {
    /* some Taquito method shims accept transfer options only on send */
  }
  return transferOptions || {};
}

async function estimateWalletOp(tezos, method, transferOptions, options) {
  const opts = options || {};
  let gasLimit = opts.gasLimit;
  let storageLimit = opts.storageLimit;
  let fee = opts.fee;
  let estimated = false;
  try {
    const params = await transferParams(method, transferOptions);
    const estimate = await tezos.estimate.transfer(params);
    gasLimit = Math.min(1_040_000, Math.ceil(estimate.gasLimit * (opts.gasBuffer || 1.45)) + (opts.gasPad || 20_000));
    storageLimit = Math.ceil(estimate.storageLimit * (opts.storageBuffer || 1.35)) + (opts.storagePad || 80);
    const estimateFee = Math.ceil(estimate.suggestedFeeMutez * (opts.feeBuffer || 1.25)) + (opts.feePad || 500);
    fee = Math.max(estimateFee, feeFloorForGasLimit(gasLimit, estimate, opts) || 0);
    estimated = true;
  } catch (_) {
    gasLimit = gasLimit || opts.fallbackGasLimit || 320_000;
    storageLimit = storageLimit || opts.fallbackStorageLimit || 2_000;
    fee = fee || feeFloorForGasLimit(gasLimit, null, opts);
  }
  return {
    fee,
    gasLimit,
    storageLimit,
    storageFeeMutez: Math.max(0, Number(storageLimit || 0)) * 250,
    estimated,
  };
}

function mutezToTez(value) {
  return `${(Number(value || 0) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 })} tez`;
}

function fileExtension(file) {
  const name = String(file && file.name ? file.name : "").toLowerCase();
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index) : "";
}

function classifyOpenFile(file) {
  const mime = String(file && file.type ? file.type : "").toLowerCase();
  const extension = fileExtension(file);
  if (mime === BROOT_PROJECT_MIME || PROJECT_EXTENSIONS.has(extension)) return "project";
  if (mime.startsWith("image/") || IMAGE_EXTENSIONS.has(extension)) return "image";
  if (mime.startsWith("video/") || VIDEO_EXTENSIONS.has(extension)) return "video";
  return "unsupported";
}

function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(",");
  const mime = (head.match(/data:([^;]+)/) || [])[1] || "application/octet-stream";
  const raw = atob(body);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function stringToBytes(value) {
  if (window.TZ && typeof window.TZ.stringToBytes === "function") return window.TZ.stringToBytes(value);
  const bytes = new TextEncoder().encode(String(value || ""));
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createTokenInfoMap(metadataUri) {
  const MichelsonMap = window.TZ && window.TZ.MichelsonMap;
  const tokenInfo = MichelsonMap ? new MichelsonMap() : new Map();
  tokenInfo.set("", stringToBytes(metadataUri));
  return tokenInfo;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}

function canvasElementToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    if (canvas.toBlob) {
      canvas.toBlob((blob) => resolve(blob || dataUrlToBlob(canvas.toDataURL(type || "image/png", quality))), type || "image/png", quality);
      return;
    }
    resolve(dataUrlToBlob(canvas.toDataURL(type || "image/png", quality)));
  });
}

function cloneFabricObject(obj) {
  return new Promise((resolve, reject) => {
    if (!obj || typeof obj.clone !== "function") {
      reject(new Error("Selected layer cannot be cloned."));
      return;
    }
    obj.clone(
      (cloned) => cloned ? resolve(cloned) : reject(new Error("Selected layer could not be cloned.")),
      ["data", "visible", "lockMovementX", "lockMovementY", "lockScalingX", "lockScalingY", "lockRotation"]
    );
  });
}

async function renderFabricObjectSnapshot(obj) {
  if (!obj) throw new Error("Select one or more layers first.");
  const bounds = obj.getBoundingRect(true, true);
  if (!bounds.width || !bounds.height) throw new Error("Selected layer has no visible pixels.");
  if (typeof obj.toCanvasElement === "function") {
    const element = obj.toCanvasElement({ multiplier: 1, enableRetinaScaling: false });
    return { canvas: element, bounds, pad: 0 };
  }

  const pad = 8;
  const width = Math.max(1, Math.ceil(bounds.width + pad * 2));
  const height = Math.max(1, Math.ceil(bounds.height + pad * 2));
  const snapshot = document.createElement("canvas");
  snapshot.width = width;
  snapshot.height = height;
  const staticCanvas = new fabric.StaticCanvas(snapshot, {
    width,
    height,
    backgroundColor: "rgba(0,0,0,0)",
    renderOnAddRemove: false,
  });
  const clone = await cloneFabricObject(obj);
  staticCanvas.viewportTransform = [1, 0, 0, 1, -bounds.left + pad, -bounds.top + pad];
  staticCanvas.add(clone);
  staticCanvas.renderAll();
  staticCanvas.dispose();
  return { canvas: snapshot, bounds, pad };
}

function getActiveTargets(active) {
  if (!active) return [];
  if (active.type === "activeSelection" && typeof active.getObjects === "function") return active.getObjects();
  return [active];
}

function applyGlfxDistortionToCanvas(sourceCanvas, mode, strength) {
  if (!window.fx || typeof window.fx.canvas !== "function") {
    throw new Error("glfx distortion engine is not available.");
  }
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  if (!width || !height) throw new Error("Nothing visible to distort.");
  const fxCanvas = window.fx.canvas();
  const texture = fxCanvas.texture(sourceCanvas);
  const centerX = width / 2;
  const centerY = height / 2;
  const amount = Math.max(-1, Math.min(1, Number(strength || 0)));
  const radius = Math.max(24, Math.min(width, height) * (0.34 + Math.abs(amount) * 0.22));

  fxCanvas.draw(texture);
  if (mode === "bulge") {
    fxCanvas.bulgePinch(centerX, centerY, radius, Math.max(0.05, amount));
  } else if (mode === "pinch") {
    fxCanvas.bulgePinch(centerX, centerY, radius, -Math.max(0.05, Math.abs(amount)));
  } else if (mode === "swirl") {
    fxCanvas.swirl(centerX, centerY, radius, amount * 4.2);
  } else if (mode === "hex") {
    fxCanvas.hexagonalPixelate(centerX, centerY, 8 + Math.abs(amount) * 34);
  } else if (mode === "perspective") {
    const inset = Math.abs(amount) * 0.2;
    const skew = amount * 0.16;
    fxCanvas.perspective(
      [0, 0, width, 0, 0, height, width, height],
      [
        width * (inset + Math.max(0, skew)),
        height * inset,
        width * (1 - inset + Math.min(0, skew)),
        height * (inset * 0.45),
        width * Math.max(0, -skew),
        height * (1 - inset * 0.45),
        width * (1 - Math.max(0, skew)),
        height * (1 - inset),
      ]
    );
  } else {
    throw new Error(`Unknown warp mode: ${mode}`);
  }
  fxCanvas.update();
  texture.destroy();
  return dataUrlToBlob(fxCanvas.toDataURL("image/png"));
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("broot", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB could not open Broot storage."));
  });
}

async function putProject(record) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("projects", "readwrite");
    tx.objectStore("projects").put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("Could not save Broot project."));
  });
  db.close();
}

async function getProject(id) {
  const db = await openDb();
  const record = await new Promise((resolve, reject) => {
    const tx = db.transaction("projects", "readonly");
    const request = tx.objectStore("projects").get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("Could not read Broot project."));
  });
  db.close();
  return record;
}

function ensureObjectMeta(obj, fallbackName) {
  const data = obj.data && typeof obj.data === "object" ? obj.data : {};
  if (!data.id) data.id = `broot-object-${objectCounter++}`;
  if (!data.name) data.name = fallbackName || obj.type || "Layer";
  obj.data = data;
  return data;
}

function objectLabel(obj) {
  const data = ensureObjectMeta(obj);
  return data.name || obj.type || "Layer";
}

function makeFabricBrush(canvas, color, width) {
  const brush = new fabric.PencilBrush(canvas);
  brush.color = color;
  brush.width = width;
  brush.strokeLineCap = "round";
  brush.strokeLineJoin = "round";
  return brush;
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    fabric.Image.fromURL(
      url,
      (img) => {
        URL.revokeObjectURL(url);
        resolve(img);
      },
      { crossOrigin: "anonymous" }
    );
  });
}

function loadVideoFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    let settled = false;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("error", onError);
      callback();
    };
    const onLoaded = () => finish(() => {
      const play = video.play();
      if (play && typeof play.catch === "function") play.catch(() => {});
      resolve({ video, url });
    });
    const onError = () => finish(() => {
      URL.revokeObjectURL(url);
      reject(new Error("This browser could not preview that video codec."));
    });
    const timeout = setTimeout(() => onError(), 3000);
    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("error", onError);
    video.src = url;
    video.load();
  });
}

function releaseObjectResources(obj) {
  const data = obj && obj.data;
  if (!data) return;
  if (data.animationFrame) {
    cancelAnimationFrame(data.animationFrame);
    data.animationFrame = null;
  }
  if (data.objectUrl) {
    URL.revokeObjectURL(data.objectUrl);
    data.objectUrl = "";
  }
  if (typeof obj.getElement === "function") {
    const element = obj.getElement();
    if (element && typeof element.pause === "function") element.pause();
  }
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "WebGL shader failed.");
  }
  return shader;
}

async function renderWebGlEffect(sourceCanvas, mode) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const glCanvas = document.createElement("canvas");
  glCanvas.width = width;
  glCanvas.height = height;
  const gl = glCanvas.getContext("webgl", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL is not available in this browser.");

  const vertex = compileShader(
    gl,
    gl.VERTEX_SHADER,
    `
      attribute vec2 aPos;
      varying vec2 vUv;
      void main() {
        vUv = vec2((aPos.x + 1.0) * 0.5, 1.0 - ((aPos.y + 1.0) * 0.5));
        gl_Position = vec4(aPos, 0.0, 1.0);
      }
    `
  );
  const fragment = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    `
      precision mediump float;
      varying vec2 vUv;
      uniform sampler2D uImage;
      uniform int uMode;

      void main() {
        vec4 color = texture2D(uImage, vUv);
        float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        vec3 result = color.rgb;
        if (uMode == 1) {
          result = mix(vec3(0.06, 0.07, 0.08), vec3(0.98, 0.77, 0.32), smoothstep(0.05, 1.0, luma));
          result.r += color.r * 0.18;
          result.g += color.g * 0.08;
        } else if (uMode == 2) {
          result = vec3(luma);
          result = smoothstep(0.12, 0.92, result);
        } else if (uMode == 3) {
          result = vec3(
            smoothstep(0.0, 0.8, luma),
            smoothstep(0.18, 0.72, 1.0 - abs(luma - 0.52)),
            smoothstep(0.28, 1.0, 1.0 - luma)
          );
        } else if (uMode == 4) {
          result = vec3(1.0) - color.rgb;
        }
        gl_FragColor = vec4(result, color.a);
      }
    `
  );
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "WebGL program failed.");
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
  gl.uniform1i(gl.getUniformLocation(program, "uImage"), 0);
  gl.uniform1i(gl.getUniformLocation(program, "uMode"), { duotone: 1, noir: 2, thermal: 3, invert: 4 }[mode] || 1);
  gl.viewport(0, 0, width, height);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return dataUrlToBlob(glCanvas.toDataURL("image/png"));
}

function BrootApp() {
  const canvasElRef = useRef(null);
  const fabricRef = useRef(null);
  const workerRef = useRef(null);
  const pendingWorkerRef = useRef(new Map());
  const workerIdRef = useRef(1);
  const autosaveTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const fileHandleRef = useRef(null);
  const tezosRef = useRef(null);
  const walletRef = useRef(null);
  const walletNetworkRef = useRef("");
  const connectPromiseRef = useRef(null);
  const ffmpegRef = useRef(null);
  const historyRef = useRef({ undo: [], redo: [], restoring: false });
  const preparedMintRef = useRef(null);

  const [activeTool, setActiveTool] = useState("select");
  const [primaryColor, setPrimaryColor] = useState("#ff5964");
  const [secondaryColor, setSecondaryColor] = useState("#4ad6b8");
  const [brushSize, setBrushSize] = useState(12);
  const [zoom, setZoom] = useState(0.75);
  const [layers, setLayers] = useState([]);
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [selectionState, setSelectionState] = useState({ count: 0, type: "", name: "" });
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [projectName, setProjectName] = useState("Broot artifact");
  const [description, setDescription] = useState("Made in Broot.");
  const [tags, setTags] = useState("broot, wtfos, tezos");
  const [royaltyBps, setRoyaltyBps] = useState(1000);
  const [tokenId, setTokenId] = useState(0);
  const [editionAmount, setEditionAmount] = useState(1);
  const [network, setNetwork] = useState(() => readStoredNetwork());
  const [walletState, setWalletState] = useState({
    address: "",
    chainId: "",
    connected: false,
    connecting: false,
    restoring: true,
  });
  const [mintState, setMintState] = useState({
    busy: false,
    tokenId: "",
    opHash: "",
    storageFeeMutez: 0,
  });
  const [artifactCid, setArtifactCid] = useState("");
  const [metadataCid, setMetadataCid] = useState("");
  const [effectMode, setEffectMode] = useState("duotone");
  const [warpMode, setWarpMode] = useState("bulge");
  const [warpStrength, setWarpStrength] = useState(0.55);
  const [videoMode, setVideoMode] = useState("hold");
  const [videoDuration, setVideoDuration] = useState(2);
  const [videoFps, setVideoFps] = useState(24);
  const [libraryState, setLibraryState] = useState({
    ffmpeg: false,
    glfx: false,
  });
  const [dangerAction, setDangerAction] = useState(null);
  const [henReview, setHenReview] = useState({ open: false, prepared: null });
  const [mobilePanel, setMobilePanel] = useState("canvas");
  const [status, setStatus] = useState("Broot ready.");

  const scheduleLayerRefresh = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const objects = canvas.getObjects();
    objects.forEach((obj, index) => ensureObjectMeta(obj, `Layer ${index + 1}`));
    setLayers(objects.slice().reverse().map((obj) => ({
      id: obj.data.id,
      name: objectLabel(obj),
      type: obj.type || "object",
      visible: obj.visible !== false,
      locked: Boolean(obj.lockMovementX && obj.lockScalingX),
    })));
    const active = canvas.getActiveObject();
    setSelectedLayerId(active && active.data ? active.data.id : null);
    const targets = active ? getActiveTargets(active) : [];
    setSelectionState({
      count: targets.length,
      type: active ? active.type || "object" : "",
      name: active ? objectLabel(active) : "",
    });
  }, []);

  const updateHistoryState = useCallback(() => {
    const history = historyRef.current;
    setHistoryState({
      canUndo: history.undo.length > 0,
      canRedo: history.redo.length > 0,
    });
  }, []);

  const canvasSnapshot = useCallback((label) => {
    const canvas = fabricRef.current;
    if (!canvas) return null;
    return {
      label: label || "Canvas change",
      savedAt: new Date().toISOString(),
      backgroundColor: canvas.backgroundColor || "#f8f2df",
      canvas: canvas.toJSON(["data", "visible", "lockMovementX", "lockMovementY", "lockScalingX", "lockScalingY", "lockRotation"]),
    };
  }, []);

  const captureHistory = useCallback((label) => {
    const snapshot = canvasSnapshot(label);
    if (!snapshot || historyRef.current.restoring) return;
    const undo = historyRef.current.undo;
    undo.push(snapshot);
    if (undo.length > HISTORY_LIMIT) undo.shift();
    historyRef.current.redo = [];
    updateHistoryState();
  }, [canvasSnapshot, updateHistoryState]);

  const buildProjectRecord = useCallback((id) => {
    const canvas = fabricRef.current;
    if (!canvas) throw new Error("Canvas is not ready.");
    canvas.discardActiveObject();
    canvas.renderAll();
    return {
      id,
      savedAt: new Date().toISOString(),
      app: "broot",
      version: 1,
      projectName,
      description,
      tags,
      royaltyBps: Number(royaltyBps),
      tokenId: Number(tokenId),
      editionAmount: Number(editionAmount),
      network,
      artifactCid,
      metadataCid,
      canvas: canvas.toJSON(["data", "visible", "lockMovementX", "lockMovementY", "lockScalingX", "lockScalingY", "lockRotation"]),
    };
  }, [artifactCid, description, editionAmount, metadataCid, network, projectName, royaltyBps, tags, tokenId]);

  const saveDraft = useCallback(async (silent) => {
    const record = buildProjectRecord(AUTOSAVE_ID);
    await putProject(record);
    if (!silent) setStatus(`Saved IndexedDB draft at ${new Date(record.savedAt).toLocaleTimeString()}.`);
  }, [buildProjectRecord]);

  const scheduleAutosave = useCallback(() => {
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      saveDraft(true).catch((error) => setStatus(`Autosave failed: ${error.message}`));
    }, 900);
  }, [saveDraft]);

  const restoreHistorySnapshot = useCallback((snapshot, statusText) => {
    const canvas = fabricRef.current;
    if (!canvas || !snapshot) return;
    historyRef.current.restoring = true;
    canvas.loadFromJSON(snapshot.canvas, () => {
      canvas.backgroundColor = snapshot.backgroundColor || "#f8f2df";
      canvas.getObjects().forEach((obj, index) => ensureObjectMeta(obj, `Layer ${index + 1}`));
      canvas.discardActiveObject();
      canvas.renderAll();
      historyRef.current.restoring = false;
      scheduleLayerRefresh();
      scheduleAutosave();
      setStatus(statusText);
    });
  }, [scheduleAutosave, scheduleLayerRefresh]);

  const undoCanvas = useCallback(() => {
    const snapshot = historyRef.current.undo.pop();
    if (!snapshot) {
      setStatus("Nothing to undo.");
      updateHistoryState();
      return;
    }
    const current = canvasSnapshot("Redo point");
    if (current) historyRef.current.redo.push(current);
    restoreHistorySnapshot(snapshot, `Undid ${snapshot.label}.`);
    updateHistoryState();
  }, [canvasSnapshot, restoreHistorySnapshot, updateHistoryState]);

  const redoCanvas = useCallback(() => {
    const snapshot = historyRef.current.redo.pop();
    if (!snapshot) {
      setStatus("Nothing to redo.");
      updateHistoryState();
      return;
    }
    const current = canvasSnapshot("Undo point");
    if (current) historyRef.current.undo.push(current);
    restoreHistorySnapshot(snapshot, `Redid ${snapshot.label}.`);
    updateHistoryState();
  }, [canvasSnapshot, restoreHistorySnapshot, updateHistoryState]);

  const loadProjectRecord = useCallback((record) => {
    if (!record || !record.canvas) throw new Error("This file is not a Broot project.");
    const canvas = fabricRef.current;
    if (!canvas) throw new Error("Canvas is not ready.");
    historyRef.current.restoring = true;
    canvas.loadFromJSON(record.canvas, () => {
      canvas.getObjects().forEach((obj, index) => ensureObjectMeta(obj, `Layer ${index + 1}`));
      canvas.renderAll();
      historyRef.current.restoring = false;
      historyRef.current.undo = [];
      historyRef.current.redo = [];
      updateHistoryState();
      scheduleLayerRefresh();
    });
    setProjectName(record.projectName || "Broot artifact");
    setDescription(record.description || "");
    setTags(record.tags || "");
    setRoyaltyBps(Number(record.royaltyBps || 0));
    setTokenId(Number(record.tokenId || 0));
    setEditionAmount(Number(record.editionAmount || 1));
    setNetwork(record.network && NETWORKS[record.network] ? record.network : "shadownet");
    setArtifactCid(record.artifactCid || "");
    setMetadataCid(record.metadataCid || "");
    setStatus(`Loaded ${record.projectName || "Broot project"}.`);
  }, [scheduleLayerRefresh, updateHistoryState]);

  const workerRequest = useCallback((type, payload, transfers) => {
    const worker = workerRef.current;
    if (!worker) return Promise.reject(new Error("Export worker is not ready."));
    const id = workerIdRef.current++;
    return new Promise((resolve, reject) => {
      pendingWorkerRef.current.set(id, { resolve, reject });
      worker.postMessage({ id, type, payload }, transfers || []);
    });
  }, []);

  useEffect(() => {
    workerRef.current = new Worker("./js/broot-worker.js");
    workerRef.current.onmessage = (event) => {
      const { id, ok, error, ...rest } = event.data || {};
      const pending = pendingWorkerRef.current.get(id);
      if (!pending) return;
      pendingWorkerRef.current.delete(id);
      if (ok) pending.resolve(rest);
      else pending.reject(new Error(error || "Worker job failed."));
    };
    return () => {
      clearTimeout(autosaveTimerRef.current);
      workerRef.current && workerRef.current.terminate();
    };
  }, []);

  useEffect(() => {
    setLibraryState({
      ffmpeg: Boolean(window.FFmpegWASM && window.FFmpegWASM.FFmpeg),
      glfx: Boolean(window.fx && window.fx.canvas),
    });
  }, []);

  useEffect(() => {
    if (!canvasElRef.current || !window.fabric) return;
    const canvas = new fabric.Canvas(canvasElRef.current, {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor: "#f8f2df",
      preserveObjectStacking: true,
      selection: true,
    });
    fabricRef.current = canvas;
    canvas.freeDrawingBrush = makeFabricBrush(canvas, primaryColor, brushSize);

    const title = new fabric.IText("Broot", {
      left: 72,
      top: 70,
      fill: "#101114",
      fontFamily: "Avenir Next, Segoe UI, sans-serif",
      fontSize: 86,
      fontWeight: 900,
    });
    ensureObjectMeta(title, "Title");
    const block = new fabric.Rect({
      left: 72,
      top: 188,
      width: 330,
      height: 220,
      rx: 6,
      ry: 6,
      fill: "#ff5964",
      stroke: "#101114",
      strokeWidth: 6,
    });
    ensureObjectMeta(block, "Signal block");
    const orb = new fabric.Circle({
      left: 330,
      top: 280,
      radius: 124,
      fill: "#4ad6b8",
      stroke: "#101114",
      strokeWidth: 6,
      opacity: 0.92,
    });
    ensureObjectMeta(orb, "Color plate");
    const line = new fabric.Path("M 620 130 C 810 70 910 270 1120 180 S 1180 530 880 560", {
      fill: "",
      stroke: "#101114",
      strokeWidth: 26,
      strokeLineCap: "round",
    });
    ensureObjectMeta(line, "Brush route");
    canvas.add(block, orb, line, title);
    canvas.setActiveObject(title);
    canvas.renderAll();
    scheduleLayerRefresh();

    const refresh = () => {
      if (historyRef.current.restoring) return;
      scheduleLayerRefresh();
      scheduleAutosave();
    };
    canvas.on("object:added", refresh);
    canvas.on("object:removed", (event) => {
      releaseObjectResources(event.target);
      refresh();
    });
    canvas.on("object:modified", refresh);
    canvas.on("path:created", refresh);
    canvas.on("selection:created", scheduleLayerRefresh);
    canvas.on("selection:updated", scheduleLayerRefresh);
    canvas.on("selection:cleared", scheduleLayerRefresh);

    getProject(AUTOSAVE_ID)
      .then((record) => {
        if (record) setStatus("Autosave found. Use Load Draft to restore it.");
      })
      .catch(() => {});

    return () => {
      canvas.getObjects().forEach((obj) => releaseObjectResources(obj));
      canvas.dispose();
      fabricRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (activeTool === "brush" || activeTool === "eraser") {
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush = makeFabricBrush(canvas, activeTool === "eraser" ? "#f8f2df" : primaryColor, brushSize);
      canvas.selection = false;
    } else {
      canvas.isDrawingMode = false;
      canvas.selection = true;
    }
  }, [activeTool, brushSize, primaryColor]);

  const canvasBlob = useCallback(async (format, quality) => {
    const canvas = fabricRef.current;
    if (!canvas) throw new Error("Canvas is not ready.");
    canvas.discardActiveObject();
    canvas.renderAll();
    const dataUrl = canvas.toDataURL({ format, quality: quality == null ? 0.94 : quality });
    return dataUrlToBlob(dataUrl);
  }, []);

  const canvasPixels = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas) throw new Error("Canvas is not ready.");
    canvas.discardActiveObject();
    canvas.renderAll();
    const source = canvas.lowerCanvasEl || canvas.getElement();
    const scratch = document.createElement("canvas");
    scratch.width = CANVAS_WIDTH;
    scratch.height = CANVAS_HEIGHT;
    const ctx = scratch.getContext("2d");
    ctx.drawImage(source, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const image = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, pixels: image.data.buffer };
  }, []);

  const selectedObject = useCallback(() => {
    const canvas = fabricRef.current;
    return canvas ? canvas.getActiveObject() : null;
  }, []);

  const addRect = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    captureHistory("add rectangle");
    const rect = new fabric.Rect({
      left: 130 + layers.length * 12,
      top: 120 + layers.length * 10,
      width: 240,
      height: 150,
      rx: 4,
      ry: 4,
      fill: primaryColor,
      stroke: secondaryColor,
      strokeWidth: 5,
    });
    ensureObjectMeta(rect, "Rectangle");
    canvas.add(rect);
    canvas.setActiveObject(rect);
    canvas.renderAll();
    setActiveTool("select");
  }, [captureHistory, layers.length, primaryColor, secondaryColor]);

  const addCircle = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    captureHistory("add circle");
    const circle = new fabric.Circle({
      left: 190 + layers.length * 10,
      top: 150 + layers.length * 8,
      radius: 82,
      fill: secondaryColor,
      stroke: "#101114",
      strokeWidth: 5,
    });
    ensureObjectMeta(circle, "Circle");
    canvas.add(circle);
    canvas.setActiveObject(circle);
    canvas.renderAll();
    setActiveTool("select");
  }, [captureHistory, layers.length, secondaryColor]);

  const addText = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    captureHistory("add text");
    const text = new fabric.IText("type here", {
      left: 160,
      top: 170,
      fill: primaryColor,
      fontFamily: "Avenir Next, Segoe UI, sans-serif",
      fontSize: 64,
      fontWeight: 800,
    });
    ensureObjectMeta(text, "Text");
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
    setActiveTool("select");
  }, [captureHistory, primaryColor]);

  const addImage = useCallback(async (file) => {
    if (!file) return;
    const canvas = fabricRef.current;
    if (!canvas) return;
    captureHistory(`import ${file.name || "image"}`);
    const image = await loadImageFromBlob(file);
    const scale = Math.min(0.72, CANVAS_WIDTH / image.width / 2, CANVAS_HEIGHT / image.height / 2);
    image.set({
      left: 140,
      top: 120,
      scaleX: scale,
      scaleY: scale,
    });
    ensureObjectMeta(image, file.name || "Image");
    canvas.add(image);
    canvas.setActiveObject(image);
    canvas.renderAll();
    setStatus(`Imported ${file.name || "image"}.`);
  }, [captureHistory]);

  const addVideoPlaceholder = useCallback((file, reason) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    captureHistory(`import ${file.name || "video"}`);
    const rect = new fabric.Rect({
      left: 0,
      top: 0,
      width: 420,
      height: 250,
      rx: 8,
      ry: 8,
      fill: "#101114",
      stroke: secondaryColor,
      strokeWidth: 5,
    });
    const label = new fabric.Text(`VIDEO\n${file.name || "media file"}`, {
      left: 28,
      top: 72,
      fill: "#f8f2df",
      fontFamily: "Avenir Next, Segoe UI, sans-serif",
      fontSize: 32,
      fontWeight: 800,
      lineHeight: 1.15,
    });
    const group = new fabric.Group([rect, label], {
      left: 150 + layers.length * 10,
      top: 140 + layers.length * 8,
    });
    ensureObjectMeta(group, file.name || "Video");
    group.data.mediaKind = "video";
    group.data.previewError = reason || "";
    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.renderAll();
    setStatus(`Imported ${file.name || "video"} as a video layer placeholder.`);
  }, [captureHistory, layers.length, secondaryColor]);

  const addVideo = useCallback(async (file) => {
    if (!file) return;
    const canvas = fabricRef.current;
    if (!canvas) return;
    try {
      const { video, url } = await loadVideoFromBlob(file);
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 360;
      const image = new fabric.Image(video, {
        left: 140,
        top: 120,
        objectCaching: false,
      });
      const scale = Math.min(0.72, CANVAS_WIDTH / width / 2, CANVAS_HEIGHT / height / 2);
      image.set({ scaleX: scale, scaleY: scale });
      const meta = ensureObjectMeta(image, file.name || "Video");
      meta.mediaKind = "video";
      meta.objectUrl = url;
      const tick = () => {
        if (!fabricRef.current || !fabricRef.current.contains(image)) return;
        fabricRef.current.requestRenderAll();
        meta.animationFrame = requestAnimationFrame(tick);
      };
      meta.animationFrame = requestAnimationFrame(tick);
      captureHistory(`import ${file.name || "video"}`);
      canvas.add(image);
      canvas.setActiveObject(image);
      canvas.renderAll();
      setStatus(`Imported video ${file.name || "media"}.`);
    } catch (error) {
      addVideoPlaceholder(file, error.message);
    }
  }, [addVideoPlaceholder, captureHistory]);

  const importMediaFile = useCallback(async (file) => {
    if (!file) return;
    const kind = classifyOpenFile(file);
    if (kind === "image") {
      await addImage(file);
      return;
    }
    if (kind === "video") {
      await addVideo(file);
      return;
    }
    throw new Error("Broot can open .broot/.json projects plus PNG, JPG, GIF, WEBP, SVG, MP4, MOV, and WebM media.");
  }, [addImage, addVideo]);

  const performDeleteSelection = useCallback(() => {
    const canvas = fabricRef.current;
    const active = selectedObject();
    if (!canvas || !active) return;
    const targets = getActiveTargets(active);
    captureHistory(`delete ${targets.length > 1 ? `${targets.length} layers` : objectLabel(active)}`);
    if (active.type === "activeSelection") {
      active.forEachObject((obj) => canvas.remove(obj));
      canvas.discardActiveObject();
    } else {
      canvas.remove(active);
    }
    canvas.renderAll();
    scheduleLayerRefresh();
    setStatus(`Deleted ${targets.length > 1 ? `${targets.length} layers` : objectLabel(active)}.`);
  }, [captureHistory, scheduleLayerRefresh, selectedObject]);

  const requestDangerAction = useCallback((type) => {
    const canvas = fabricRef.current;
    const active = selectedObject();
    if ((type === "delete" || type === "warpCanvas") && !active && type === "delete") {
      setStatus("Select a layer before deleting.");
      return;
    }
    if (type === "flatten" && (!canvas || canvas.getObjects().length < 2)) {
      setStatus("Flatten needs at least two layers.");
      return;
    }
    const targetCount = active ? getActiveTargets(active).length : 0;
    const details = {
      delete: {
        title: "Delete selected layers?",
        body: targetCount > 1
          ? `${targetCount} selected layers will be removed. Undo can restore them.`
          : `${active ? objectLabel(active) : "The selected layer"} will be removed. Undo can restore it.`,
        actionLabel: "Delete Layers",
      },
      flatten: {
        title: "Flatten canvas?",
        body: `${canvas ? canvas.getObjects().length : 0} layers will become one raster layer. Undo can restore the editable layers.`,
        actionLabel: "Flatten Canvas",
      },
      warpCanvas: {
        title: "Warp whole canvas?",
        body: `The full canvas will become one rasterized ${warpMode} warp layer. Undo can restore the editable layers.`,
        actionLabel: "Warp Canvas",
      },
    }[type];
    if (details) setDangerAction({ type, ...details });
  }, [selectedObject, warpMode]);

  const cancelDangerAction = useCallback(() => {
    setDangerAction(null);
    setStatus("Action cancelled.");
  }, []);

  const deleteSelection = useCallback(() => {
    requestDangerAction("delete");
  }, [requestDangerAction]);

  const duplicateSelection = useCallback(() => {
    const canvas = fabricRef.current;
    const active = selectedObject();
    if (!canvas || !active) return;
    captureHistory(`duplicate ${objectLabel(active)}`);
    active.clone((cloned) => {
      cloned.set({ left: (active.left || 0) + 34, top: (active.top || 0) + 34 });
      ensureObjectMeta(cloned, `${objectLabel(active)} copy`);
      canvas.add(cloned);
      canvas.setActiveObject(cloned);
      canvas.renderAll();
      scheduleLayerRefresh();
    }, ["data", "visible", "lockMovementX", "lockMovementY", "lockScalingX", "lockScalingY", "lockRotation"]);
  }, [captureHistory, scheduleLayerRefresh, selectedObject]);

  const moveLayer = useCallback((direction) => {
    const canvas = fabricRef.current;
    const active = selectedObject();
    if (!canvas || !active) return;
    captureHistory(`move ${objectLabel(active)}`);
    if (direction === "front") canvas.bringToFront(active);
    if (direction === "back") canvas.sendToBack(active);
    if (direction === "forward") canvas.bringForward(active);
    if (direction === "backward") canvas.sendBackwards(active);
    canvas.renderAll();
    scheduleLayerRefresh();
  }, [captureHistory, scheduleLayerRefresh, selectedObject]);

  const toggleLock = useCallback(() => {
    const obj = selectedObject();
    const canvas = fabricRef.current;
    if (!obj || !canvas) return;
    const next = !(obj.lockMovementX && obj.lockScalingX);
    captureHistory(`${next ? "lock" : "unlock"} ${objectLabel(obj)}`);
    obj.set({
      lockMovementX: next,
      lockMovementY: next,
      lockScalingX: next,
      lockScalingY: next,
      lockRotation: next,
    });
    canvas.renderAll();
    scheduleLayerRefresh();
  }, [captureHistory, scheduleLayerRefresh, selectedObject]);

  const toggleVisible = useCallback((id) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const obj = canvas.getObjects().find((candidate) => candidate.data && candidate.data.id === id);
    if (!obj) return;
    captureHistory(`${obj.visible === false ? "show" : "hide"} ${objectLabel(obj)}`);
    obj.visible = obj.visible === false;
    canvas.renderAll();
    scheduleLayerRefresh();
  }, [captureHistory, scheduleLayerRefresh]);

  const selectLayer = useCallback((id, event) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const obj = canvas.getObjects().find((candidate) => candidate.data && candidate.data.id === id);
    if (!obj) return;
    const additive = Boolean(event && (event.shiftKey || event.metaKey || event.ctrlKey));
    if (additive) {
      const active = canvas.getActiveObject();
      const targets = active ? getActiveTargets(active) : [];
      const nextTargets = targets.includes(obj)
        ? targets.filter((target) => target !== obj)
        : targets.concat(obj);
      canvas.discardActiveObject();
      if (nextTargets.length > 1) {
        canvas.setActiveObject(new fabric.ActiveSelection(nextTargets, { canvas }));
      } else if (nextTargets.length === 1) {
        canvas.setActiveObject(nextTargets[0]);
      }
    } else {
      canvas.setActiveObject(obj);
    }
    canvas.renderAll();
    scheduleLayerRefresh();
  }, [scheduleLayerRefresh]);

  const nudgeSelection = useCallback((dx, dy) => {
    const canvas = fabricRef.current;
    const active = selectedObject();
    if (!canvas || !active) return;
    captureHistory(`nudge ${objectLabel(active)}`);
    getActiveTargets(active).forEach((obj) => {
      obj.set({
        left: (obj.left || 0) + dx,
        top: (obj.top || 0) + dy,
      });
      obj.setCoords();
    });
    canvas.renderAll();
    scheduleLayerRefresh();
  }, [captureHistory, scheduleLayerRefresh, selectedObject]);

  const handleEditorKeyDown = useCallback((event) => {
    const tag = String(event.target && event.target.tagName ? event.target.tagName : "").toLowerCase();
    const editingText = fabricRef.current?.getActiveObject?.()?.isEditing;
    if (["input", "select", "textarea"].includes(tag) || editingText) return;
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === "Escape") {
      if (dangerAction) {
        event.preventDefault();
        cancelDangerAction();
      }
      return;
    }
    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redoCanvas();
      else undoCanvas();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteSelection();
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      nudgeSelection(0, -step);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      nudgeSelection(0, step);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      nudgeSelection(-step, 0);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      nudgeSelection(step, 0);
    }
  }, [cancelDangerAction, dangerAction, deleteSelection, nudgeSelection, redoCanvas, undoCanvas]);

  const replaceActiveWithRaster = useCallback(async (active, blob, name) => {
    const canvas = fabricRef.current;
    if (!canvas || !active) throw new Error("Select one or more layers first.");
    const bounds = active.getBoundingRect(true, true);
    const targets = getActiveTargets(active);
    const objectStack = canvas.getObjects();
    const stackIndexes = targets
      .map((obj) => objectStack.indexOf(obj))
      .filter((index) => index >= 0);
    const insertIndex = stackIndexes.length ? Math.min(...stackIndexes) : objectStack.indexOf(active);
    const image = await loadImageFromBlob(blob);
    image.set({
      left: bounds.left,
      top: bounds.top,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      originX: "left",
      originY: "top",
      selectable: true,
      evented: true,
    });
    ensureObjectMeta(image, name);
    canvas.discardActiveObject();
    targets.forEach((obj) => canvas.remove(obj));
    canvas.insertAt(image, Math.max(0, insertIndex), false);
    canvas.setActiveObject(image);
    image.setCoords();
    canvas.renderAll();
    scheduleLayerRefresh();
    return image;
  }, [scheduleLayerRefresh]);

  const rasterizeActiveLayer = useCallback(async (name, transform) => {
    const active = selectedObject();
    if (!active) throw new Error("Select one or more layers first.");
    captureHistory(name);
    const snapshot = await renderFabricObjectSnapshot(active);
    const blob = transform
      ? await transform(snapshot.canvas)
      : await canvasElementToBlob(snapshot.canvas, "image/png");
    return replaceActiveWithRaster(active, blob, name);
  }, [captureHistory, replaceActiveWithRaster, selectedObject]);

  const groupSelection = useCallback(() => {
    const canvas = fabricRef.current;
    const active = selectedObject();
    if (!canvas || !active) return;
    if (active.type !== "activeSelection" || typeof active.toGroup !== "function") {
      setStatus("Select multiple layers to group.");
      return;
    }
    captureHistory("group layers");
    const group = active.toGroup();
    ensureObjectMeta(group, `Group ${layers.length}`);
    canvas.setActiveObject(group);
    canvas.renderAll();
    scheduleLayerRefresh();
    setStatus("Layers grouped.");
  }, [captureHistory, layers.length, scheduleLayerRefresh, selectedObject]);

  const ungroupSelection = useCallback(() => {
    const canvas = fabricRef.current;
    const active = selectedObject();
    if (!canvas || !active) return;
    if (active.type !== "group" || typeof active.toActiveSelection !== "function") {
      setStatus("Select a group to ungroup.");
      return;
    }
    captureHistory(`ungroup ${objectLabel(active)}`);
    active.toActiveSelection();
    canvas.renderAll();
    scheduleLayerRefresh();
    setStatus("Group released.");
  }, [captureHistory, scheduleLayerRefresh, selectedObject]);

  const mergeSelection = useCallback(async () => {
    try {
      const active = selectedObject();
      if (!active || getActiveTargets(active).length < 2) {
        setStatus("Select at least two layers to merge.");
        return;
      }
      setStatus("Merging selected layers...");
      const image = await rasterizeActiveLayer("Merged layer");
      ensureObjectMeta(image, "Merged layer").mergeKind = "selection";
      setStatus("Selected layers merged.");
    } catch (error) {
      setStatus(`Merge failed: ${error.message}`);
    }
  }, [rasterizeActiveLayer, selectedObject]);

  const performFlattenCanvas = useCallback(async () => {
    try {
      const canvas = fabricRef.current;
      if (!canvas) throw new Error("Canvas is not ready.");
      if (canvas.getObjects().length < 2) throw new Error("Flatten needs at least two layers.");
      setStatus("Flattening canvas...");
      captureHistory("flatten canvas");
      const blob = await canvasBlob("png");
      canvas.getObjects().forEach((obj) => canvas.remove(obj));
      canvas.backgroundColor = "#f8f2df";
      const image = await loadImageFromBlob(blob);
      image.set({ left: 0, top: 0, selectable: true, evented: true });
      ensureObjectMeta(image, "Flattened canvas").mergeKind = "flatten";
      canvas.add(image);
      canvas.setActiveObject(image);
      canvas.renderAll();
      scheduleLayerRefresh();
      setStatus("Canvas flattened to one layer.");
    } catch (error) {
      setStatus(`Flatten failed: ${error.message}`);
    }
  }, [canvasBlob, captureHistory, scheduleLayerRefresh]);

  const flattenCanvas = useCallback(() => {
    requestDangerAction("flatten");
  }, [requestDangerAction]);

  const warpSelection = useCallback(async () => {
    try {
      const active = selectedObject();
      if (!active) {
        setStatus("Select a layer before warping.");
        return;
      }
      setStatus(`Warping selection with glfx ${warpMode}...`);
      const image = await rasterizeActiveLayer(`Warp ${warpMode}`, (source) => (
        applyGlfxDistortionToCanvas(source, warpMode, warpStrength)
      ));
      ensureObjectMeta(image, `Warp ${warpMode}`).warpMode = warpMode;
      setStatus(`glfx ${warpMode} warp applied to selection.`);
    } catch (error) {
      setStatus(`Warp failed: ${error.message}`);
    }
  }, [rasterizeActiveLayer, selectedObject, warpMode, warpStrength]);

  const performWarpCanvas = useCallback(async () => {
    try {
      const canvas = fabricRef.current;
      if (!canvas) throw new Error("Canvas is not ready.");
      setStatus(`Warping canvas with glfx ${warpMode}...`);
      captureHistory(`warp canvas ${warpMode}`);
      canvas.discardActiveObject();
      canvas.renderAll();
      const source = canvas.lowerCanvasEl || canvas.getElement();
      const blob = applyGlfxDistortionToCanvas(source, warpMode, warpStrength);
      canvas.getObjects().forEach((obj) => canvas.remove(obj));
      canvas.backgroundColor = "#f8f2df";
      const image = await loadImageFromBlob(blob);
      image.set({ left: 0, top: 0, selectable: true, evented: true });
      ensureObjectMeta(image, `Warped canvas`).warpMode = warpMode;
      canvas.add(image);
      canvas.setActiveObject(image);
      canvas.renderAll();
      scheduleLayerRefresh();
      setStatus(`glfx ${warpMode} warp applied to canvas.`);
    } catch (error) {
      setStatus(`Canvas warp failed: ${error.message}`);
    }
  }, [captureHistory, scheduleLayerRefresh, warpMode, warpStrength]);

  const warpCanvas = useCallback(() => {
    requestDangerAction("warpCanvas");
  }, [requestDangerAction]);

  const confirmDangerAction = useCallback(() => {
    const type = dangerAction && dangerAction.type;
    setDangerAction(null);
    if (type === "delete") performDeleteSelection();
    if (type === "flatten") performFlattenCanvas();
    if (type === "warpCanvas") performWarpCanvas();
  }, [dangerAction, performDeleteSelection, performFlattenCanvas, performWarpCanvas]);

  const exportBitmap = useCallback(async (format) => {
    try {
      setStatus(`Exporting ${format.toUpperCase()}...`);
      const blob = await canvasBlob(format, 0.94);
      downloadBlob(blob, `${safeSlug(projectName)}.${format === "jpeg" ? "jpg" : format}`);
      setStatus(`${format.toUpperCase()} exported.`);
    } catch (error) {
      setStatus(`Export failed: ${error.message}`);
    }
  }, [canvasBlob, projectName]);

  const exportSvg = useCallback(() => {
    try {
      const canvas = fabricRef.current;
      if (!canvas) throw new Error("Canvas is not ready.");
      const svg = canvas.toSVG();
      downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${safeSlug(projectName)}.svg`);
      setStatus("SVG exported.");
    } catch (error) {
      setStatus(`SVG export failed: ${error.message}`);
    }
  }, [projectName]);

  const exportWorkerImage = useCallback(async (kind) => {
    try {
      setStatus(`Exporting ${kind.toUpperCase()}...`);
      const image = await canvasPixels();
      const job = kind === "gif" ? "encodeGif" : "encodePsd";
      const result = await workerRequest(job, image, [image.pixels]);
      downloadBlob(new Blob([result.buffer], { type: result.mimeType }), `${safeSlug(projectName)}.${kind}`);
      setStatus(`${kind.toUpperCase()} exported.`);
    } catch (error) {
      setStatus(`${kind.toUpperCase()} export failed: ${error.message}`);
    }
  }, [canvasPixels, projectName, workerRequest]);

  const loadFfmpeg = useCallback(async () => {
    const runtime = window.FFmpegWASM;
    if (!runtime || !runtime.FFmpeg) throw new Error("FFmpeg.wasm runtime is not loaded.");
    if (!ffmpegRef.current) {
      const ffmpeg = new runtime.FFmpeg();
      ffmpeg.on("progress", ({ progress }) => {
        if (Number.isFinite(progress)) setStatus(`FFmpeg transcode ${Math.round(progress * 100)}%...`);
      });
      ffmpegRef.current = ffmpeg;
    }
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg.loaded) {
      setStatus("Loading FFmpeg.wasm...");
      await ffmpeg.load({
        coreURL: new URL(FFMPEG_CORE_URL, window.location.href).href,
        wasmURL: new URL(FFMPEG_WASM_URL, window.location.href).href,
      });
    }
    return ffmpeg;
  }, []);

  const recordCanvasClip = useCallback(async (mimeType, options) => {
    const canvas = fabricRef.current;
    if (!canvas) throw new Error("Canvas is not ready.");
    const element = canvas.getElement();
    if (!element.captureStream || !window.MediaRecorder) throw new Error("Canvas video recording is not supported.");
    const mode = options?.mode || "hold";
    const fps = Math.max(1, Math.min(60, Math.round(Number(options?.fps || 24))));
    const durationMs = Math.max(500, Math.min(15_000, Number(options?.durationSeconds || 2) * 1000));
    const stream = element.captureStream(fps);
    const [videoTrack] = stream.getVideoTracks ? stream.getVideoTracks() : [];
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];
    const originalOpacity = new Map(canvas.getObjects().map((obj) => [obj, obj.opacity]));
    let frameId = 0;
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) chunks.push(event.data);
    };
    const done = new Promise((resolve) => {
      recorder.onstop = resolve;
    });
    try {
      recorder.start();
      const start = performance.now();
      const animateFrame = () => {
        const elapsed = performance.now() - start;
        const progress = Math.min(1, elapsed / durationMs);
        if (mode === "pulse") {
          canvas.getObjects().forEach((obj, index) => {
            if (index % 2 === 0) obj.opacity = 0.88 + Math.sin((elapsed / 320) + index) * 0.08;
          });
        } else if (mode === "reveal") {
          const objects = canvas.getObjects();
          objects.forEach((obj, index) => {
            const threshold = objects.length <= 1 ? 0 : index / Math.max(1, objects.length - 1);
            obj.opacity = progress >= threshold ? originalOpacity.get(obj) : 0;
          });
        }
        canvas.renderAll();
        if (videoTrack && typeof videoTrack.requestFrame === "function") videoTrack.requestFrame();
        if (elapsed < durationMs) frameId = requestAnimationFrame(animateFrame);
      };
      frameId = requestAnimationFrame(animateFrame);
      await new Promise((resolve) => setTimeout(resolve, durationMs + 120));
      recorder.stop();
      await done;
      return new Blob(chunks, { type: mimeType });
    } finally {
      if (frameId) cancelAnimationFrame(frameId);
      stream.getTracks().forEach((track) => track.stop());
      originalOpacity.forEach((opacity, obj) => {
        obj.opacity = opacity;
      });
      canvas.renderAll();
    }
  }, []);

  const transcodeClipToMp4 = useCallback(async (blob, inputExtension) => {
    const ffmpeg = await loadFfmpeg();
    const stamp = `${Date.now()}-${Math.round(Math.random() * 100000)}`;
    const inputName = `broot-${stamp}.${inputExtension}`;
    const outputName = `broot-${stamp}.mp4`;
    await ffmpeg.writeFile(inputName, new Uint8Array(await blob.arrayBuffer()));
    await ffmpeg.exec([
      "-y",
      "-i",
      inputName,
      "-vf",
      "fps=24,format=yuv420p",
      "-movflags",
      "+faststart",
      "-an",
      outputName,
    ]);
    const data = await ffmpeg.readFile(outputName);
    await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)]);
    return new Blob([data], { type: "video/mp4" });
  }, [loadFfmpeg]);

  const exportVideo = useCallback(async () => {
    try {
      if (!window.MediaRecorder) throw new Error("Canvas video recording is not supported.");
      const ffmpegAvailable = Boolean(window.FFmpegWASM && window.FFmpegWASM.FFmpeg);
      const mp4 = ["video/mp4;codecs=avc1.42E01E", "video/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const webm = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      const mimeType = ffmpegAvailable ? (webm || mp4) : (mp4 || webm);
      if (!mimeType) throw new Error("This browser does not expose an MP4 or WebM recorder.");
      const sourceExtension = mimeType.includes("webm") ? "webm" : "mp4";
      const modeLabel = VIDEO_EXPORT_MODES.find((mode) => mode.value === videoMode)?.label || "Still hold";
      setStatus(ffmpegAvailable ? `Recording ${modeLabel} canvas clip for FFmpeg...` : `Recording ${modeLabel} ${sourceExtension.toUpperCase()}...`);
      const recorded = await recordCanvasClip(mimeType, {
        mode: videoMode,
        durationSeconds: videoDuration,
        fps: videoFps,
      });
      if (ffmpegAvailable) {
        try {
          const mp4Blob = sourceExtension === "mp4" ? await transcodeClipToMp4(recorded, "mp4") : await transcodeClipToMp4(recorded, "webm");
          downloadBlob(mp4Blob, `${safeSlug(projectName)}.mp4`);
          setStatus("MP4 exported with FFmpeg.wasm.");
          return;
        } catch (error) {
          downloadBlob(recorded, `${safeSlug(projectName)}.${sourceExtension}`);
          setStatus(`FFmpeg failed, exported ${sourceExtension.toUpperCase()} fallback: ${error.message}`);
          return;
        }
      }
      downloadBlob(recorded, `${safeSlug(projectName)}.${sourceExtension}`);
      setStatus(`${sourceExtension.toUpperCase()} exported.`);
    } catch (error) {
      setStatus(`Video export failed: ${error.message}`);
    }
  }, [projectName, recordCanvasClip, transcodeClipToMp4, videoDuration, videoFps, videoMode]);

  const bakeFx = useCallback(async () => {
    try {
      const canvas = fabricRef.current;
      if (!canvas) throw new Error("Canvas is not ready.");
      setStatus("Baking WebGL layer...");
      captureHistory(`bake WebGL ${effectMode}`);
      canvas.discardActiveObject();
      canvas.renderAll();
      const source = canvas.lowerCanvasEl || canvas.getElement();
      const blob = await renderWebGlEffect(source, effectMode);
      const image = await loadImageFromBlob(blob);
      image.set({ left: 0, top: 0, selectable: true, evented: true });
      ensureObjectMeta(image, `WebGL ${effectMode}`);
      canvas.add(image);
      canvas.setActiveObject(image);
      canvas.renderAll();
      setStatus(`WebGL ${effectMode} layer baked.`);
    } catch (error) {
      setStatus(`WebGL bake failed: ${error.message}`);
    }
  }, [captureHistory, effectMode]);

  const configureWalletClient = useCallback((wallet, config) => {
    if (!wallet || !wallet.client) return wallet;
    wallet.client.network = config.beaconNetwork;
    wallet.client.preferredNetwork = "mainnet";
    wallet.client.featuredWallets = ["kukai", "temple", "umami"];
    disableWalletMetrics(wallet.client);
    return wallet;
  }, []);

  const createWallet = useCallback((config, options) => {
    if (typeof window.TZ.installOctezPrimaryWallet === "function") {
      window.TZ.installOctezPrimaryWallet({ patchBeacon: true });
    }
    const WalletClass = window.TZ.OctezPrimaryWallet || window.TZ.BeaconWallet;
    if (!WalletClass) throw new Error("Tezos wallet libraries are not loaded.");
    const wallet = new WalletClass({
      name: "Broot",
      network: config.beaconNetwork,
      preferredNetwork: "mainnet",
      enableMetrics: false,
      resetClient: !(options && options.resetClient === false),
      featuredWallets: ["kukai", "temple", "umami"],
    });
    return configureWalletClient(wallet, config);
  }, [configureWalletClient]);

  const ensureWalletRuntime = useCallback((networkKey, options) => {
    if (!window.TZ || !window.TZ.TezosToolkit) {
      throw new Error("Tezos wallet libraries are not loaded.");
    }
    const config = NETWORKS[networkKey];
    if (!config) throw new Error("Unknown Tezos network.");
    const currentNetwork = walletNetworkRef.current;
    let tezos = tezosRef.current;
    if (!tezos || currentNetwork !== networkKey || options?.freshToolkit) {
      tezos = new window.TZ.TezosToolkit(config.rpc);
      tezosRef.current = tezos;
    }
    let wallet = walletRef.current;
    if (!wallet || currentNetwork !== networkKey || options?.freshWallet) {
      wallet = createWallet(config, options);
      walletRef.current = wallet;
    } else {
      configureWalletClient(wallet, config);
    }
    tezos.setWalletProvider(wallet);
    walletNetworkRef.current = networkKey;
    return { config, tezos, wallet };
  }, [configureWalletClient, createWallet]);

  const restoreWalletSession = useCallback(async (networkKey, options) => {
    const config = NETWORKS[networkKey];
    const stored = readWalletSession(networkKey);
    if (!stored || stored.network !== networkKey || !stored.address) {
      setWalletState((prev) => ({
        ...prev,
        address: "",
        chainId: "",
        connected: false,
        restoring: false,
      }));
      return "";
    }
    try {
      const { tezos, wallet } = ensureWalletRuntime(networkKey, { resetClient: false });
      const active = wallet.client && typeof wallet.client.getActiveAccount === "function"
        ? await wallet.client.getActiveAccount()
        : null;
      const address = accountAddress(active);
      if (!address || !accountMatchesNetwork(active, config) || address !== stored.address) {
        clearWalletSession(networkKey);
        throw new Error("stored account no longer matches the active wallet session");
      }
      const chainId = await tezos.rpc.getChainId();
      if (chainId !== config.chainId) throw new Error(`RPC chain mismatch: expected ${config.chainId}, got ${chainId}.`);
      saveWalletSession(networkKey, address, config.rpc);
      setWalletState({
        address,
        chainId,
        connected: true,
        connecting: false,
        restoring: false,
      });
      if (!options?.silent) setStatus(`Wallet restored: ${shortAddress(address)}.`);
      return address;
    } catch (error) {
      clearWalletSession(networkKey);
      walletRef.current = null;
      tezosRef.current = null;
      walletNetworkRef.current = "";
      setWalletState({
        address: "",
        chainId: "",
        connected: false,
        connecting: false,
        restoring: false,
      });
      if (!options?.silent) setStatus(`Wallet session expired. Connect again. ${error.message}`);
      return "";
    }
  }, [ensureWalletRuntime]);

  useEffect(() => {
    saveStoredNetwork(network);
    let cancelled = false;
    setWalletState((prev) => ({
      ...prev,
      address: "",
      chainId: "",
      connected: false,
      connecting: false,
      restoring: true,
    }));
    restoreWalletSession(network, { silent: true }).then((address) => {
      if (!cancelled && address) setStatus(`Wallet restored: ${shortAddress(address)}.`);
    });
    return () => {
      cancelled = true;
    };
  }, [network, restoreWalletSession]);

  const connectWallet = useCallback(async () => {
    if (walletState.connected && walletState.address) {
      setStatus(`Wallet already connected: ${shortAddress(walletState.address)}.`);
      return walletState.address;
    }
    if (connectPromiseRef.current) return connectPromiseRef.current;
    setWalletState((prev) => ({ ...prev, connecting: true, restoring: false }));
    connectPromiseRef.current = (async () => {
      const config = NETWORKS[network];
      setStatus(`Connecting wallet on ${config.label}...`);
      const { tezos, wallet } = ensureWalletRuntime(network, { freshWallet: true });
      const chainId = await tezos.rpc.getChainId();
      if (chainId !== config.chainId) throw new Error(`RPC chain mismatch: expected ${config.chainId}, got ${chainId}.`);
      await wallet.requestPermissions();
      const address = await wallet.getPKH();
      const active = wallet.client && typeof wallet.client.getActiveAccount === "function"
        ? await wallet.client.getActiveAccount()
        : null;
      if (active && !accountMatchesNetwork(active, config)) {
        throw new Error(`Wallet connected on ${active.network?.type || "unknown"}, but Broot is set to ${config.label}.`);
      }
      saveWalletSession(network, address, config.rpc);
      setWalletState({
        address,
        chainId,
        connected: true,
        connecting: false,
        restoring: false,
      });
      setStatus(`Wallet connected: ${shortAddress(address)}.`);
      return address;
    })();
    try {
      return await connectPromiseRef.current;
    } catch (error) {
      setWalletState({
        address: "",
        chainId: "",
        connected: false,
        connecting: false,
        restoring: false,
      });
      setStatus(`Wallet connect failed: ${error.message}`);
      return "";
    } finally {
      connectPromiseRef.current = null;
      setWalletState((prev) => ({ ...prev, connecting: false }));
    }
  }, [ensureWalletRuntime, network, walletState.address, walletState.connected]);

  const disconnectWallet = useCallback(async () => {
    const networkKey = walletNetworkRef.current || network;
    try {
      const wallet = walletRef.current;
      if (wallet && typeof wallet.clearActiveAccount === "function") await wallet.clearActiveAccount();
    } catch (_) {
      /* stale wallet sessions can already be gone */
    }
    clearWalletSession(networkKey);
    walletRef.current = null;
    tezosRef.current = null;
    walletNetworkRef.current = "";
    setWalletState({
      address: "",
      chainId: "",
      connected: false,
      connecting: false,
      restoring: false,
    });
    setStatus("Wallet disconnected.");
  }, [network]);

  const csrfFetch = useCallback(async (url, options) => {
    const init = options || {};
    const headers = new Headers(init.headers || {});
    if (String(init.method || "GET").toUpperCase() !== "GET") {
      const csrf = await fetch("/api/auth/csrf-token", { credentials: "same-origin" }).then((res) => res.json());
      headers.set("X-CSRF-Token", csrf.csrfToken || "");
    }
    return fetch(url, { ...init, headers, credentials: "same-origin" });
  }, []);

  const pinBlobToWtfos = useCallback(async (blob, filename) => {
    const form = new FormData();
    form.append("file", blob, filename);
    const res = await csrfFetch("/api/macaroni/ipfs/pin", { method: "POST", body: form });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const json = await res.json();
    const cid = json.cid || json.IpfsHash || "";
    if (!cid) throw new Error("Pin response did not include a CID.");
    return cid;
  }, [csrfFetch]);

  const pinCurrentPng = useCallback(async () => {
    try {
      setStatus("Pinning PNG through wtfOS IPFS...");
      const blob = await canvasBlob("png");
      const cid = await pinBlobToWtfos(blob, `${safeSlug(projectName)}.png`);
      setArtifactCid(cid);
      setStatus(`Pinned artifact CID ${cid}.`);
    } catch (error) {
      setStatus(`IPFS pin failed: ${error.message}`);
    }
  }, [canvasBlob, pinBlobToWtfos, projectName]);

  const buildArtifacts = useCallback(async (metadataUri, overrides) => {
    const canvas = fabricRef.current;
    if (!canvas) throw new Error("Canvas is not ready.");
    const artifact = overrides?.artifactCid ?? artifactCid;
    const metadata = overrides?.metadataCid ?? metadataCid;
    const targetTokenId = overrides?.tokenId ?? tokenId;
    const amount = overrides?.editionAmount ?? editionAmount;
    const walletAddress = overrides?.walletAddress ?? walletState.address;
    return workerRequest("buildArtifacts", {
      name: projectName,
      description,
      tags,
      royaltyBps: Number(royaltyBps),
      tokenId: Number(targetTokenId),
      amount: Number(amount),
      network,
      walletAddress,
      artifactUri: artifact ? `ipfs://${artifact}` : "",
      metadataUri: metadataUri || (metadata ? `ipfs://${metadata}` : ""),
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      fileName: `${safeSlug(projectName)}.png`,
      mimeType: "image/png",
      svg: canvas.toSVG(),
    });
  }, [artifactCid, description, editionAmount, metadataCid, network, projectName, royaltyBps, tags, tokenId, walletState.address, workerRequest]);

  const downloadMetadata = useCallback(async () => {
    try {
      const result = await buildArtifacts("");
      const json = JSON.stringify(result.artifacts.metadata, null, 2);
      downloadBlob(new Blob([json], { type: "application/json" }), `${safeSlug(projectName)}.metadata.json`);
      setStatus("Token metadata exported.");
    } catch (error) {
      setStatus(`Metadata export failed: ${error.message}`);
    }
  }, [buildArtifacts, projectName]);

  const pinMetadata = useCallback(async () => {
    try {
      setStatus("Pinning token metadata...");
      const result = await buildArtifacts("");
      const blob = new Blob([JSON.stringify(result.artifacts.metadata)], { type: "application/json" });
      const cid = await pinBlobToWtfos(blob, `${safeSlug(projectName)}.json`);
      setMetadataCid(cid);
      setStatus(`Pinned metadata CID ${cid}.`);
    } catch (error) {
      setStatus(`Metadata pin failed: ${error.message}`);
    }
  }, [buildArtifacts, pinBlobToWtfos, projectName]);

  const fetchNextHenTokenId = useCallback(async () => {
    const res = await fetch(HEN_STORAGE_API);
    if (!res.ok) throw new Error(`HEN storage lookup failed: ${res.status}`);
    const storage = await res.json();
    const next = Number(storage.all_tokens);
    if (!Number.isInteger(next) || next < 0) throw new Error("HEN storage did not include a valid next token id.");
    return next;
  }, []);

  const ensureOperationWallet = useCallback(async (requiredNetwork) => {
    if (network !== requiredNetwork) {
      throw new Error(`Switch Broot to ${NETWORKS[requiredNetwork].label} before publishing to HEN.`);
    }
    const config = NETWORKS[requiredNetwork];
    let address = walletState.address;
    if (!walletState.connected || !address) {
      address = await restoreWalletSession(requiredNetwork);
    }
    if (!address) throw new Error("Connect your wallet once before publishing.");
    const { tezos, wallet } = ensureWalletRuntime(requiredNetwork, { resetClient: false });
    const chainId = await tezos.rpc.getChainId();
    if (chainId !== config.chainId) throw new Error(`RPC chain mismatch: expected ${config.chainId}, got ${chainId}.`);
    const active = wallet.client && typeof wallet.client.getActiveAccount === "function"
      ? await wallet.client.getActiveAccount()
      : null;
    const activeAddress = accountAddress(active) || (typeof wallet.getPKH === "function" ? await wallet.getPKH() : "");
    if (!activeAddress) throw new Error("No active wallet account. Connect again.");
    if (active && !accountMatchesNetwork(active, config)) {
      throw new Error(`Wallet is active on ${active.network?.type || "unknown"}, not ${config.label}.`);
    }
    if (activeAddress !== address) {
      clearWalletSession(requiredNetwork);
      throw new Error(`Active wallet changed to ${shortAddress(activeAddress)}. Connect again before publishing.`);
    }
    setWalletState({
      address: activeAddress,
      chainId,
      connected: true,
      connecting: false,
      restoring: false,
    });
    saveWalletSession(requiredNetwork, activeAddress, config.rpc);
    return { tezos, wallet, address: activeAddress, config };
  }, [ensureWalletRuntime, network, restoreWalletSession, walletState.address, walletState.connected]);

  const prepareHenMint = useCallback(async () => {
    if (mintState.busy) return;
    setMintState((prev) => ({ ...prev, busy: true, opHash: "", tokenId: "", storageFeeMutez: 0 }));
    setHenReview({ open: false, prepared: null });
    preparedMintRef.current = null;
    try {
      const amount = Math.max(1, Math.floor(Number(editionAmount || 1)));
      setStatus("Preparing HEN mint review on mainnet...");
      const { tezos, address, config } = await ensureOperationWallet("mainnet");
      const henTokenId = await fetchNextHenTokenId();
      setTokenId(henTokenId);

      let artifact = artifactCid;
      if (!artifact) {
        setStatus("Pinning current canvas PNG before HEN mint...");
        artifact = await pinBlobToWtfos(await canvasBlob("png"), `${safeSlug(projectName)}.png`);
        setArtifactCid(artifact);
      }

      setStatus("Pinning HEN token metadata...");
      const result = await buildArtifacts("", {
        artifactCid: artifact,
        tokenId: henTokenId,
        editionAmount: amount,
        walletAddress: address,
      });
      const metadataBlob = new Blob([JSON.stringify(result.artifacts.metadata)], { type: "application/json" });
      const metadata = await pinBlobToWtfos(metadataBlob, `${safeSlug(projectName)}.json`);
      setMetadataCid(metadata);

      const metadataUri = `ipfs://${metadata}`;
      const contract = await tezos.wallet.at(HEN_TOKEN_CONTRACT);
      const mintParams = {
        address,
        amount,
        token_id: henTokenId,
        token_info: createTokenInfoMap(metadataUri),
      };
      const method = contract.methodsObject.mint(mintParams);
      setStatus(`Estimating HEN mint #${henTokenId} fee and storage...`);
      const limits = await estimateWalletOp(tezos, method, {}, HEN_MINT_LIMIT_OPTIONS);
      const prepared = {
        address,
        amount,
        artifactCid: artifact,
        chainId: config.chainId,
        contract: HEN_TOKEN_CONTRACT,
        explorer: config.explorer,
        feeMutez: limits.fee,
        gasLimit: limits.gasLimit,
        metadataCid: metadata,
        metadataUri,
        network: "mainnet",
        networkLabel: config.label,
        storageFeeMutez: limits.storageFeeMutez,
        storageLimit: limits.storageLimit,
        tokenId: henTokenId,
      };
      preparedMintRef.current = { prepared, mintParams, limits };
      setMintState({
        busy: false,
        tokenId: String(henTokenId),
        opHash: "",
        storageFeeMutez: limits.storageFeeMutez,
      });
      setHenReview({ open: true, prepared });
      setStatus(`HEN mint #${henTokenId} is ready to review.`);
    } catch (error) {
      preparedMintRef.current = null;
      setHenReview({ open: false, prepared: null });
      setMintState((prev) => ({ ...prev, busy: false }));
      setStatus(`HEN mint prep failed: ${error.message}`);
    }
  }, [
    artifactCid,
    buildArtifacts,
    canvasBlob,
    editionAmount,
    ensureOperationWallet,
    fetchNextHenTokenId,
    mintState.busy,
    pinBlobToWtfos,
    projectName,
  ]);

  const signPreparedHenMint = useCallback(async () => {
    if (mintState.busy) return;
    const preparedRecord = preparedMintRef.current;
    if (!preparedRecord || !preparedRecord.prepared) {
      setStatus("Prepare a HEN mint review before signing.");
      return;
    }
    setMintState((prev) => ({ ...prev, busy: true, opHash: "" }));
    try {
      const { tezos, address, config } = await ensureOperationWallet("mainnet");
      const { prepared, mintParams, limits } = preparedRecord;
      if (address !== prepared.address) throw new Error("Connected wallet changed. Prepare the HEN mint again.");
      const contract = await tezos.wallet.at(HEN_TOKEN_CONTRACT);
      const method = contract.methodsObject.mint(mintParams);
      const sendOptions = {
        gasLimit: limits.gasLimit,
        storageLimit: limits.storageLimit,
      };
      if (limits.fee != null) sendOptions.fee = limits.fee;
      setStatus(`Approve HEN mint #${prepared.tokenId} in your wallet. You pay gas and storage.`);
      const op = await method.send(sendOptions);
      const opHash = op.opHash || op.hash || "";
      setMintState({
        busy: true,
        tokenId: String(prepared.tokenId),
        opHash,
        storageFeeMutez: limits.storageFeeMutez,
      });
      setStatus(`HEN mint submitted: ${opHash || "wallet operation"}. Waiting for confirmation...`);
      if (typeof op.confirmation === "function") await op.confirmation(1);
      setMintState({
        busy: false,
        tokenId: String(prepared.tokenId),
        opHash,
        storageFeeMutez: limits.storageFeeMutez,
      });
      const opText = opHash ? ` ${config.explorer}${opHash}` : "";
      setHenReview({ open: false, prepared: null });
      preparedMintRef.current = null;
      setStatus(`HEN mint confirmed: token #${prepared.tokenId}.${opText}`);
    } catch (error) {
      setMintState((prev) => ({ ...prev, busy: false }));
      setStatus(`HEN mint failed: ${error.message}`);
    }
  }, [ensureOperationWallet, mintState.busy]);

  const cancelHenReview = useCallback(() => {
    preparedMintRef.current = null;
    setHenReview({ open: false, prepared: null });
    setMintState((prev) => ({ ...prev, busy: false }));
    setStatus("HEN mint review cancelled. Pinned CIDs are kept for reuse.");
  }, []);

  const downloadFa2Artifact = useCallback(async () => {
    try {
      const result = await buildArtifacts(metadataCid ? `ipfs://${metadataCid}` : "");
      const json = JSON.stringify(result.artifacts.fa2Artifact, null, 2);
      downloadBlob(new Blob([json], { type: "application/json" }), `${safeSlug(projectName)}.fa2-artifact.json`);
      setStatus("FA2 artifact generated.");
    } catch (error) {
      setStatus(`FA2 artifact failed: ${error.message}`);
    }
  }, [buildArtifacts, metadataCid, projectName]);

  const saveProjectFile = useCallback(async () => {
    try {
      const record = buildProjectRecord("file");
      const blob = new Blob([JSON.stringify(record, null, 2)], { type: BROOT_PROJECT_MIME });
      if (window.showSaveFilePicker) {
        const handle = fileHandleRef.current || await window.showSaveFilePicker({
          suggestedName: `${safeSlug(projectName)}${BROOT_PROJECT_EXTENSION}`,
          types: [{ description: "Broot project", accept: BROOT_PROJECT_SAVE_ACCEPT }],
        });
        fileHandleRef.current = handle;
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        downloadBlob(blob, `${safeSlug(projectName)}${BROOT_PROJECT_EXTENSION}`);
      }
      await saveDraft(true);
      setStatus("Project saved.");
    } catch (error) {
      setStatus(`Save failed: ${error.message}`);
    }
  }, [buildProjectRecord, projectName, saveDraft]);

  const openSelectedFile = useCallback(async (file, handle) => {
    if (!file) return;
    const kind = classifyOpenFile(file);
    if (kind === "project") {
      fileHandleRef.current = handle || null;
      loadProjectRecord(JSON.parse(await file.text()));
      return;
    }
    fileHandleRef.current = null;
    await importMediaFile(file);
  }, [importMediaFile, loadProjectRecord]);

  const openProjectFile = useCallback(async () => {
    try {
      let file;
      let handle = null;
      if (window.showOpenFilePicker) {
        [handle] = await window.showOpenFilePicker({
          types: [{ description: "Broot project or media", accept: BROOT_OPEN_ACCEPT }],
          multiple: false,
        });
        file = await handle.getFile();
      } else {
        fileInputRef.current.click();
        return;
      }
      await openSelectedFile(file, handle);
    } catch (error) {
      setStatus(`Open failed: ${error.message}`);
    }
  }, [openSelectedFile]);

  const openDraft = useCallback(async () => {
    try {
      const record = await getProject(AUTOSAVE_ID);
      if (!record) throw new Error("No Broot autosave found.");
      loadProjectRecord(record);
    } catch (error) {
      setStatus(`Draft load failed: ${error.message}`);
    }
  }, [loadProjectRecord]);

  const handleFallbackProjectFile = useCallback(async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      await openSelectedFile(file, null);
    } catch (error) {
      setStatus(`Open failed: ${error.message}`);
    }
  }, [openSelectedFile]);

  const handleMediaInputFile = useCallback(async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      await importMediaFile(file);
    } catch (error) {
      setStatus(`Import failed: ${error.message}`);
    }
  }, [importMediaFile]);

  const tokenPreview = useMemo(() => ({
    artifact: artifactCid ? `ipfs://${artifactCid}` : "not pinned",
    metadata: metadataCid ? `ipfs://${metadataCid}` : "not pinned",
    creator: shortAddress(walletState.address),
    network: NETWORKS[network].label,
  }), [artifactCid, metadataCid, network, walletState.address]);

  const canGroup = selectionState.count > 1 && selectionState.type === "activeSelection";
  const canUngroup = selectionState.type === "group";
  const canMerge = selectionState.count > 1;
  const canEditSelection = selectionState.count > 0;
  const canFlatten = layers.length > 1;
  const preparedHen = henReview.open && henReview.prepared ? henReview.prepared : null;

  const toolButton = (id, label) => (
    <button
      className="tool-button"
      type="button"
      aria-pressed={activeTool === id}
      onClick={() => setActiveTool(id)}
    >
      {label}
    </button>
  );

  return (
    <main className="broot-shell" aria-label="Broot editor" onKeyDown={handleEditorKeyDown}>
      <header className="broot-topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">BR</div>
          <div className="brand-copy">
            <div className="brand-title"><span>Broot</span><span>Tezos-native paint</span></div>
            <div className="brand-tag">Fabric canvas, WebGL bakes, wallet-aware metadata, local-first drafts</div>
          </div>
        </div>
        <label className="sr-only" htmlFor="projectName">Project name</label>
        <input
          id="projectName"
          className="project-name"
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
        />
        <div className="top-actions">
          <button className="action-button" type="button" onClick={openProjectFile}>Open</button>
          <button className="action-button" type="button" onClick={saveProjectFile}>Save</button>
          <button className="action-button" type="button" onClick={() => saveDraft(false)}>Draft</button>
          <button className="action-button" type="button" onClick={openDraft}>Load Draft</button>
        </div>
      </header>

      <nav className="mobile-tabs" aria-label="Broot mobile panels">
        {["tools", "canvas", "layers"].map((panel) => (
          <button key={panel} type="button" aria-pressed={mobilePanel === panel} onClick={() => setMobilePanel(panel)}>
            {panel}
          </button>
        ))}
      </nav>

      <section className="export-strip" aria-label="Broot export toolbar">
          <div className="toolbar">
            <div className="tool-group">
              {toolButton("select", "Select")}
              {toolButton("brush", "Brush")}
              {toolButton("eraser", "Eraser")}
            </div>
            <div className="tool-group">
              <button className="action-button" type="button" onClick={undoCanvas} disabled={!historyState.canUndo} title="Undo the last canvas edit">
                Undo
              </button>
              <button className="action-button" type="button" onClick={redoCanvas} disabled={!historyState.canRedo} title="Redo the last undone canvas edit">
                Redo
              </button>
            </div>
            <div className="tool-group">
              <button className="action-button" type="button" onClick={addRect}>Rect</button>
            <button className="action-button" type="button" onClick={addCircle}>Circle</button>
            <button className="action-button" type="button" onClick={addText}>Text</button>
          </div>
          <div className="tool-group">
            <button className="action-button" type="button" onClick={() => exportBitmap("png")}>PNG</button>
            <button className="action-button" type="button" onClick={() => exportBitmap("webp")}>WEBP</button>
            <button className="action-button" type="button" onClick={() => exportWorkerImage("gif")}>GIF</button>
            <button className="action-button" type="button" onClick={exportVideo}>MP4</button>
            <button className="action-button" type="button" onClick={exportSvg}>SVG</button>
            <button className="action-button" type="button" onClick={() => exportWorkerImage("psd")}>PSD</button>
          </div>
          <div className="tool-group">
            <button className="action-button primary" type="button" onClick={pinCurrentPng}>Pin PNG</button>
            <button className="action-button" type="button" onClick={downloadMetadata}>Metadata</button>
            <button className="action-button" type="button" onClick={pinMetadata}>Pin Metadata</button>
            <button className="action-button" type="button" onClick={downloadFa2Artifact}>FA2</button>
          </div>
        </div>
      </section>

      <section className="broot-main">
        <aside className={`side-panel left ${mobilePanel === "tools" ? "active" : ""}`} aria-label="Broot tools">
          <div className="panel-section">
            <div className="section-title">Paint</div>
            <label className="field">
              <span>Primary</span>
              <span className="color-row">
                <span className="color-chip"><input type="color" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} /></span>
                <input value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} />
              </span>
            </label>
            <label className="field">
              <span>Secondary</span>
              <span className="color-row">
                <span className="color-chip"><input type="color" value={secondaryColor} onChange={(event) => setSecondaryColor(event.target.value)} /></span>
                <input value={secondaryColor} onChange={(event) => setSecondaryColor(event.target.value)} />
              </span>
            </label>
            <label className="field">
              <span>Brush size</span>
              <span className="range-row">
                <input type="range" min="1" max="80" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
                <span>{brushSize}</span>
              </span>
            </label>
            <div className="palette-grid" aria-label="Color swatches">
              {PALETTES.map((color) => (
                <button
                  key={color}
                  className="swatch"
                  type="button"
                  style={{ backgroundColor: color }}
                  title={color}
                  aria-label={`Use ${color}`}
                  onClick={() => setPrimaryColor(color)}
                />
              ))}
            </div>
          </div>

          <div className="panel-section">
            <div className="section-title">Image</div>
            <label className="field">
              <span>Import media</span>
              <input
                data-broot-media-input
                type="file"
                accept={BROOT_MEDIA_ACCEPT_STRING}
                onChange={handleMediaInputFile}
              />
            </label>
            <label className="field">
              <span>WebGL bake</span>
              <select value={effectMode} onChange={(event) => setEffectMode(event.target.value)}>
                {FX_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
              </select>
            </label>
            <button className="action-button primary" type="button" onClick={bakeFx}>Bake FX Layer</button>
            <div className="engine-row" aria-label="Broot library engines">
              <span className={libraryState.glfx ? "engine-pill ready" : "engine-pill"}>glfx</span>
              <span className={libraryState.ffmpeg ? "engine-pill ready" : "engine-pill"}>FFmpeg</span>
            </div>
          </div>

          <div className="panel-section">
            <div className="section-title">Video</div>
            <label className="field">
              <span>MP4 mode</span>
              <select value={videoMode} onChange={(event) => setVideoMode(event.target.value)}>
                {VIDEO_EXPORT_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Duration</span>
              <span className="range-row">
                <input type="range" min="0.5" max="8" step="0.5" value={videoDuration} onChange={(event) => setVideoDuration(Number(event.target.value))} />
                <span>{videoDuration.toFixed(1)}s</span>
              </span>
            </label>
            <label className="field">
              <span>FPS</span>
              <span className="range-row">
                <input type="range" min="12" max="60" step="6" value={videoFps} onChange={(event) => setVideoFps(Number(event.target.value))} />
                <span>{videoFps}</span>
              </span>
            </label>
          </div>

          <div className="panel-section">
            <div className="section-title">Distort</div>
            <label className="field">
              <span>Warp</span>
              <select value={warpMode} onChange={(event) => setWarpMode(event.target.value)}>
                {WARP_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Strength</span>
              <span className="range-row">
                <input type="range" min="-1" max="1" step="0.05" value={warpStrength} onChange={(event) => setWarpStrength(Number(event.target.value))} />
                <span>{warpStrength.toFixed(2)}</span>
              </span>
            </label>
            <div className="layer-actions">
              <button className="small-button" type="button" onClick={warpSelection} disabled={!canEditSelection}>Warp Selection</button>
              <button className="small-button warning" type="button" onClick={warpCanvas} disabled={!canFlatten}>Warp Canvas</button>
            </div>
          </div>

          <div className="panel-section">
            <div className="section-title">Canvas</div>
            <label className="field">
              <span>Zoom</span>
              <span className="range-row">
                <input type="range" min="0.35" max="1.3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
                <span>{Math.round(zoom * 100)}%</span>
              </span>
            </label>
            <div className="layer-actions">
              <button className="small-button" type="button" onClick={() => moveLayer("backward")} disabled={!canEditSelection} aria-label="Move selected layer down">Down</button>
              <button className="small-button" type="button" onClick={() => moveLayer("forward")} disabled={!canEditSelection} aria-label="Move selected layer up">Up</button>
              <button className="small-button" type="button" onClick={() => moveLayer("back")} disabled={!canEditSelection} aria-label="Send selected layer to back">Back</button>
              <button className="small-button" type="button" onClick={() => moveLayer("front")} disabled={!canEditSelection} aria-label="Bring selected layer to front">Front</button>
            </div>
          </div>
        </aside>

        <div className={`canvas-wrap ${mobilePanel !== "canvas" ? "hidden-mobile" : ""}`}>
          <div className="canvas-ruler">
            <span>{CANVAS_WIDTH} x {CANVAS_HEIGHT}px</span>
            <span>{activeTool} tool</span>
          </div>
          <div className="canvas-stage" tabIndex="0" aria-label="Broot canvas workspace">
            <div className="canvas-pad" style={{ minWidth: `${CANVAS_WIDTH * zoom + 80}px`, minHeight: `${CANVAS_HEIGHT * zoom + 80}px` }}>
              <div className="canvas-frame" style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
                <canvas ref={canvasElRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} aria-label="Broot Fabric canvas" />
              </div>
            </div>
          </div>
        </div>

        <aside className={`side-panel right ${mobilePanel === "layers" ? "active" : ""}`} aria-label="Broot layers and Tezos">
          <div className="panel-section">
            <div className="section-title">
              <span>Layers</span>
              <span>{layers.length}</span>
            </div>
            <div className="layer-actions">
              <button className="small-button" type="button" onClick={duplicateSelection} disabled={!canEditSelection}>Duplicate</button>
              <button className="small-button" type="button" onClick={groupSelection} disabled={!canGroup} title="Shift-click layer rows or multi-select objects on canvas to group">Group</button>
              <button className="small-button" type="button" onClick={ungroupSelection} disabled={!canUngroup}>Ungroup</button>
              <button className="small-button" type="button" onClick={mergeSelection} disabled={!canMerge}>Merge</button>
              <button className="small-button warning" type="button" onClick={flattenCanvas} disabled={!canFlatten}>Flatten</button>
              <button className="small-button" type="button" onClick={toggleLock} disabled={!canEditSelection}>Lock</button>
              <button className="small-button warning" type="button" onClick={deleteSelection} disabled={!canEditSelection}>Delete</button>
            </div>
            <div className="layer-list">
              {layers.map((layer) => (
                <div key={layer.id} className={`layer-row ${selectedLayerId === layer.id ? "active" : ""}`}>
                  <button
                    className="layer-button"
                    type="button"
                    aria-label={`Select layer ${layer.name}`}
                    onClick={(event) => selectLayer(layer.id, event)}
                  >
                    <span className="layer-name">{layer.name}</span>
                    <span className="layer-meta">{layer.type}{layer.locked ? " locked" : ""}</span>
                  </button>
                  <button
                    className="small-button"
                    type="button"
                    aria-label={`${layer.visible ? "Hide" : "Show"} layer ${layer.name}`}
                    onClick={() => toggleVisible(layer.id)}
                  >
                    {layer.visible ? "Hide" : "Show"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="panel-section">
            <div className="section-title">Tezos</div>
            <label className="field">
              <span>Network</span>
              <select value={network} onChange={(event) => setNetwork(event.target.value)}>
                {Object.entries(NETWORKS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
              </select>
            </label>
            <div className="layer-actions">
              {walletState.connected ? (
                <button className="action-button primary" type="button" disabled>Connected</button>
              ) : (
                <button
                  className="action-button primary"
                  type="button"
                  onClick={connectWallet}
                  disabled={walletState.connecting || walletState.restoring}
                >
                  {walletState.connecting ? "Connecting..." : walletState.restoring ? "Checking..." : "Connect Wallet"}
                </button>
              )}
              <button
                className="action-button"
                type="button"
                onClick={disconnectWallet}
                disabled={!walletState.connected && !walletState.address}
              >
                Disconnect
              </button>
            </div>
            <div className="token-preview">
              <span><strong>Wallet</strong> {shortAddress(walletState.address)}</span>
              <span><strong>Chain</strong> {walletState.chainId || "not checked"}</span>
            </div>
          </div>

          <div className="panel-section">
            <div className="section-title">Token</div>
            <label className="field">
              <span>Description</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <label className="field">
              <span>Tags</span>
              <input value={tags} onChange={(event) => setTags(event.target.value)} />
            </label>
            <label className="field">
              <span>Royalty bps</span>
              <input type="number" min="0" max="2500" value={royaltyBps} onChange={(event) => setRoyaltyBps(Number(event.target.value))} />
            </label>
            <div className="layer-actions">
              <label className="field compact">
                <span>Token</span>
                <input type="number" min="0" value={tokenId} onChange={(event) => setTokenId(Number(event.target.value))} />
              </label>
              <label className="field compact">
                <span>Edition</span>
                <input type="number" min="1" value={editionAmount} onChange={(event) => setEditionAmount(Number(event.target.value))} />
              </label>
            </div>
            <div className="token-preview">
              <span><strong>Artifact</strong> {tokenPreview.artifact}</span>
              <span><strong>Metadata</strong> {tokenPreview.metadata}</span>
              <span><strong>Creator</strong> {tokenPreview.creator}</span>
              <span><strong>Network</strong> {tokenPreview.network}</span>
              {mintState.tokenId ? <span><strong>HEN</strong> #{mintState.tokenId}</span> : null}
              {mintState.storageFeeMutez ? <span><strong>Storage</strong> {mutezToTez(mintState.storageFeeMutez)}</span> : null}
            </div>
            {preparedHen ? (
              <div className="mint-review" aria-label="HEN mint review">
                <div className="review-title">Review HEN Mint</div>
                <div className="review-grid">
                  <span>Network</span><strong>{preparedHen.networkLabel}</strong>
                  <span>Wallet</span><strong>{shortAddress(preparedHen.address)}</strong>
                  <span>Contract</span><strong>{shortAddress(preparedHen.contract)}</strong>
                  <span>Token</span><strong>#{preparedHen.tokenId}</strong>
                  <span>Editions</span><strong>{preparedHen.amount}</strong>
                  <span>Artifact</span><strong>ipfs://{preparedHen.artifactCid}</strong>
                  <span>Metadata</span><strong>ipfs://{preparedHen.metadataCid}</strong>
                  <span>Gas</span><strong>{preparedHen.gasLimit}</strong>
                  <span>Storage</span><strong>{mutezToTez(preparedHen.storageFeeMutez)}</strong>
                  <span>Fee</span><strong>{mutezToTez(preparedHen.feeMutez)}</strong>
                </div>
                <div className="layer-actions">
                  <button className="action-button primary" type="button" onClick={signPreparedHenMint} disabled={mintState.busy}>
                    {mintState.busy ? "Signing..." : "Sign HEN Mint"}
                  </button>
                  <button className="action-button" type="button" onClick={cancelHenReview} disabled={mintState.busy}>Cancel</button>
                </div>
              </div>
            ) : null}
            <div className="layer-actions">
              <button
                className="action-button primary"
                type="button"
                onClick={prepareHenMint}
                disabled={mintState.busy || walletState.connecting || walletState.restoring || !walletState.connected || network !== "mainnet"}
                title={network !== "mainnet" ? "Switch to Mainnet to mint on HEN" : "Prepare the current canvas for a HEN FA2 mint review"}
              >
                {mintState.busy ? "Preparing..." : "Prepare HEN Mint"}
              </button>
            </div>
          </div>
        </aside>
      </section>

      {dangerAction ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="brootConfirmTitle">
          <div className="confirm-panel">
            <div id="brootConfirmTitle" className="review-title">{dangerAction.title}</div>
            <p>{dangerAction.body}</p>
            <div className="layer-actions">
              <button className="action-button warning" type="button" onClick={confirmDangerAction}>{dangerAction.actionLabel}</button>
              <button className="action-button" type="button" onClick={cancelDangerAction}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}

      <footer className="status-row" role="status" aria-live="polite">
        <span className="status-text">{status}</span>
        <span className="status-pill">{walletState.connected ? shortAddress(walletState.address) : "local first"}</span>
      </footer>

      <input
        ref={fileInputRef}
        data-broot-open-input
        className="sr-only"
        type="file"
        accept={BROOT_OPEN_ACCEPT_STRING}
        onChange={handleFallbackProjectFile}
      />
    </main>
  );
}

ReactDOM.render(<BrootApp />, document.getElementById("root"));
