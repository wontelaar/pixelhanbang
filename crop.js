(() => {
  "use strict";

  const EDITOR_LONG = 720;
  const input = document.querySelector("#fileInput");
  const dropzone = document.querySelector("#dropzone");
  const chooseButton = document.querySelector("#chooseButton");
  const fileList = document.querySelector("#fileList");
  const editorWrap = document.querySelector("#cropEditorWrap");
  const stage = document.querySelector("#cropStage");
  const canvas = document.querySelector("#cropCanvas");
  const ratioSelect = document.querySelector("#ratio");
  const zoom = document.querySelector("#zoom");
  const zoomValue = document.querySelector("#zoomValue");
  const resetButton = document.querySelector("#resetButton");
  const outputSize = document.querySelector("#outputSize");
  const format = document.querySelector("#format");
  const sizeNote = document.querySelector("#sizeNote");
  const processButton = document.querySelector("#processButton");
  const status = document.querySelector("#status");
  let file = null;
  let image = null;
  let objectUrl = null;
  let editorWidth = EDITOR_LONG;
  let editorHeight = EDITOR_LONG;
  let baseScale = 1;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;
  let pointerX = 0;
  let pointerY = 0;

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

  ratioSelect.addEventListener("change", () => {
    if (!image) return;
    applyRatio(true);
  });
  zoom.addEventListener("input", changeZoom);
  resetButton.addEventListener("click", resetPosition);
  outputSize.addEventListener("change", updateSizeNote);
  processButton.addEventListener("click", saveCrop);

  stage.addEventListener("pointerdown", event => {
    if (!image) return;
    dragging = true;
    pointerX = event.clientX;
    pointerY = event.clientY;
    stage.setPointerCapture(event.pointerId);
    stage.classList.add("is-dragging");
  });
  stage.addEventListener("pointermove", event => {
    if (!dragging || !image) return;
    const factor = editorWidth / stage.getBoundingClientRect().width;
    offsetX += (event.clientX - pointerX) * factor;
    offsetY += (event.clientY - pointerY) * factor;
    pointerX = event.clientX;
    pointerY = event.clientY;
    clampPosition();
    drawEditor();
  });
  ["pointerup", "pointercancel"].forEach(type => stage.addEventListener(type, event => {
    dragging = false;
    stage.classList.remove("is-dragging");
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    updateSizeNote();
  }));
  stage.addEventListener("keydown", event => {
    if (!image || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 20 : 6;
    if (event.key === "ArrowLeft") offsetX -= step;
    if (event.key === "ArrowRight") offsetX += step;
    if (event.key === "ArrowUp") offsetY -= step;
    if (event.key === "ArrowDown") offsetY += step;
    clampPosition();
    drawEditor();
    updateSizeNote();
  });

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
      // 배경을 없앤 PNG처럼 투명할 수 있는 사진은 투명함이 유지되게 PNG로 저장한다.
      if (candidate.type === "image/png") format.value = "png";
      renderFile();
      zoom.value = "100";
      zoomValue.textContent = "100%";
      applyRatio(false);
      editorWrap.classList.add("is-visible");
      processButton.disabled = false;
      resetButton.disabled = false;
      zoom.disabled = false;
      setStatus("사진을 움직이고 확대해서 남길 부분을 틀 안에 맞춰 주세요.", "");
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
    input.value = "";
    editorWrap.classList.remove("is-visible");
    processButton.disabled = true;
    resetButton.disabled = true;
    zoom.disabled = true;
    sizeNote.textContent = "";
    setStatus("", "");
  }

  function currentRatio() {
    if (ratioSelect.value === "original") return image.width / image.height;
    const [w, h] = ratioSelect.value.split(":").map(Number);
    return w / h;
  }

  // 틀 비율을 바꿔도 보고 있던 부분의 중심은 그대로 유지한다.
  function applyRatio(keepCenter) {
    let centerX = image.width / 2;
    let centerY = image.height / 2;
    if (keepCenter) {
      centerX = (editorWidth / 2 - offsetX) / scale;
      centerY = (editorHeight / 2 - offsetY) / scale;
    }
    const ratio = currentRatio();
    if (ratio >= 1) {
      editorWidth = EDITOR_LONG;
      editorHeight = Math.round(EDITOR_LONG / ratio);
    } else {
      editorHeight = EDITOR_LONG;
      editorWidth = Math.round(EDITOR_LONG * ratio);
    }
    canvas.width = editorWidth;
    canvas.height = editorHeight;
    stage.style.aspectRatio = `${editorWidth} / ${editorHeight}`;
    stage.style.width = `min(100%, ${Math.round(Math.min(560, 520 * ratio))}px)`;
    baseScale = Math.max(editorWidth / image.width, editorHeight / image.height);
    scale = baseScale * Number(zoom.value) / 100;
    offsetX = editorWidth / 2 - centerX * scale;
    offsetY = editorHeight / 2 - centerY * scale;
    clampPosition();
    drawEditor();
    updateSizeNote();
  }

  function changeZoom() {
    if (!image) return;
    const centerX = (editorWidth / 2 - offsetX) / scale;
    const centerY = (editorHeight / 2 - offsetY) / scale;
    scale = baseScale * Number(zoom.value) / 100;
    offsetX = editorWidth / 2 - centerX * scale;
    offsetY = editorHeight / 2 - centerY * scale;
    zoomValue.textContent = zoom.value + "%";
    clampPosition();
    drawEditor();
    updateSizeNote();
  }

  function resetPosition() {
    if (!image) return;
    zoom.value = "100";
    zoomValue.textContent = "100%";
    scale = baseScale;
    offsetX = (editorWidth - image.width * scale) / 2;
    offsetY = (editorHeight - image.height * scale) / 2;
    clampPosition();
    drawEditor();
    updateSizeNote();
  }

  // 틀 안에 빈 곳이 생기지 않도록 사진이 항상 틀을 덮게 한다.
  function clampPosition() {
    offsetX = Math.min(0, Math.max(editorWidth - image.width * scale, offsetX));
    offsetY = Math.min(0, Math.max(editorHeight - image.height * scale, offsetY));
  }

  function drawEditor() {
    if (!image) return;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, editorWidth, editorHeight);
    ctx.drawImage(image, offsetX, offsetY, image.width * scale, image.height * scale);
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, .7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 1; i < 3; i += 1) {
      ctx.moveTo(editorWidth * i / 3, 0);
      ctx.lineTo(editorWidth * i / 3, editorHeight);
      ctx.moveTo(0, editorHeight * i / 3);
      ctx.lineTo(editorWidth, editorHeight * i / 3);
    }
    ctx.stroke();
    ctx.restore();
  }

  function cropRegion() {
    return {
      x: -offsetX / scale,
      y: -offsetY / scale,
      width: editorWidth / scale,
      height: editorHeight / scale
    };
  }

  function outputDimensions(region) {
    const ratio = editorWidth / editorHeight;
    if (outputSize.value === "original") {
      return { width: Math.max(1, Math.round(region.width)), height: Math.max(1, Math.round(region.height)) };
    }
    const width = Number(outputSize.value);
    return { width, height: Math.max(1, Math.round(width / ratio)) };
  }

  function updateSizeNote() {
    if (!image) return;
    const region = cropRegion();
    const size = outputDimensions(region);
    const upscale = size.width > region.width * 1.02;
    sizeNote.textContent = `저장 크기: ${size.width} × ${size.height}` + (upscale ? " · 잘라낸 부분보다 커서 조금 흐려질 수 있어요" : "");
  }

  if (window.PixelHandoff) window.PixelHandoff.mount(status, async () => image && file ? (await makeCrop()).output : null);

  async function makeCrop() {
    const region = cropRegion();
    const size = outputDimensions(region);
    const mime = format.value === "png" ? "image/png" : format.value === "webp" ? "image/webp" : "image/jpeg";
    const result = document.createElement("canvas");
    result.width = size.width;
    result.height = size.height;
    const ctx = result.getContext("2d", { alpha: mime !== "image/jpeg" });
    if (mime === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size.width, size.height);
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, size.width, size.height);
    const blob = await new Promise((resolve, reject) => result.toBlob(value => value ? resolve(value) : reject(new Error("save failed")), mime, .92));
    return { size, output: { blob, name: outputName(file.name, mime) } };
  }

  async function saveCrop() {
    if (!image || !file) return;
    processButton.disabled = true;
    setStatus("잘라낸 사진을 저장하고 있어요…", "");
    try {
      const { size, output } = await makeCrop();
      downloadBlob(output.blob, output.name);
      setStatus(`${size.width} × ${size.height} 사진 저장 준비 완료 · ${formatBytes(output.blob.size)}`, "success");
    } catch (error) {
      console.error(error);
      setStatus("저장하지 못했어요. 저장 크기를 줄여 다시 시도해 주세요.", "error");
    } finally {
      processButton.disabled = false;
    }
  }

  function outputName(name, mime) {
    const base = name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "image";
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    return `${base}-crop.${ext}`;
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
