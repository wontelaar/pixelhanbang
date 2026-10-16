(() => {
  "use strict";

  const EDITOR_SIZE = 720;
  const input = document.querySelector("#fileInput");
  const dropzone = document.querySelector("#dropzone");
  const chooseButton = document.querySelector("#chooseButton");
  const fileList = document.querySelector("#fileList");
  const editorWrap = document.querySelector("#profileEditorWrap");
  const stage = document.querySelector("#profileStage");
  const canvas = document.querySelector("#profileCanvas");
  const processButton = document.querySelector("#processButton");
  const resetButton = document.querySelector("#resetButton");
  const zoom = document.querySelector("#zoom");
  const zoomValue = document.querySelector("#zoomValue");
  const outside = document.querySelector("#outside");
  const photoColorRow = document.querySelector("#photoColorRow");
  const photoColor = document.querySelector("#photoColor");
  const photoColorValue = document.querySelector("#photoColorValue");
  const backgroundHint = document.querySelector("#backgroundHint");
  const borderCount = document.querySelector("#borderCount");
  const borderControls = document.querySelector("#borderControls");
  const borderMode = document.querySelector("#borderMode");
  const outerBorderColor = document.querySelector("#outerBorderColor");
  const outerBorderWidth = document.querySelector("#outerBorderWidth");
  const outerBorderWidthValue = document.querySelector("#outerBorderWidthValue");
  const innerBorderControl = document.querySelector("#innerBorderControl");
  const innerBorderColor = document.querySelector("#innerBorderColor");
  const innerBorderWidth = document.querySelector("#innerBorderWidth");
  const innerBorderWidthValue = document.querySelector("#innerBorderWidthValue");
  const borderGapControl = document.querySelector("#borderGapControl");
  const borderGap = document.querySelector("#borderGap");
  const borderGapValue = document.querySelector("#borderGapValue");
  const outputSize = document.querySelector("#outputSize");
  const status = document.querySelector("#status");
  let file = null;
  let image = null;
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

  zoom.addEventListener("input", changeZoom);
  outside.addEventListener("change", () => {
    updateBackgroundControls();
    drawEditor();
  });
  photoColor.addEventListener("input", () => {
    photoColorValue.textContent = photoColor.value.toUpperCase();
    drawEditor();
  });
  borderCount.addEventListener("change", () => {
    updateBorderControls();
    drawEditor();
  });
  borderMode.addEventListener("change", drawEditor);
  [outerBorderColor, innerBorderColor].forEach(control => control.addEventListener("input", drawEditor));
  [outerBorderWidth, innerBorderWidth, borderGap].forEach(control => control.addEventListener("input", () => {
    updateBorderValues();
    drawEditor();
  }));
  resetButton.addEventListener("click", resetPosition);
  processButton.addEventListener("click", saveProfile);

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
    const rect = stage.getBoundingClientRect();
    const factor = EDITOR_SIZE / rect.width;
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
  });

  async function selectFile(candidate) {
    if (!candidate || !/^image\/(jpeg|png|webp)$/.test(candidate.type) || candidate.size > 25 * 1024 * 1024) {
      setStatus("JPG, PNG, WebP 이미지(25MB 이하) 한 장을 선택해 주세요.", "error");
      return;
    }
    setStatus("사진을 불러오고 있어요…", "");
    try {
      const decoded = await decodeImage(candidate);
      closeImage(image);
      file = candidate;
      image = decoded;
      renderFile();
      photoColor.value = detectBackgroundColor(image);
      photoColorValue.textContent = photoColor.value.toUpperCase();
      baseScale = Math.max(EDITOR_SIZE / image.width, EDITOR_SIZE / image.height);
      zoom.value = "100";
      zoomValue.textContent = "100%";
      scale = baseScale;
      centerPosition();
      editorWrap.classList.add("is-visible");
      processButton.disabled = false;
      resetButton.disabled = false;
      zoom.disabled = false;
      updateBackgroundControls();
      drawEditor();
      setStatus("사진을 움직여 원 안에 맞춰 주세요.", "");
    } catch (error) {
      console.error(error);
      setStatus("이 사진을 불러오지 못했어요. 다른 사진으로 다시 시도해 주세요.", "error");
    }
  }

  function renderFile() {
    const previous = fileList.querySelector("[data-object-url]");
    if (previous) URL.revokeObjectURL(previous.dataset.objectUrl);
    fileList.innerHTML = "";
    const row = document.createElement("div");
    row.className = "file-row";
    const url = URL.createObjectURL(file);
    row.dataset.objectUrl = url;
    row.innerHTML = `
      <img class="file-thumb" alt="">
      <div><div class="file-name"></div><div class="file-meta">${formatBytes(file.size)}</div></div>
      <button class="remove-file" type="button" aria-label="이 이미지 삭제">×</button>
    `;
    row.querySelector(".file-thumb").src = url;
    row.querySelector(".file-name").textContent = file.name;
    row.querySelector(".remove-file").addEventListener("click", clearFile);
    fileList.appendChild(row);
  }

  function clearFile() {
    const row = fileList.querySelector("[data-object-url]");
    if (row) URL.revokeObjectURL(row.dataset.objectUrl);
    fileList.innerHTML = "";
    closeImage(image);
    file = null;
    image = null;
    editorWrap.classList.remove("is-visible");
    processButton.disabled = true;
    resetButton.disabled = true;
    zoom.disabled = true;
    setStatus("", "");
  }

  function changeZoom() {
    if (!image) return;
    const oldScale = scale;
    const sourceCenterX = (EDITOR_SIZE / 2 - offsetX) / oldScale;
    const sourceCenterY = (EDITOR_SIZE / 2 - offsetY) / oldScale;
    scale = baseScale * Number(zoom.value) / 100;
    offsetX = EDITOR_SIZE / 2 - sourceCenterX * scale;
    offsetY = EDITOR_SIZE / 2 - sourceCenterY * scale;
    zoomValue.textContent = zoom.value + "%";
    clampPosition();
    drawEditor();
  }

  function resetPosition() {
    if (!image) return;
    zoom.value = "100";
    zoomValue.textContent = "100%";
    scale = baseScale;
    centerPosition();
    drawEditor();
  }

  function centerPosition() {
    offsetX = (EDITOR_SIZE - image.width * scale) / 2;
    offsetY = (EDITOR_SIZE - image.height * scale) / 2;
    clampPosition();
  }

  function clampPosition() {
    const width = image.width * scale;
    const height = image.height * scale;
    offsetX = clampAxis(offsetX, width);
    offsetY = clampAxis(offsetY, height);
  }

  function clampAxis(offset, length) {
    const minimumVisible = Math.min(length, EDITOR_SIZE * 0.12);
    return Math.min(
      EDITOR_SIZE - minimumVisible,
      Math.max(minimumVisible - length, offset)
    );
  }

  function drawEditor() {
    if (!image) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, EDITOR_SIZE, EDITOR_SIZE);
    fillOuterBackground(ctx, EDITOR_SIZE, EDITOR_SIZE);
    drawProfileImage(ctx, EDITOR_SIZE, 1, true);
    drawProfileBorders(ctx, EDITOR_SIZE, true);
  }

  async function saveProfile() {
    if (!image || !file) return;
    processButton.disabled = true;
    setStatus("원형 프로필을 만들고 있어요…", "");
    try {
      const size = Number(outputSize.value);
      const result = document.createElement("canvas");
      result.width = size;
      result.height = size;
      const ctx = result.getContext("2d");
      fillOuterBackground(ctx, size, size);
      const factor = size / EDITOR_SIZE;
      drawProfileImage(ctx, size, factor, false);
      drawProfileBorders(ctx, size, false);
      const blob = await canvasToBlob(result);
      downloadBlob(blob, outputName(file.name));
      setStatus(`${size} × ${size} 원형 프로필 저장 준비 완료`, "success");
    } catch (error) {
      console.error(error);
      setStatus("프로필 사진을 저장하지 못했어요. 다른 사진으로 다시 시도해 주세요.", "error");
    } finally {
      processButton.disabled = false;
    }
  }

  async function decodeImage(candidate) {
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(candidate, { imageOrientation: "from-image" });
      } catch (error) {
        console.warn("createImageBitmap fallback", error);
      }
    }
    const url = URL.createObjectURL(candidate);
    try {
      const fallback = new Image();
      fallback.decoding = "async";
      fallback.src = url;
      await fallback.decode();
      return fallback;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function updateBackgroundControls() {
    const usePhotoColor = outside.value === "photo";
    photoColorRow.classList.toggle("hidden", !usePhotoColor);
    backgroundHint.textContent = usePhotoColor
      ? "사진 가장자리 색으로 원 안의 빈 공간을 채워요. 원 밖은 투명하게 저장돼요."
      : outside.value === "white"
        ? "사진을 줄이거나 움직여 생긴 빈 공간을 흰색으로 채워요."
        : "사진을 줄이거나 움직여 생긴 빈 공간을 투명하게 비워 둬요.";
  }

  function fillOuterBackground(ctx, width, height) {
    if (outside.value !== "white") return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }

  function fillPhotoBackground(ctx, width, height) {
    if (outside.value !== "photo") return;
    ctx.fillStyle = photoColor.value;
    ctx.fillRect(0, 0, width, height);
  }

  function drawProfileImage(ctx, size, factor, showGuide) {
    const fullRadius = size / 2 - (showGuide ? 3 : 0);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, fullRadius, 0, Math.PI * 2);
    ctx.clip();
    fillPhotoBackground(ctx, size, size);

    const imageRadius = getImageRadius(size, showGuide);
    if (imageRadius < fullRadius) {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, imageRadius, 0, Math.PI * 2);
      ctx.clip();
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      image,
      offsetX * factor,
      offsetY * factor,
      image.width * scale * factor,
      image.height * scale * factor
    );
    ctx.restore();
  }

  function getImageRadius(size, showGuide) {
    const fullRadius = size / 2 - (showGuide ? 3 : 0);
    const count = Number(borderCount.value);
    if (borderMode.value !== "frame" || count === 0) return fullRadius;

    const factor = size / EDITOR_SIZE;
    let inset = Number(outerBorderWidth.value) * factor;
    if (count === 2) {
      inset += (Number(borderGap.value) + Number(innerBorderWidth.value)) * factor;
    }
    return Math.max(1, size / 2 - inset);
  }

  function updateBorderControls() {
    const count = Number(borderCount.value);
    borderControls.classList.toggle("hidden", count === 0);
    innerBorderControl.classList.toggle("hidden", count !== 2);
    borderGapControl.classList.toggle("hidden", count !== 2);
  }

  function updateBorderValues() {
    outerBorderWidthValue.textContent = `${outerBorderWidth.value}px`;
    innerBorderWidthValue.textContent = `${innerBorderWidth.value}px`;
    borderGapValue.textContent = `${borderGap.value}px`;
  }

  function drawProfileBorders(ctx, size, showGuide) {
    const count = Number(borderCount.value);
    if (count === 0) {
      if (!showGuide) return;
      strokeCircle(ctx, size / 2 - 4, 5, "rgba(255,255,255,.94)");
      return;
    }

    const factor = size / EDITOR_SIZE;
    const outerWidth = Number(outerBorderWidth.value) * factor;
    const outerRadius = size / 2 - outerWidth / 2;
    strokeCircle(ctx, outerRadius, outerWidth, outerBorderColor.value);

    if (count === 2) {
      const gap = Number(borderGap.value) * factor;
      const innerWidth = Number(innerBorderWidth.value) * factor;
      const innerRadius = size / 2 - outerWidth - gap - innerWidth / 2;
      strokeCircle(ctx, innerRadius, innerWidth, innerBorderColor.value);
    }
  }

  function strokeCircle(ctx, radius, width, color) {
    if (radius <= 0 || width <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ctx.canvas.width / 2, ctx.canvas.height / 2, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.restore();
  }

  function detectBackgroundColor(source) {
    const size = 72;
    const edge = 8;
    const sample = document.createElement("canvas");
    sample.width = size;
    sample.height = size;
    const ctx = sample.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, size, size);
    const pixels = ctx.getImageData(0, 0, size, size).data;
    const buckets = new Map();

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (x >= edge && x < size - edge && y >= edge && y < size - edge) continue;
        const index = (y * size + x) * 4;
        const alpha = pixels[index + 3];
        if (alpha < 96) continue;
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const key = `${Math.round(red / 32)},${Math.round(green / 32)},${Math.round(blue / 32)}`;
        const bucket = buckets.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
        bucket.count += 1;
        bucket.red += red;
        bucket.green += green;
        bucket.blue += blue;
        buckets.set(key, bucket);
      }
    }

    let dominant = null;
    for (const bucket of buckets.values()) {
      if (!dominant || bucket.count > dominant.count) dominant = bucket;
    }
    if (!dominant) return "#ffffff";
    return toHex(
      Math.round(dominant.red / dominant.count),
      Math.round(dominant.green / dominant.count),
      Math.round(dominant.blue / dominant.count)
    );
  }

  function toHex(red, green, blue) {
    return `#${[red, green, blue].map(value => value.toString(16).padStart(2, "0")).join("")}`;
  }

  function closeImage(value) {
    if (value && typeof value.close === "function") value.close();
  }

  function canvasToBlob(value) {
    return new Promise((resolve, reject) => value.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG save failed")), "image/png"));
  }

  function outputName(name) {
    const base = name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "profile";
    return `${base}-circle.png`;
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
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

  updateBackgroundControls();
  updateBorderControls();
  updateBorderValues();
})();
