"use strict";

/* Collector-side Rotini reservation, render, pin, and finalize runtime.
 * This file is included in exported self-hosted mint pages. It never receives creator signing
 * authority: the connected collector reserves and finalizes their own iteration.
 */
((root) => {
  const MD = root.MD;

  function number(value) {
    if (value == null) return 0;
    if (typeof value.toNumber === "function") return value.toNumber();
    const parsed = Number(typeof value.toString === "function" ? value.toString() : value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function text(value) {
    if (value == null) return "";
    const raw = typeof value === "string" ? value : String(value);
    try { return MD.hexToUtf8(raw); } catch (_) { return raw; }
  }

  async function mapGet(map, key) {
    if (!map || typeof map.get !== "function") return undefined;
    return (await map.get(String(key))) ?? (await map.get(Number(key)));
  }

  async function image(blob) {
    if (typeof createImageBitmap === "function") return createImageBitmap(blob);
    const url = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve, reject) => {
        const loaded = new Image();
        loaded.onload = () => resolve(loaded);
        loaded.onerror = () => reject(new Error("Could not decode a selected generator layer."));
        loaded.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function copyCanvas(source) {
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.getContext("2d").drawImage(source, 0, 0);
    return canvas;
  }

  function seedBytes(value) {
    const seed = String(value || "").replace(/^0x/i, "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(seed)) throw new Error("Rotini render seed must be exactly 32 bytes.");
    return seed;
  }

  async function renderProject(input, setStatus) {
    const project = input.project;
    const generatorUri = text(project.generator_uri);
    setStatus("Loading the immutable generator and reserved seed…");
    const response = await fetch(MD.ipfsToHttp(generatorUri));
    if (!response.ok) throw new Error(`Could not load the generator manifest (${response.status}).`);
    const manifest = await response.json();
    if (manifest.schema !== "pasta-rotini-generator@2") throw new Error("This project predates self-contained Rotini artifacts.");
    const outputMode = text(project.output_mode);
    if (!root.RotiniArtifacts.OUTPUTS[outputMode] || manifest.outputMode !== outputMode) {
      throw new Error("The on-chain output mode does not match the generator manifest.");
    }
    const seed = seedBytes(input.seed);
    const traits = root.RotiniArtifacts.selectTraits(manifest, seed);
    const layers = [];
    for (const trait of traits) {
      setStatus(`Loading ${trait.layer} / ${trait.value}…`);
      const layerResponse = await fetch(MD.ipfsToHttp(trait.artifactUri));
      if (!layerResponse.ok) throw new Error(`Could not load ${trait.layer} / ${trait.value}.`);
      const blob = await layerResponse.blob();
      layers.push({ ...trait, blob, image: await image(blob), mimeType: blob.type || trait.mimeType || "image/png" });
    }
    const size = Math.max(64, Math.min(2048, Number(manifest.width) || 512));
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    const frames = [];
    for (const layer of layers) {
      context.drawImage(layer.image, 0, 0, size, size);
      frames.push(copyCanvas(canvas));
    }
    if (!frames.length) throw new Error("The reserved seed selected no renderable layers.");

    let artifactBlob;
    if (outputMode === "png") artifactBlob = await root.RotiniArtifacts.canvasToPng(canvas);
    else if (outputMode === "gif") artifactBlob = root.RotiniArtifacts.encodeGif(frames, { delayMs: 420 });
    else {
      const built = await root.RotiniArtifacts.buildInteractiveZip({
        name: input.artifactName || `${manifest.name || "Rotini"} #${number(input.iteration) + 1}`,
        seed,
        tokenId: input.tokenId,
        projectId: number(input.projectId),
        width: size,
        height: size,
        traits: traits.map(({ layer, value }) => ({ layer, value })),
        provenance: input.provenance,
        layers: layers.map((layer) => ({ name: layer.layer, mimeType: layer.mimeType, blob: layer.blob })),
      });
      artifactBlob = built.blob;
    }
    if (artifactBlob.size > root.RotiniArtifacts.MAX_ARTIFACT_BYTES) throw new Error("The finished artifact exceeds Objkt's 250 MB limit.");
    const coverBlob = outputMode === "zip" ? await root.RotiniArtifacts.canvasToPng(canvas) : artifactBlob;
    if (outputMode === "zip" && coverBlob.size > 2 * 1024 * 1024) throw new Error("The interactive cover exceeds Objkt's 2 MB limit.");
    return { artifactBlob, coverBlob, generatorUri, manifest, outputMode, seed, traits };
  }

  async function render(project, reservation, setStatus) {
    return renderProject({
      project,
      seed: reservation.seed,
      tokenId: number(reservation.token_id),
      projectId: number(reservation.project_id),
      iteration: number(reservation.iteration),
    }, setStatus);
  }

  async function latestReservation(storage, owner, projectId) {
    const id = await mapGet(storage.latest_reservation, owner);
    if (id == null) return null;
    const value = await mapGet(storage.reservations, number(id));
    if (!value || number(value.project_id) !== projectId) return null;
    return { id: number(id), value };
  }

  function tokenMetadata(input) {
    return {
      name: input.name,
      description: input.description || undefined,
      symbol: input.symbol || undefined,
      decimals: 0,
      isBooleanAmount: true,
      artifactUri: input.artifactUri,
      displayUri: input.displayUri,
      thumbnailUri: input.thumbnailUri,
      minter: input.minter,
      creators: input.creator ? [input.creator] : undefined,
      formats: [{ uri: input.artifactUri, mimeType: input.mimeType, fileSize: input.fileSize }],
      attributes: input.traits.map((trait) => ({ name: trait.layer, value: trait.value })),
      mintingTool: "Pasta Protocol Rotini 2",
      "pasta:seed": input.seed,
      "pasta:projectId": input.projectId,
      "pasta:iteration": input.iteration,
      "pasta:generatorUri": input.generatorUri,
      "pasta:artifactSha256": input.digest,
    };
  }

  async function run({ config, state, project, setStatus, reload }) {
    const projectId = Number(config.tokenId || 0);
    const provider = MD.pinProviderFromForm();
    let storage = await state.contract.storage();
    let reservation = await latestReservation(storage, state.account, projectId);
    if (!reservation) {
      if (!project?.active) throw new Error("This generator project is closed.");
      setStatus("Reserve the token id, seed, price, and supply slot in your wallet…");
      const walletContract = await MD.getToolkit().wallet.at(config.contract);
      const operation = await walletContract.methodsObject.reserve_iteration(projectId).send({ amount: number(project.price), mutez: true });
      await operation.confirmation();
      storage = await state.contract.storage();
      reservation = await latestReservation(storage, state.account, projectId);
      if (!reservation) throw new Error("Reservation confirmed but could not be recovered from contract storage.");
    } else {
      setStatus(`Resuming reservation ${reservation.id}…`);
    }

    try {
      const rendered = await render(project, reservation.value, setStatus);
      const output = root.RotiniArtifacts.OUTPUTS[rendered.outputMode];
      const tokenId = number(reservation.value.token_id);
      const iteration = number(reservation.value.iteration);
      const name = `${rendered.manifest.name || "Rotini"} #${iteration + 1}`;
      const digest = await root.RotiniArtifacts.sha256(rendered.artifactBlob);
      setStatus(`Pinning the finished ${output.mimeType} artifact…`);
      const artifactUri = "ipfs://" + await MD.pinBlob(provider, rendered.artifactBlob, `rotini-${tokenId}.${output.extension}`);
      let displayUri = artifactUri;
      let thumbnailUri = artifactUri;
      if (rendered.outputMode === "zip") {
        setStatus("Pinning the interactive token cover…");
        displayUri = "ipfs://" + await MD.pinBlob(provider, rendered.coverBlob, `rotini-${tokenId}-cover.png`);
        thumbnailUri = displayUri;
      }
      const creator = String(rendered.manifest.creator || project.treasury || "");
      const metadata = tokenMetadata({
        name,
        description: rendered.manifest.description,
        symbol: text(project.symbol),
        artifactUri,
        displayUri,
        thumbnailUri,
        mimeType: output.mimeType,
        fileSize: rendered.artifactBlob.size,
        minter: state.account,
        creator,
        traits: rendered.traits,
        seed: rendered.seed,
        projectId,
        iteration,
        generatorUri: rendered.generatorUri,
        digest: digest.hex,
      });
      setStatus("Pinning standard token metadata…");
      const metadataUri = "ipfs://" + await MD.pinJson(provider, metadata, `rotini-${tokenId}.json`);
      setStatus(`Finalize reservation ${reservation.id} and mint token ${tokenId} in your wallet…`);
      const walletContract = await MD.getToolkit().wallet.at(config.contract);
      const finalize = await walletContract.methodsObject.finalize_iteration({
        reservation_id: reservation.id,
        metadata_uri: MD.utf8ToHex(metadataUri),
        artifact_uri: MD.utf8ToHex(artifactUri),
        display_uri: MD.utf8ToHex(displayUri),
        thumbnail_uri: MD.utf8ToHex(thumbnailUri),
        mime_type: MD.utf8ToHex(output.mimeType),
        artifact_hash: digest.hex,
      }).send();
      await finalize.confirmation();
      MD.logEvent("rotini.iteration_minted", "Rotini collector finalized a self-contained iteration token", {
        contract: config.contract,
        network: config.network,
        projectId,
        tokenId,
        outputMode: rendered.outputMode,
        artifactUri,
        metadataUri,
        artifactSha256: digest.hex,
      });
      await reload();
      setStatus(`${output.mimeType} token ${tokenId} is finalized on Tezos.`);
      return { tokenId, artifactUri, metadataUri };
    } catch (error) {
      throw new Error(`${error.message || error} Reservation ${reservation.id} remains recoverable until expiry; press the button again to resume.`);
    }
  }

  root.PastaRotiniMint = Object.freeze({ renderProject, run, tokenMetadata });
})(typeof window !== "undefined" ? window : globalThis);
