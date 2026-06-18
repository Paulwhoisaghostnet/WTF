const { useCallback, useEffect, useMemo, useRef, useState } = React;

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 820;
const AUTOSAVE_ID = "autosave";

const NETWORKS = {
  shadownet: {
    label: "Shadownet testnet",
    rpc: "https://tezos-shadownet.octez.io/",
    chainId: "NetXsqzbfFenSTS",
    beaconNetwork: { type: "shadownet" },
  },
  mainnet: {
    label: "Mainnet",
    rpc: "https://tezos-mainnet.octez.io/",
    chainId: "NetXdQprcVkpaWU",
    beaconNetwork: { type: "mainnet" },
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

function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(",");
  const mime = (head.match(/data:([^;]+)/) || [])[1] || "application/octet-stream";
  const raw = atob(body);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type: mime });
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

  const [activeTool, setActiveTool] = useState("select");
  const [primaryColor, setPrimaryColor] = useState("#ff5964");
  const [secondaryColor, setSecondaryColor] = useState("#4ad6b8");
  const [brushSize, setBrushSize] = useState(12);
  const [zoom, setZoom] = useState(0.75);
  const [layers, setLayers] = useState([]);
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [projectName, setProjectName] = useState("Broot artifact");
  const [description, setDescription] = useState("Made in Broot.");
  const [tags, setTags] = useState("broot, wtfos, tezos");
  const [royaltyBps, setRoyaltyBps] = useState(1000);
  const [tokenId, setTokenId] = useState(0);
  const [editionAmount, setEditionAmount] = useState(1);
  const [network, setNetwork] = useState("shadownet");
  const [walletState, setWalletState] = useState({ address: "", chainId: "", connected: false });
  const [artifactCid, setArtifactCid] = useState("");
  const [metadataCid, setMetadataCid] = useState("");
  const [effectMode, setEffectMode] = useState("duotone");
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
  }, []);

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

  const loadProjectRecord = useCallback((record) => {
    if (!record || !record.canvas) throw new Error("This file is not a Broot project.");
    const canvas = fabricRef.current;
    if (!canvas) throw new Error("Canvas is not ready.");
    canvas.loadFromJSON(record.canvas, () => {
      canvas.getObjects().forEach((obj, index) => ensureObjectMeta(obj, `Layer ${index + 1}`));
      canvas.renderAll();
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
  }, [scheduleLayerRefresh]);

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
      scheduleLayerRefresh();
      scheduleAutosave();
    };
    canvas.on("object:added", refresh);
    canvas.on("object:removed", refresh);
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
  }, [layers.length, primaryColor, secondaryColor]);

  const addCircle = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
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
  }, [layers.length, secondaryColor]);

  const addText = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
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
  }, [primaryColor]);

  const addImage = useCallback(async (file) => {
    if (!file) return;
    const canvas = fabricRef.current;
    if (!canvas) return;
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
  }, []);

  const deleteSelection = useCallback(() => {
    const canvas = fabricRef.current;
    const active = selectedObject();
    if (!canvas || !active) return;
    if (active.type === "activeSelection") {
      active.forEachObject((obj) => canvas.remove(obj));
      canvas.discardActiveObject();
    } else {
      canvas.remove(active);
    }
    canvas.renderAll();
    scheduleLayerRefresh();
  }, [scheduleLayerRefresh, selectedObject]);

  const duplicateSelection = useCallback(() => {
    const canvas = fabricRef.current;
    const active = selectedObject();
    if (!canvas || !active) return;
    active.clone((cloned) => {
      cloned.set({ left: (active.left || 0) + 34, top: (active.top || 0) + 34 });
      ensureObjectMeta(cloned, `${objectLabel(active)} copy`);
      canvas.add(cloned);
      canvas.setActiveObject(cloned);
      canvas.renderAll();
      scheduleLayerRefresh();
    }, ["data", "visible", "lockMovementX", "lockMovementY", "lockScalingX", "lockScalingY", "lockRotation"]);
  }, [scheduleLayerRefresh, selectedObject]);

  const moveLayer = useCallback((direction) => {
    const canvas = fabricRef.current;
    const active = selectedObject();
    if (!canvas || !active) return;
    if (direction === "front") canvas.bringToFront(active);
    if (direction === "back") canvas.sendToBack(active);
    if (direction === "forward") canvas.bringForward(active);
    if (direction === "backward") canvas.sendBackwards(active);
    canvas.renderAll();
    scheduleLayerRefresh();
  }, [scheduleLayerRefresh, selectedObject]);

  const toggleLock = useCallback(() => {
    const obj = selectedObject();
    const canvas = fabricRef.current;
    if (!obj || !canvas) return;
    const next = !(obj.lockMovementX && obj.lockScalingX);
    obj.set({
      lockMovementX: next,
      lockMovementY: next,
      lockScalingX: next,
      lockScalingY: next,
      lockRotation: next,
    });
    canvas.renderAll();
    scheduleLayerRefresh();
  }, [scheduleLayerRefresh, selectedObject]);

  const toggleVisible = useCallback((id) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const obj = canvas.getObjects().find((candidate) => candidate.data && candidate.data.id === id);
    if (!obj) return;
    obj.visible = obj.visible === false;
    canvas.renderAll();
    scheduleLayerRefresh();
  }, [scheduleLayerRefresh]);

  const selectLayer = useCallback((id) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const obj = canvas.getObjects().find((candidate) => candidate.data && candidate.data.id === id);
    if (!obj) return;
    canvas.setActiveObject(obj);
    canvas.renderAll();
    scheduleLayerRefresh();
  }, [scheduleLayerRefresh]);

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

  const exportVideo = useCallback(async () => {
    try {
      const canvas = fabricRef.current;
      if (!canvas) throw new Error("Canvas is not ready.");
      const element = canvas.getElement();
      if (!element.captureStream || !window.MediaRecorder) throw new Error("Canvas video recording is not supported.");
      const mp4 = ["video/mp4;codecs=avc1.42E01E", "video/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const webm = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      const mimeType = mp4 || webm;
      if (!mimeType) throw new Error("This browser does not expose an MP4 or WebM recorder.");
      setStatus(mp4 ? "Recording MP4..." : "MP4 unavailable here. Recording WebM fallback...");
      const stream = element.captureStream(24);
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) chunks.push(event.data);
      };
      const done = new Promise((resolve) => {
        recorder.onstop = resolve;
      });
      recorder.start();
      const start = performance.now();
      const pulse = () => {
        const elapsed = performance.now() - start;
        canvas.getObjects().forEach((obj, index) => {
          if (index % 2 === 0) obj.opacity = 0.88 + Math.sin((elapsed / 320) + index) * 0.08;
        });
        canvas.renderAll();
        if (elapsed < 1800) requestAnimationFrame(pulse);
      };
      requestAnimationFrame(pulse);
      await new Promise((resolve) => setTimeout(resolve, 1900));
      recorder.stop();
      await done;
      stream.getTracks().forEach((track) => track.stop());
      canvas.getObjects().forEach((obj) => {
        if (obj.opacity !== 1 && obj.opacity > 0.7) obj.opacity = 1;
      });
      canvas.renderAll();
      const extension = mp4 ? "mp4" : "webm";
      downloadBlob(new Blob(chunks, { type: mimeType }), `${safeSlug(projectName)}.${extension}`);
      setStatus(`${extension.toUpperCase()} exported.`);
    } catch (error) {
      setStatus(`Video export failed: ${error.message}`);
    }
  }, [projectName]);

  const bakeFx = useCallback(async () => {
    try {
      const canvas = fabricRef.current;
      if (!canvas) throw new Error("Canvas is not ready.");
      setStatus("Baking WebGL layer...");
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
  }, [effectMode]);

  const connectWallet = useCallback(async () => {
    try {
      if (!window.TZ || !window.TZ.TezosToolkit || !window.TZ.BeaconWallet) {
        throw new Error("Tezos wallet libraries are not loaded.");
      }
      const config = NETWORKS[network];
      setStatus(`Connecting wallet on ${config.label}...`);
      const tezos = new window.TZ.TezosToolkit(config.rpc);
      if (typeof window.TZ.installOctezPrimaryWallet === "function") window.TZ.installOctezPrimaryWallet();
      const WalletClass = window.TZ.OctezPrimaryWallet || window.TZ.BeaconWallet;
      const wallet = new WalletClass({
        name: "Broot",
        network: config.beaconNetwork,
        preferredNetwork: network === "mainnet" ? "mainnet" : "mainnet",
        enableMetrics: false,
        featuredWallets: ["kukai", "temple", "umami"],
      });
      wallet.client.network = config.beaconNetwork;
      wallet.client.preferredNetwork = network === "mainnet" ? "mainnet" : "mainnet";
      wallet.client.featuredWallets = ["kukai", "temple", "umami"];
      tezos.setWalletProvider(wallet);
      await wallet.requestPermissions();
      const address = await wallet.getPKH();
      const chainId = await tezos.rpc.getChainId();
      if (chainId !== config.chainId) {
        throw new Error(`RPC chain mismatch: expected ${config.chainId}, got ${chainId}.`);
      }
      tezosRef.current = tezos;
      walletRef.current = wallet;
      setWalletState({ address, chainId, connected: true });
      setStatus(`Wallet connected: ${shortAddress(address)}.`);
    } catch (error) {
      setWalletState({ address: "", chainId: "", connected: false });
      setStatus(`Wallet connect failed: ${error.message}`);
    }
  }, [network]);

  const disconnectWallet = useCallback(async () => {
    try {
      const wallet = walletRef.current;
      if (wallet && typeof wallet.clearActiveAccount === "function") await wallet.clearActiveAccount();
    } catch (_) {
      /* stale wallet sessions can already be gone */
    }
    walletRef.current = null;
    tezosRef.current = null;
    setWalletState({ address: "", chainId: "", connected: false });
    setStatus("Wallet disconnected.");
  }, []);

  const csrfFetch = useCallback(async (url, options) => {
    const init = options || {};
    const headers = new Headers(init.headers || {});
    if (String(init.method || "GET").toUpperCase() !== "GET") {
      const csrf = await fetch("/api/auth/csrf-token", { credentials: "same-origin" }).then((res) => res.json());
      headers.set("X-CSRF-Token", csrf.csrfToken || "");
    }
    return fetch(url, { ...init, headers, credentials: "same-origin" });
  }, []);

  const pinCurrentPng = useCallback(async () => {
    try {
      setStatus("Pinning PNG through wtfOS IPFS...");
      const blob = await canvasBlob("png");
      const form = new FormData();
      form.append("file", blob, `${safeSlug(projectName)}.png`);
      const res = await csrfFetch("/api/macaroni/ipfs/pin", { method: "POST", body: form });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const json = await res.json();
      const cid = json.cid || json.IpfsHash || "";
      if (!cid) throw new Error("Pin response did not include a CID.");
      setArtifactCid(cid);
      setStatus(`Pinned artifact CID ${cid}.`);
    } catch (error) {
      setStatus(`IPFS pin failed: ${error.message}`);
    }
  }, [canvasBlob, csrfFetch, projectName]);

  const buildArtifacts = useCallback(async (metadataUri) => {
    const canvas = fabricRef.current;
    if (!canvas) throw new Error("Canvas is not ready.");
    return workerRequest("buildArtifacts", {
      name: projectName,
      description,
      tags,
      royaltyBps: Number(royaltyBps),
      tokenId: Number(tokenId),
      amount: Number(editionAmount),
      network,
      walletAddress: walletState.address,
      artifactUri: artifactCid ? `ipfs://${artifactCid}` : "",
      metadataUri: metadataUri || (metadataCid ? `ipfs://${metadataCid}` : ""),
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
      const form = new FormData();
      form.append("file", blob, `${safeSlug(projectName)}.json`);
      const res = await csrfFetch("/api/macaroni/ipfs/pin", { method: "POST", body: form });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const json = await res.json();
      const cid = json.cid || json.IpfsHash || "";
      if (!cid) throw new Error("Pin response did not include a CID.");
      setMetadataCid(cid);
      setStatus(`Pinned metadata CID ${cid}.`);
    } catch (error) {
      setStatus(`Metadata pin failed: ${error.message}`);
    }
  }, [buildArtifacts, csrfFetch, projectName]);

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
      const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
      if (window.showSaveFilePicker) {
        const handle = fileHandleRef.current || await window.showSaveFilePicker({
          suggestedName: `${safeSlug(projectName)}.broot.json`,
          types: [{ description: "Broot project", accept: { "application/json": [".json", ".broot"] } }],
        });
        fileHandleRef.current = handle;
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        downloadBlob(blob, `${safeSlug(projectName)}.broot.json`);
      }
      await saveDraft(true);
      setStatus("Project saved.");
    } catch (error) {
      setStatus(`Save failed: ${error.message}`);
    }
  }, [buildProjectRecord, projectName, saveDraft]);

  const openProjectFile = useCallback(async () => {
    try {
      let file;
      if (window.showOpenFilePicker) {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: "Broot project", accept: { "application/json": [".json", ".broot"] } }],
          multiple: false,
        });
        fileHandleRef.current = handle;
        file = await handle.getFile();
      } else {
        fileInputRef.current.click();
        return;
      }
      loadProjectRecord(JSON.parse(await file.text()));
    } catch (error) {
      setStatus(`Open failed: ${error.message}`);
    }
  }, [loadProjectRecord]);

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
      loadProjectRecord(JSON.parse(await file.text()));
    } catch (error) {
      setStatus(`Open failed: ${error.message}`);
    }
  }, [loadProjectRecord]);

  const tokenPreview = useMemo(() => ({
    artifact: artifactCid ? `ipfs://${artifactCid}` : "not pinned",
    metadata: metadataCid ? `ipfs://${metadataCid}` : "not pinned",
    creator: shortAddress(walletState.address),
    network: NETWORKS[network].label,
  }), [artifactCid, metadataCid, network, walletState.address]);

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
    <main className="broot-shell" aria-label="Broot editor">
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
              <span>Import image</span>
              <input type="file" accept="image/*" onChange={(event) => addImage(event.target.files && event.target.files[0])} />
            </label>
            <label className="field">
              <span>WebGL bake</span>
              <select value={effectMode} onChange={(event) => setEffectMode(event.target.value)}>
                {FX_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
              </select>
            </label>
            <button className="action-button primary" type="button" onClick={bakeFx}>Bake FX Layer</button>
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
              <button className="small-button" type="button" onClick={() => moveLayer("backward")}>Down</button>
              <button className="small-button" type="button" onClick={() => moveLayer("forward")}>Up</button>
              <button className="small-button" type="button" onClick={() => moveLayer("back")}>Back</button>
              <button className="small-button" type="button" onClick={() => moveLayer("front")}>Front</button>
            </div>
          </div>
        </aside>

        <div className={`canvas-wrap ${mobilePanel !== "canvas" ? "hidden-mobile" : ""}`}>
          <div className="canvas-ruler">
            <span>{CANVAS_WIDTH} x {CANVAS_HEIGHT}px</span>
            <span>{activeTool} tool</span>
          </div>
          <div className="canvas-stage">
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
              <button className="small-button" type="button" onClick={duplicateSelection}>Duplicate</button>
              <button className="small-button" type="button" onClick={toggleLock}>Lock</button>
              <button className="small-button warning" type="button" onClick={deleteSelection}>Delete</button>
            </div>
            <div className="layer-list">
              {layers.map((layer) => (
                <div key={layer.id} className={`layer-row ${selectedLayerId === layer.id ? "active" : ""}`}>
                  <button className="layer-button" type="button" onClick={() => selectLayer(layer.id)}>
                    <span className="layer-name">{layer.name}</span>
                    <span className="layer-meta">{layer.type}{layer.locked ? " locked" : ""}</span>
                  </button>
                  <button className="small-button" type="button" onClick={() => toggleVisible(layer.id)}>
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
              <button className="action-button primary" type="button" onClick={connectWallet}>Connect Wallet</button>
              <button className="action-button" type="button" onClick={disconnectWallet}>Disconnect</button>
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
            </div>
          </div>
        </aside>
      </section>

      <footer className="status-row" role="status" aria-live="polite">
        <span className="status-text">{status}</span>
        <span className="status-pill">{walletState.connected ? shortAddress(walletState.address) : "local first"}</span>
      </footer>

      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept=".json,.broot,application/json"
        onChange={handleFallbackProjectFile}
      />
    </main>
  );
}

ReactDOM.render(<BrootApp />, document.getElementById("root"));
