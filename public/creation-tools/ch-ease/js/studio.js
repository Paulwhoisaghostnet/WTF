"use strict";

(() => {
  const PACKAGE_SCHEMA = "wtfos.pasta.chease-package.v1";
  const DRAFT_SCHEMA = "pasta-chease-draft@1";
  const WORKSPACE_KEY = "wtfos.pasta.colander.workspace.v1";
  const HANDOFF_PREFIX = "wtfos.pasta.handoff.v1";
  const HANDOFF_ENVELOPE = "pasta-handoff-envelope@1";
  const HANDOFF_TTL_MS = 5 * 60 * 1000;
  const TARGETS = new Set(["spaghetti", "gnocchi", "ravioli", "rotini", "penne", "lasagna"]);
  const ROUTES = Object.fromEntries([...TARGETS].map((id) => [id, `/creation-tools/${id}/index.html`]));
  const params = new URLSearchParams(location.search);
  const project = {
    id: params.get("projectId") || "standalone",
    title: params.get("projectTitle") || "",
    network: params.get("network") === "mainnet" ? "mainnet" : "shadownet",
    connected: params.get("handoff") === "colander-workspace" && Boolean(params.get("projectId")),
  };
  const draftKey = `wtfos.pasta.chease.draft.v1:${project.id}`;
  const files = new Map();
  let state;

  const $ = (id) => document.getElementById(id);
  const safeId = () => crypto.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const text = (value) => String(value || "").trim();
  const fileName = (value) => text(value).replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"") || "artwork.bin";
  const uri = (value) => { const v=text(value); return v && !v.includes("://") && !v.startsWith("ipfs://") ? `ipfs://${v}` : v; };
  state = loadDraft() || { schema:DRAFT_SCHEMA, title:project.title || "Untitled collection", symbol:"PASTA", description:"", targetApp:"spaghetti", kind:"collection", items:[] };

  function status(message, tone="") { $("status").textContent=message; $("status").dataset.tone=tone; }
  function emit(type, detail={}) { window.dispatchEvent(new CustomEvent("pasta-protocol", { detail:{ type, app:"ch-ease", ...detail } })); }
  function loadDraft() { try { const value=JSON.parse(localStorage.getItem(draftKey)||"null"); return value?.schema===DRAFT_SCHEMA ? normalizeDraft(value) : null; } catch (_) { return null; } }
  function normalizeDraft(value) {
    return { schema:DRAFT_SCHEMA, title:text(value.title)||"Untitled collection", symbol:text(value.symbol)||"PASTA", description:text(value.description), targetApp:TARGETS.has(value.targetApp)?value.targetApp:"spaghetti", kind:value.kind==="single_token"?"single_token":"collection", items:Array.isArray(value.items)?value.items.filter(Boolean).map((item,index)=>({ id:text(item.id)||safeId(), fileName:fileName(item.fileName||`token-${index+1}`), mimeType:text(item.mimeType), name:text(item.name)||`Token ${index+1}`, description:text(item.description), artifactUri:text(item.artifactUri), tags:Array.isArray(item.tags)?item.tags.map(text).filter(Boolean):[], attributes:Array.isArray(item.attributes)?item.attributes.filter((a)=>text(a?.name)).map((a)=>({name:text(a.name),value:String(a.value??"")})):[] })):[] };
  }
  function readForm() { state.title=text($("title").value)||"Untitled collection"; state.symbol=text($("symbol").value)||"PASTA"; state.description=text($("description").value); state.targetApp=TARGETS.has($("target-app").value)?$("target-app").value:"spaghetti"; state.kind=$("package-kind").value==="single_token"?"single_token":"collection"; }
  function saveDraft(message="Draft saved locally.") {
    readForm(); localStorage.setItem(draftKey,JSON.stringify(state)); recordWorkspaceDraft(); updateSummary(); status(message); emit("pasta_protocol.draft_saved",{projectId:project.id,itemCount:state.items.length});
  }
  function recordWorkspaceDraft() {
    if (!project.connected) return;
    try {
      const projects=JSON.parse(localStorage.getItem(WORKSPACE_KEY)||"[]");
      const index=Array.isArray(projects)?projects.findIndex((item)=>item?.id===project.id):-1;
      if (index<0) return;
      const now=new Date().toISOString(); const current=projects[index];
      current.toolId="ch-ease"; current.stage=current.stage==="planning"?"preparing":current.stage; current.updatedAt=now;
      current.drafts=[...(Array.isArray(current.drafts)?current.drafts:[]).filter((draft)=>draft?.storageKey!==draftKey),{schema:"pasta-studio-draft-ref@1",toolId:"ch-ease",storageKey:draftKey,savedAt:now,summary:`${state.title} · ${state.items.length} prepared item${state.items.length===1?"":"s"}`}];
      localStorage.setItem(WORKSPACE_KEY,JSON.stringify(projects));
    } catch (_) { status("Draft saved, but the Colander project could not be updated.","error"); }
  }
  function parseAttributes(raw) { if (!text(raw)) return []; const parsed=JSON.parse(raw); if (!Array.isArray(parsed)) throw new Error("Attributes must be a JSON array."); return parsed.filter((a)=>text(a?.name)).map((a)=>({name:text(a.name),value:String(a.value??"")})); }
  function render() {
    $("title").value=state.title; $("symbol").value=state.symbol; $("description").value=state.description; $("target-app").value=state.targetApp; $("package-kind").value=state.kind;
    const root=$("items"); root.replaceChildren();
    state.items.forEach((item,index)=>{
      const card=$("item-template").content.firstElementChild.cloneNode(true); card.dataset.id=item.id;
      card.querySelector(".file-name").textContent=`${index+1}. ${item.fileName}`; card.querySelector(".token-name").value=item.name; card.querySelector(".artifact-uri").value=item.artifactUri; card.querySelector(".token-description").value=item.description; card.querySelector(".tags").value=item.tags.join(", "); card.querySelector(".attributes").value=JSON.stringify(item.attributes);
      card.querySelector(".item-note").textContent=files.has(item.id)?`${item.mimeType||"file"} selected${item.artifactUri?" · durable URI ready":" for this archive session"}.`:"File bytes not loaded. Reselect media if you need it in the ZIP.";
      const update=()=>{ try { item.name=text(card.querySelector(".token-name").value); item.artifactUri=text(card.querySelector(".artifact-uri").value); item.description=text(card.querySelector(".token-description").value); item.tags=card.querySelector(".tags").value.split(",").map(text).filter(Boolean); item.attributes=parseAttributes(card.querySelector(".attributes").value); saveDraft(); } catch (error) { status(error.message,"error"); } };
      card.querySelectorAll("input,textarea").forEach((field)=>{ field.addEventListener("input",update); field.addEventListener("change",update); });
      card.querySelector(".remove").onclick=()=>{ state.items=state.items.filter((candidate)=>candidate.id!==item.id); files.delete(item.id); render(); saveDraft("Item removed."); };
      root.appendChild(card);
    }); updateSummary();
  }
  function addItem(source={}) { const next={id:safeId(),fileName:fileName(source.fileName||`token-${state.items.length+1}`),mimeType:text(source.mimeType),name:text(source.name)||text(source.fileName).replace(/\.[^.]+$/," ").trim()||`Token ${state.items.length+1}`,description:text(source.description),artifactUri:text(source.artifactUri),tags:Array.isArray(source.tags)?source.tags:[],attributes:Array.isArray(source.attributes)?source.attributes:[]}; state.items.push(next); return next; }
  function addFiles(list) { [...list].forEach((file)=>{ const item=addItem({fileName:file.name,mimeType:file.type}); files.set(item.id,file); }); render(); saveDraft(`${list.length} media file${list.length===1?"":"s"} staged locally.`); }
  function pinProvider() {
    if ($("pin-provider").value === "node") {
      const raw=text($("node-url").value); if(!raw)throw new Error("Enter your IPFS node HTTP API URL.");
      let parsed; try { parsed=new URL(raw); } catch (_) { throw new Error("Enter a valid IPFS node HTTP API URL."); }
      if(!["http:","https:"].includes(parsed.protocol))throw new Error("The IPFS node URL must use HTTP or HTTPS.");
      return {kind:"node",url:parsed.href.replace(/\/+$/g,"")};
    }
    const jwt=text($("pinata-jwt").value); if(!jwt)throw new Error("Enter your Pinata JWT.");
    return {kind:"pinata",jwt};
  }
  async function pinFile(provider,file) {
    const form=new FormData(); form.append("file",file,file.name);
    const endpoint=provider.kind==="pinata"?"https://api.pinata.cloud/pinning/pinFileToIPFS":`${provider.url}/api/v0/add?pin=true&cid-version=1`;
    const response=await fetch(endpoint,{method:"POST",headers:provider.kind==="pinata"?{Authorization:`Bearer ${provider.jwt}`}:{},body:form});
    if(!response.ok)throw new Error(`${provider.kind==="pinata"?"Pinata":"IPFS node"} error ${response.status}: ${await response.text()}`);
    let result;
    if(provider.kind==="pinata")result=await response.json();
    else { const body=(await response.text()).trim().split("\n").filter(Boolean).pop(); try { result=JSON.parse(body); } catch (_) { throw new Error("The IPFS node returned an invalid response."); } }
    const cid=text(result?.IpfsHash||result?.Hash||result?.cid); if(!cid)throw new Error("The pinning provider did not return a CID.");
    return cid;
  }
  async function pinMedia() {
    const candidates=state.items.filter((item)=>files.has(item.id)&&!text(item.artifactUri));
    if(!candidates.length)throw new Error("Load at least one unpinned media file first.");
    const provider=pinProvider(); $("pin-media").disabled=true;
    try {
      for(let index=0;index<candidates.length;index+=1){
        const item=candidates[index]; status(`Pinning ${index+1} of ${candidates.length}: ${item.fileName}…`);
        const cid=await pinFile(provider,files.get(item.id)); item.artifactUri=`ipfs://${cid}`;
        render(); saveDraft(`Pinned ${index+1} of ${candidates.length} media file${candidates.length===1?"":"s"}.`);
        emit("chease.media_pinned",{projectId:project.id,itemId:item.id,cid,provider:provider.kind});
      }
      status(`${candidates.length} media file${candidates.length===1?"":"s"} pinned. The package is ready for publisher handoff.`);
    } finally { $("pin-media").disabled=false; }
  }
  function archivePath(item,index) { return `media/${String(index+1).padStart(4,"0")}-${fileName(item.fileName)}`; }
  function packageItem(item, archive=false, index=0) { const artifact=uri(item.artifactUri)||(archive&&files.has(item.id)?archivePath(item,index):undefined); return {name:item.name,description:item.description||undefined,artifactUri:artifact,mimeType:item.mimeType||files.get(item.id)?.type||undefined,tags:item.tags.length?item.tags:undefined,attributes:item.attributes.length?item.attributes:undefined}; }
  function buildPackage(archive=false) {
    readForm(); if (!state.items.length) throw new Error("Add at least one token item."); if (state.items.some((item)=>!text(item.name))) throw new Error("Every token item needs a name.");
    if (state.kind==="single_token") { if(state.items.length!==1)throw new Error("A single-token package must contain exactly one item."); return {schemaVersion:PACKAGE_SCHEMA,kind:"single_token",targetApp:state.targetApp,token:packageItem(state.items[0],archive,0)}; }
    return {schemaVersion:PACKAGE_SCHEMA,kind:"collection",targetApp:state.targetApp,title:state.title,description:state.description||undefined,symbol:state.symbol||undefined,items:state.items.map((item,index)=>packageItem(item,archive,index))};
  }
  function handoffPackage() { const pkg=buildPackage(false); const items=pkg.kind==="collection"?pkg.items:[pkg.token]; if (items.some((item)=>!item.artifactUri||item.artifactUri.startsWith("media/"))) throw new Error("Add an IPFS CID or durable artifact URI to every handed-off item. Local file bytes remain available in the ZIP only."); return pkg; }
  function download(blob,name) { const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),0); }
  function slug() { return fileName(state.title.toLowerCase()).replace(/\.[^.]+$/g,"")||"chease-package"; }
  function updateSummary() { const withFiles=state.items.filter((item)=>files.has(item.id)).length; const durable=state.items.filter((item)=>text(item.artifactUri)).length; $("summary").textContent=`${state.items.length} item${state.items.length===1?"":"s"} · ${withFiles} file${withFiles===1?"":"s"} loaded · ${durable} durable · ${state.targetApp} ${state.kind.replace("_"," ")}`; }
  async function importPackage(file) { const value=JSON.parse(await file.text()); if (value?.schemaVersion!==PACKAGE_SCHEMA||!TARGETS.has(value.targetApp)||!["collection","single_token"].includes(value.kind)) throw new Error("That is not a supported CH-EASE v1 package."); const items=value.kind==="collection"?value.items:[value.token]; state=normalizeDraft({schema:DRAFT_SCHEMA,title:value.title||value.token?.name,symbol:value.symbol,description:value.description,targetApp:value.targetApp,kind:value.kind,items:items.map((item,index)=>({...item,id:safeId(),fileName:item.artifactUri?.startsWith("media/")?item.artifactUri.slice(6):`token-${index+1}`}))}); render(); saveDraft("Package imported into a local draft."); emit("pasta_protocol.draft_imported",{itemCount:state.items.length}); }

  $("media-files").onchange=(event)=>{ if(event.target.files?.length)addFiles(event.target.files); event.target.value=""; };
  $("pin-provider").onchange=()=>{ const node=$("pin-provider").value==="node"; $("pinata-row").hidden=node; $("node-row").hidden=!node; };
  $("pin-media").onclick=async()=>{ try { await pinMedia(); } catch(error){status(error.message,"error");} };
  $("add-item").onclick=()=>{ addItem(); render(); saveDraft("Metadata-only item added."); };
  $("import-package").onchange=async(event)=>{ try { if(event.target.files?.[0])await importPackage(event.target.files[0]); } catch(error){status(error.message,"error");} event.target.value=""; };
  ["title","symbol","description"].forEach((id)=>{ $(id).addEventListener("input",()=>saveDraft()); $(id).addEventListener("change",()=>saveDraft()); });
  ["target-app","package-kind"].forEach((id)=>$(id).addEventListener("change",()=>saveDraft()));
  $("download-json").onclick=()=>{ try { const pkg=buildPackage(true); download(new Blob([JSON.stringify(pkg,null,2)],{type:"application/json"}),`${slug()}.chease.json`); status("Portable package JSON downloaded."); emit("chease.package_exported",{targetApp:state.targetApp,kind:state.kind}); } catch(error){status(error.message,"error");} };
  $("download-archive").onclick=async()=>{ try { if(!window.JSZip)throw new Error("ZIP support did not load."); const pkg=buildPackage(true); const zip=new JSZip(); zip.file("package.chease.json",JSON.stringify(pkg,null,2)); state.items.forEach((item,index)=>{ const file=files.get(item.id); if(file)zip.file(archivePath(item,index),file); }); zip.file("README.txt","CH-EASE portable archive\n\nOpen package.chease.json in any Pasta Protocol publisher. Media bytes are in media/. Pin them to IPFS and replace media/ references with ipfs:// CIDs before publishing.\n"); download(await zip.generateAsync({type:"blob",compression:"DEFLATE"}),`${slug()}.chease.zip`); status("Media archive ZIP downloaded."); emit("chease.package_exported",{format:"zip",fileCount:files.size}); } catch(error){status(error.message,"error");} };
  $("open-publisher").onclick=()=>{ try { const pkg=handoffPackage(); const key=`${HANDOFF_PREFIX}:${state.targetApp}`; let staged=false; try{sessionStorage.setItem(key,JSON.stringify(pkg));staged=true;}catch(_){} try{localStorage.setItem(key,JSON.stringify({schema:HANDOFF_ENVELOPE,expiresAt:Date.now()+HANDOFF_TTL_MS,payload:pkg}));staged=true;}catch(_){} if(!staged)throw new Error("Browser storage is unavailable; download the package instead."); const query=new URLSearchParams({handoff:"chease-package",handoffKey:key}); if(project.connected){query.set("colanderHandoff","colander-workspace");query.set("projectId",project.id);query.set("projectTitle",project.title||state.title);query.set("network",project.network);} window.open(`${ROUTES[state.targetApp]}?${query}`,"_blank","noopener"); status(`Package handed to ${state.targetApp}.`); emit("chease.package_handoff_opened",{targetApp:state.targetApp,projectId:project.id}); } catch(error){status(error.message,"error");} };

  render(); if(state.items.length) status(`Recovered ${state.items.length} metadata item${state.items.length===1?"":"s"}. Reselect local files for archive export.`); else if(project.connected) saveDraft(`Preparing ${project.title||"Colander project"} locally.`);
})();
