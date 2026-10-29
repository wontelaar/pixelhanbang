(() => {
  "use strict";

  const PREVIEW_LONG = 1000;
  const input = document.querySelector("#fileInput");
  const dropzone = document.querySelector("#dropzone");
  const chooseButton = document.querySelector("#chooseButton");
  const fileList = document.querySelector("#fileList");
  const previewWrap = document.querySelector("#mosaicPreviewWrap");
  const stage = document.querySelector("#mosaicStage");
  const canvas = document.querySelector("#mosaicCanvas");
  const regionCount = document.querySelector("#regionCount");
  const effect = document.querySelector("#effect");
  const strength = document.querySelector("#strength");
  const strengthValue = document.querySelector("#strengthValue");
  const strengthGroup = document.querySelector("#strengthGroup");
  const undoButton = document.querySelector("#undoButton");
  const clearButton = document.querySelector("#clearButton");
  const processButton = document.querySelector("#processButton");
  const status = document.querySelector("#status");
  let file = null;
  let image = null;
  let objectUrl = null;
  let regions = [];
  let drawing = null;

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

  effect.addEventListener("change", () => {
    strengthGroup.classList.toggle("hidden", effect.value === "fill");
    drawPreview();
  });
  strength.addEventListener("input", () => {
    strengthValue.textContent = strength.value;
    drawPreview();
  });
  undoButton.addEventListener("click", () => {
    regions.pop();
    updateRegionControls();
    drawPreview();
  });
  clearButton.addEventListener("click", () => {
    regions = [];
    updateRegionControls();
    drawPreview();
  });
  processButton.addEventListener("click", saveImage);

  canvas.addEventListener("pointerdown", event => {
    if (!image) return;
    event.preventDefault();
    const point = toImagePoint(event);
    drawing = { startX: point.x, startY: point.y, x: point.x, y: point.y };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", event => {
    if (!drawing) return;
    const point = toImagePoint(event);
    drawing.x = point.x;
    drawing.y = point.y;
    drawPreview();
  });
  ["pointerup", "pointercancel"].forEach(type => canvas.addEventListener(type, event => {
    if (!drawing) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    const region = normalize(drawing);
    drawing = null;
    const minimum = Math.max(image.width, image.height) * 0.008;
    if (type === "pointerup" && region.width >= minimum && region.height >= minimum) {
      regions.push(region);
      updateRegionControls();
    }
    drawPreview();
  }));

  async function selectFile(candidate) {
    if (!candidate || !/^image\/(jpeg|png|webp)$/.test(candidate.type) || candidate.size > 25 * 1024 * 1024) {
      setStatus("JPG, PNG, WebP 이미지(25MB 이하) 한 장을 선택해 주세요.", "error");
      return;
    }
    setStatus("사진을 불러오고 있어요…", "");
    try {
      const decoded = await createImageBitmap(candidate, { imageOrientation: "from-image" });
      closeImage(image);
      file = candidate;
      image = decoded;
      regions = [];
      const fit = Math.min(1, PREVIEW_LONG / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * fit));
      canvas.height = Math.max(1, Math.round(image.height * fit));
      renderFile();
      previewWrap.classList.add("is-visible");
      updateRegionControls();
      drawPreview();
      setStatus("가릴 부분을 사진 위에서 드래그해 네모로 지정하세요.", "");
    } catch (error) {
      console.error(error);
      setStatus("이 사진을 불러오지 못했어요. 다른 사진으로 다시 시도해 주세요.", "error");
    }
  }

  function renderFile() {
    clearObjectUrl();
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
    meta.textContent = `${formatBytes(file.size)} · ${image.width} × ${image.height}`;
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

  function clearObjectUrl() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }

  function clearFile() {
    clearObjectUrl();
    fileList.replaceChildren();
    closeImage(image);
    file = null;
    image = null;
    regions = [];
    input.value = "";
    previewWrap.classList.remove("is-visible");
    updateRegionControls();
    setStatus("", "");
  }

  function updateRegionControls() {
    const count = regions.length;
    regionCount.textContent = count ? `가린 곳 ${count}개` : "드래그해서 가릴 곳을 지정하세요";
    undoButton.disabled = count === 0;
    clearButton.disabled = count === 0;
    processButton.disabled = !image || count === 0;
  }

  function toImagePoint(event) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * image.width;
    const y = (event.clientY - rect.top) / rect.height * image.height;
    return { x: Math.min(image.width, Math.max(0, x)), y: Math.min(image.height, Math.max(0, y)) };
  }

  function normalize(value) {
    return {
      x: Math.min(value.startX, value.x),
      y: Math.min(value.startY, value.y),
      width: Math.abs(value.x - value.startX),
      height: Math.abs(value.y - value.startY)
    };
  }

  // 가리는 칸 크기는 사진의 긴 변에 비례해서, 미리보기와 저장 결과가 같은 모양이 되게 한다.
  function blockSize() {
    return Math.max(4, Math.round(Math.max(image.width, image.height) * Number(strength.value) * 0.005));
  }

  function render(target) {
    const ctx = target.getContext("2d");
    const factor = target.width / image.width;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, target.width, target.height);
    const block = Math.max(2, blockSize() * factor);
    regions.forEach(region => {
      const x = Math.round(region.x * factor);
      const y = Math.round(region.y * factor);
      const width = Math.max(1, Math.round(region.width * factor));
      const height = Math.max(1, Math.round(region.height * factor));
      if (effect.value === "fill") {
        ctx.fillStyle = "#111111";
        ctx.fillRect(x, y, width, height);
        return;
      }
      const small = document.createElement("canvas");
      small.width = Math.max(1, Math.round(width / block));
      small.height = Math.max(1, Math.round(height / block));
      const smallCtx = small.getContext("2d");
      smallCtx.imageSmoothingEnabled = true;
      smallCtx.imageSmoothingQuality = "high";
      smallCtx.drawImage(target, x, y, width, height, 0, 0, small.width, small.height);
      ctx.save();
      ctx.imageSmoothingEnabled = effect.value === "blur";
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(small, 0, 0, small.width, small.height, x, y, width, height);
      ctx.restore();
    });
  }

  function drawPreview() {
    if (!image) return;
    render(canvas);
    const ctx = canvas.getContext("2d");
    const factor = canvas.width / image.width;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    regions.forEach(region => {
      ctx.strokeStyle = "rgba(21, 101, 216, .85)";
      ctx.strokeRect(region.x * factor, region.y * factor, region.width * factor, region.height * factor);
    });
    if (drawing) {
      const region = normalize(drawing);
      ctx.fillStyle = "rgba(21, 101, 216, .18)";
      ctx.fillRect(region.x * factor, region.y * factor, region.width * factor, region.height * factor);
      ctx.strokeStyle = "#1565d8";
      ctx.strokeRect(region.x * factor, region.y * factor, region.width * factor, region.height * factor);
    }
    ctx.restore();
  }

  if (window.PixelHandoff) window.PixelHandoff.mount(status, async () => image && file ? makeResult() : null);

  async function makeResult() {
    const mime = file.type === "image/png" ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
    const result = document.createElement("canvas");
    result.width = image.width;
    result.height = image.height;
    render(result);
    const blob = await new Promise((resolve, reject) => result.toBlob(value => value ? resolve(value) : reject(new Error("save failed")), mime, .92));
    return { blob, name: outputName(file.name, mime) };
  }

  async function saveImage() {
    if (!image || !file || !regions.length) return;
    processButton.disabled = true;
    setStatus("가린 사진을 저장하고 있어요…", "");
    try {
      const { blob, name } = await makeResult();
      downloadBlob(blob, name);
      setStatus(`가린 곳 ${regions.length}개 · ${image.width} × ${image.height} 저장 준비 완료`, "success");
    } catch (error) {
      console.error(error);
      setStatus("저장하지 못했어요. 다른 사진으로 다시 시도해 주세요.", "error");
    } finally {
      processButton.disabled = !image || regions.length === 0;
    }
  }

  function outputName(name, mime) {
    const base = name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "image";
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    return `${base}-mosaic.${ext}`;
  }

  function closeImage(value) {
    if (value && typeof value.close === "function") value.close();
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
