(() => {
  "use strict";

  const ORT_URL = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.js";
  const ORT_WASM = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/";
  const MODEL_URL = "models/migan_pipeline_v2.onnx";
  const PREVIEW_LONG = 1000;
  const input = document.querySelector("#fileInput");
  const dropzone = document.querySelector("#dropzone");
  const chooseButton = document.querySelector("#chooseButton");
  const fileList = document.querySelector("#fileList");
  const previewWrap = document.querySelector("#tagPreviewWrap");
  const canvas = document.querySelector("#tagCanvas");
  const paintNote = document.querySelector("#paintNote");
  const brush = document.querySelector("#brush");
  const brushValue = document.querySelector("#brushValue");
  const eraseButton = document.querySelector("#eraseButton");
  const clearPaintButton = document.querySelector("#clearPaintButton");
  const undoButton = document.querySelector("#undoButton");
  const processButton = document.querySelector("#processButton");
  const status = document.querySelector("#status");
  const stage = document.querySelector("#tagStage");
  const zoom = document.querySelector("#zoom");
  const zoomIn = document.querySelector("#zoomIn");
  const zoomOut = document.querySelector("#zoomOut");
  const zoomValue = document.querySelector("#zoomValue");
  const panButton = document.querySelector("#panButton");
  let file = null;
  let objectUrl = null;
  let work = null;      // 지금까지 지운 결과가 쌓이는 원본 크기 캔버스
  let mask = null;      // 칠한 곳(원본 크기). 흰색이 지울 곳
  let painted = null;   // 칠한 범위 {minX, minY, maxX, maxY}
  let history = [];     // 되돌리기용: 바뀌기 전 조각들
  let stroke = null;
  let sessionPromise = null;
  let busy = false;
  let panning = false;
  let pan = null;

  chooseButton.addEventListener("click", () => input.click());
  dropzone.addEventListener("click", event => {
    if (event.target.closest("button")) return;
    input.click();
  });
  dropzone.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      input.click();
    }
  });
  input.addEventListener("change", () => selectFile(input.files[0]));
  ["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => {
    event.preventDefault();
    dropzone.classList.add("is-over");
  }));
  ["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => {
    event.preventDefault();
    dropzone.classList.remove("is-over");
  }));
  dropzone.addEventListener("drop", event => selectFile(event.dataTransfer.files[0]));

  brush.addEventListener("input", () => { brushValue.textContent = brush.value; });
  eraseButton.addEventListener("click", eraseTag);
  clearPaintButton.addEventListener("click", () => {
    clearMask();
    drawPreview();
    updateControls();
  });
  undoButton.addEventListener("click", () => {
    const patch = history.pop();
    if (!patch) return;
    work.getContext("2d").putImageData(patch.data, patch.x, patch.y);
    drawPreview();
    updateControls();
    setStatus("한 단계 되돌렸어요.", "");
  });
  processButton.addEventListener("click", saveImage);

  zoom.addEventListener("input", () => setZoom(Number(zoom.value)));
  zoomIn.addEventListener("click", () => setZoom(Number(zoom.value) + 50));
  zoomOut.addEventListener("click", () => setZoom(Number(zoom.value) - 50));
  panButton.addEventListener("click", () => {
    panning = !panning;
    panButton.setAttribute("aria-pressed", String(panning));
    stage.classList.toggle("is-panning", panning);
  });
  // PC: Ctrl + 휠로 마우스 위치를 중심으로 확대·축소
  stage.addEventListener("wheel", event => {
    if (!work || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    setZoom(Number(zoom.value) + (event.deltaY < 0 ? 25 : -25), event);
  }, { passive: false });
  window.addEventListener("resize", () => { if (work) setZoom(Number(zoom.value)); });

  canvas.addEventListener("pointerdown", event => {
    if (!work || busy) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    if (panning) {
      pan = { x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop };
      return;
    }
    stroke = toImagePoint(event);
    paintDot(stroke, stroke);
    drawPreview();
  });
  canvas.addEventListener("pointermove", event => {
    if (pan) {
      stage.scrollLeft = pan.left - (event.clientX - pan.x);
      stage.scrollTop = pan.top - (event.clientY - pan.y);
      return;
    }
    if (!stroke) return;
    const point = toImagePoint(event);
    paintDot(stroke, point);
    stroke = point;
    drawPreview();
  });
  ["pointerup", "pointercancel"].forEach(type => canvas.addEventListener(type, event => {
    if (pan) {
      pan = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      return;
    }
    if (!stroke) return;
    stroke = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    updateControls();
  }));

  async function selectFile(candidate) {
    if (!candidate || !/^image\/(jpeg|png|webp)$/.test(candidate.type) || candidate.size > 25 * 1024 * 1024) {
      setStatus("JPG, PNG, WebP 이미지(25MB 이하) 한 장을 선택해 주세요.", "error");
      return;
    }
    setStatus("사진을 불러오고 있어요…", "");
    try {
      const bitmap = await createImageBitmap(candidate, { imageOrientation: "from-image" });
      file = candidate;
      work = document.createElement("canvas");
      work.width = bitmap.width;
      work.height = bitmap.height;
      work.getContext("2d").drawImage(bitmap, 0, 0);
      bitmap.close();
      mask = document.createElement("canvas");
      mask.width = work.width;
      mask.height = work.height;
      history = [];
      clearMask();
      renderFile();
      previewWrap.classList.add("is-visible");
      setZoom(100);
      updateControls();
      setStatus("택 위를 손가락이나 마우스로 칠한 뒤 ‘택 지우기’를 누르세요.", "");
      loadSession().catch(() => {});
    } catch (error) {
      console.error(error);
      setStatus("이 사진을 불러오지 못했어요. 다른 사진으로 다시 시도해 주세요.", "error");
    }
  }

  function renderFile() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    fileList.replaceChildren();
    const row = document.createElement("div");
    row.className = "file-row";
    const thumb = document.createElement("img");
    thumb.className = "file-thumb";
    thumb.alt = "";
    objectUrl = URL.createObjectURL(file);
    thumb.src = objectUrl;
    const info = document.createElement("div");
    const name = document.createElement("div");
    name.className = "file-name";
    name.textContent = file.name;
    const meta = document.createElement("div");
    meta.className = "file-meta";
    meta.textContent = `${formatBytes(file.size)} · ${work.width} × ${work.height}`;
    info.append(name, meta);
    const remove = document.createElement("button");
    remove.className = "remove-file";
    remove.type = "button";
    remove.setAttribute("aria-label", "이 이미지 삭제");
    remove.textContent = "×";
    remove.addEventListener("click", clearFile);
    row.append(thumb, info, remove);
    fileList.appendChild(row);
  }

  function clearFile() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    fileList.replaceChildren();
    file = null;
    work = null;
    mask = null;
    history = [];
    painted = null;
    input.value = "";
    previewWrap.classList.remove("is-visible");
    updateControls();
    setStatus("", "");
  }

  function clearMask() {
    if (mask) mask.getContext("2d").clearRect(0, 0, mask.width, mask.height);
    painted = null;
  }

  // 확대해도 붓은 화면에서 같은 크기로 보이게, 사진 기준 반지름은 배율만큼 줄인다.
  function brushRadius() {
    return Math.max(1, Number(brush.value) * Math.max(work.width, work.height) / PREVIEW_LONG / 2 / (Number(zoom.value) / 100));
  }

  // 화면에 맞춘 크기를 100%로 두고 확대한다. 미리보기 해상도도 함께 올려 확대해도 흐리지 않게 한다.
  function setZoom(value, anchorEvent) {
    if (!work) return;
    const level = Math.max(100, Math.min(500, Math.round(value / 25) * 25));
    const rect = stage.getBoundingClientRect();
    const anchorX = anchorEvent ? anchorEvent.clientX - rect.left : stage.clientWidth / 2;
    const anchorY = anchorEvent ? anchorEvent.clientY - rect.top : stage.clientHeight / 2;
    const oldWidth = canvas.getBoundingClientRect().width || 1;
    const ratioX = (stage.scrollLeft + anchorX - canvas.offsetLeft) / oldWidth;
    const ratioY = (stage.scrollTop + anchorY - canvas.offsetTop) / (canvas.getBoundingClientRect().height || 1);
    const style = getComputedStyle(stage);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const maxHeight = parseFloat(style.maxHeight) || 640;
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const aspect = work.width / work.height;
    // 스크롤 막대가 생겨도 100% 크기가 바뀌지 않게 테두리 바깥 폭 기준으로 맞춘다.
    const innerWidth = stage.offsetWidth - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth) - padX;
    const fitWidth = Math.max(80, Math.min(innerWidth, (maxHeight - padY) * aspect));
    const displayWidth = fitWidth * level / 100;
    const scale = Math.min(1, displayWidth * (window.devicePixelRatio || 1) / work.width);
    canvas.width = Math.max(1, Math.round(work.width * scale));
    canvas.height = Math.max(1, Math.round(work.height * scale));
    canvas.style.width = `${Math.round(displayWidth)}px`;
    zoom.value = String(level);
    zoomValue.textContent = level + "%";
    drawPreview();
    stage.scrollLeft = ratioX * displayWidth + canvas.offsetLeft - anchorX;
    stage.scrollTop = ratioY * displayWidth / aspect + canvas.offsetTop - anchorY;
  }

  function toImagePoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width * work.width,
      y: (event.clientY - rect.top) / rect.height * work.height
    };
  }

  function paintDot(from, to) {
    const radius = brushRadius();
    const ctx = mask.getContext("2d");
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#ffffff";
    ctx.lineCap = "round";
    ctx.lineWidth = radius * 2;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(to.x, to.y, radius, 0, Math.PI * 2);
    ctx.fill();
    const minX = Math.min(from.x, to.x) - radius;
    const minY = Math.min(from.y, to.y) - radius;
    const maxX = Math.max(from.x, to.x) + radius;
    const maxY = Math.max(from.y, to.y) + radius;
    painted = painted
      ? { minX: Math.min(painted.minX, minX), minY: Math.min(painted.minY, minY), maxX: Math.max(painted.maxX, maxX), maxY: Math.max(painted.maxY, maxY) }
      : { minX, minY, maxX, maxY };
  }

  function drawPreview() {
    if (!work) return;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(work, 0, 0, canvas.width, canvas.height);
    if (!painted) return;
    // 칠한 곳을 빨간 반투명으로 겹쳐 보여준다.
    const tint = document.createElement("canvas");
    tint.width = canvas.width;
    tint.height = canvas.height;
    const tintCtx = tint.getContext("2d");
    tintCtx.drawImage(mask, 0, 0, tint.width, tint.height);
    tintCtx.globalCompositeOperation = "source-in";
    tintCtx.fillStyle = "rgba(230, 40, 60, .5)";
    tintCtx.fillRect(0, 0, tint.width, tint.height);
    ctx.drawImage(tint, 0, 0);
  }

  function updateControls() {
    const hasWork = Boolean(work);
    eraseButton.disabled = !hasWork || !painted || busy;
    clearPaintButton.disabled = !hasWork || !painted || busy;
    undoButton.disabled = !history.length || busy;
    processButton.disabled = !hasWork || busy;
    brush.disabled = !hasWork;
    [zoom, zoomIn, zoomOut, panButton].forEach(control => { control.disabled = !hasWork; });
    paintNote.textContent = !hasWork ? "" : painted ? "칠한 곳이 빨갛게 보여요. ‘택 지우기’를 누르세요." : "택이 덮이도록 조금 넉넉하게 칠해 주세요.";
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("script load failed"));
      document.head.appendChild(script);
    });
  }

  // AI 실행 파일과 모델은 처음 한 번만 받아 두고 다시 쓴다.
  function loadSession() {
    if (!sessionPromise) {
      sessionPromise = (async () => {
        if (!window.ort) await loadScript(ORT_URL);
        window.ort.env.wasm.wasmPaths = ORT_WASM;
        return window.ort.InferenceSession.create(MODEL_URL, { executionProviders: ["wasm"] });
      })();
      sessionPromise.catch(() => { sessionPromise = null; });
    }
    return sessionPromise;
  }

  async function eraseTag() {
    if (!work || !painted || busy) return;
    busy = true;
    updateControls();
    setStatus("AI를 준비하고 있어요… 처음에는 약 30MB를 받느라 시간이 걸릴 수 있어요.", "");
    try {
      const session = await loadSession();
      setStatus("택을 지우고 있어요…", "");
      await new Promise(resolve => setTimeout(resolve, 30));
      // 칠한 곳 주변을 넉넉히 잘라 AI에 넘겨서, 큰 사진도 빠르고 가볍게 처리한다.
      const width = painted.maxX - painted.minX;
      const height = painted.maxY - painted.minY;
      const margin = Math.max(48, Math.max(width, height) * 1.5);
      const x = Math.max(0, Math.floor(painted.minX - margin));
      const y = Math.max(0, Math.floor(painted.minY - margin));
      const right = Math.min(work.width, Math.ceil(painted.maxX + margin));
      const bottom = Math.min(work.height, Math.ceil(painted.maxY + margin));
      const cropWidth = right - x;
      const cropHeight = bottom - y;
      const workCtx = work.getContext("2d");
      const before = workCtx.getImageData(x, y, cropWidth, cropHeight);
      const maskPixels = mask.getContext("2d").getImageData(x, y, cropWidth, cropHeight).data;
      const size = cropWidth * cropHeight;
      const imageData = new Uint8Array(size * 3);
      const maskData = new Uint8Array(size);
      for (let index = 0; index < size; index += 1) {
        imageData[index] = before.data[index * 4];
        imageData[size + index] = before.data[index * 4 + 1];
        imageData[size * 2 + index] = before.data[index * 4 + 2];
        maskData[index] = maskPixels[index * 4 + 3] > 0 ? 0 : 255;
      }
      const ort = window.ort;
      const output = await session.run({
        image: new ort.Tensor("uint8", imageData, [1, 3, cropHeight, cropWidth]),
        mask: new ort.Tensor("uint8", maskData, [1, 1, cropHeight, cropWidth])
      });
      const result = output[session.outputNames[0]].data;
      const after = new ImageData(cropWidth, cropHeight);
      for (let index = 0; index < size; index += 1) {
        after.data[index * 4] = result[index];
        after.data[index * 4 + 1] = result[size + index];
        after.data[index * 4 + 2] = result[size * 2 + index];
        after.data[index * 4 + 3] = before.data[index * 4 + 3];
      }
      history.push({ x, y, data: before });
      if (history.length > 20) history.shift();
      workCtx.putImageData(after, x, y);
      clearMask();
      drawPreview();
      setStatus("지웠어요. 남은 부분이 있으면 다시 칠해서 한 번 더 지우세요.", "success");
    } catch (error) {
      console.error(error);
      setStatus("AI를 불러오거나 실행하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요. 휴대폰에서 계속 안 되면 PC에서 시도해 주세요.", "error");
    } finally {
      busy = false;
      updateControls();
    }
  }

  async function saveImage() {
    if (!work || !file) return;
    processButton.disabled = true;
    try {
      const mime = file.type === "image/png" ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
      const blob = await new Promise((resolve, reject) => work.toBlob(value => value ? resolve(value) : reject(new Error("save failed")), mime, .95));
      const base = file.name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "image";
      const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
      downloadBlob(blob, `${base}-notag.${ext}`);
      setStatus(`${work.width} × ${work.height} 저장 준비 완료 · ${formatBytes(blob.size)}`, "success");
    } catch (error) {
      console.error(error);
      setStatus("저장하지 못했어요. 다시 시도해 주세요.", "error");
    } finally {
      updateControls();
    }
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function setStatus(message, kind) {
    status.textContent = message;
    status.className = "status" + (kind ? " " + kind : "");
  }
})();
