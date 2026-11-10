(() => {
  "use strict";

  const EDITOR_LONG = 1080;
  const MAX_ANGLE = 45;
  // 가운데에 너무 가까우면 손이 조금만 움직여도 각도가 크게 튀므로, 이 반지름 안에서는 돌리지 않는다.
  const DEAD_ZONE_PX = 24;
  const input = document.querySelector("#fileInput");
  const dropzone = document.querySelector("#dropzone");
  const chooseButton = document.querySelector("#chooseButton");
  const fileList = document.querySelector("#fileList");
  const editorWrap = document.querySelector("#straightenEditorWrap");
  const stage = document.querySelector("#straightenStage");
  const canvas = document.querySelector("#straightenCanvas");
  const angleInput = document.querySelector("#angle");
  const angleValue = document.querySelector("#angleValue");
  const stepButtons = document.querySelectorAll("[data-step]");
  const resetButton = document.querySelector("#resetButton");
  const rotateLeftButton = document.querySelector("#rotateLeftButton");
  const rotateRightButton = document.querySelector("#rotateRightButton");
  const edgeSelect = document.querySelector("#edge");
  const format = document.querySelector("#format");
  const sizeNote = document.querySelector("#sizeNote");
  const processButton = document.querySelector("#processButton");
  const status = document.querySelector("#status");
  const controls = [angleInput, resetButton, rotateLeftButton, rotateRightButton, ...stepButtons];
  let file = null;
  let image = null;
  let objectUrl = null;
  let angle = 0;
  let quarterTurns = 0;
  let dragging = false;
  let pointerAngle = null;

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

  angleInput.addEventListener("input", () => setAngle(Number(angleInput.value)));
  stepButtons.forEach(button => button.addEventListener("click", () => setAngle(angle + Number(button.dataset.step))));
  resetButton.addEventListener("click", () => setAngle(0));
  rotateLeftButton.addEventListener("click", () => turn(-1));
  rotateRightButton.addEventListener("click", () => turn(1));
  edgeSelect.addEventListener("change", () => {
    // 투명하게 채우려면 투명을 담을 수 있는 형식이어야 한다.
    if (edgeSelect.value === "transparent" && format.value === "jpg") format.value = "png";
    drawEditor();
    updateSizeNote();
  });
  format.addEventListener("change", () => {
    if (format.value === "jpg" && edgeSelect.value === "transparent") edgeSelect.value = "white";
    drawEditor();
    updateSizeNote();
  });
  processButton.addEventListener("click", saveResult);

  // 사진을 잡고 가운데를 중심으로 원을 그리듯 돌리면, 손이 돈 만큼 사진도 같은 방향으로 돈다.
  stage.addEventListener("pointerdown", event => {
    if (!image) return;
    dragging = true;
    pointerAngle = angleAroundCenter(event);
    stage.setPointerCapture(event.pointerId);
    stage.classList.add("is-dragging");
  });
  stage.addEventListener("pointermove", event => {
    if (!dragging || !image) return;
    const current = angleAroundCenter(event);
    if (current === null) return;
    if (pointerAngle !== null) {
      let delta = current - pointerAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      setAngle(angle + delta);
    }
    pointerAngle = current;
  });
  stage.addEventListener("wheel", event => {
    if (!image) return;
    event.preventDefault();
    const step = event.shiftKey ? 1 : 0.1;
    setAngle(angle + (event.deltaY > 0 ? step : -step));
  }, { passive: false });
  ["pointerup", "pointercancel"].forEach(type => stage.addEventListener(type, event => {
    dragging = false;
    stage.classList.remove("is-dragging");
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  }));
  stage.addEventListener("keydown", event => {
    if (!image || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 1 : 0.1;
    setAngle(angle + (event.key === "ArrowLeft" ? -step : step));
  });

  function angleAroundCenter(event) {
    const rect = stage.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    if (Math.hypot(dx, dy) < DEAD_ZONE_PX) return null;
    return Math.atan2(dy, dx) * 180 / Math.PI;
  }

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
      quarterTurns = 0;
      editorWrap.classList.add("is-visible");
      // 사진을 올린 뒤에는 큰 업로드 칸을 접어 미리보기가 작업 칸을 꽉 채우게 한다. ×로 지우면 다시 나타난다.
      dropzone.hidden = true;
      controls.forEach(control => { control.disabled = false; });
      processButton.disabled = false;
      setAngle(0);
      const rect = stage.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > window.innerHeight) stage.scrollIntoView({ behavior: "smooth", block: "center" });
      setStatus("격자선에 수평선이나 상품 모서리를 맞춰 조금씩 돌려 주세요.", "");
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
    dropzone.hidden = false;
    controls.forEach(control => { control.disabled = true; });
    processButton.disabled = true;
    sizeNote.textContent = "";
    setStatus("", "");
  }

  function setAngle(value) {
    if (!image) return;
    angle = Math.round(Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, value)) * 10) / 10;
    angleInput.value = String(angle);
    angleValue.textContent = (angle > 0 ? "+" : "") + angle.toFixed(1) + "°";
    drawEditor();
    updateSizeNote();
  }

  function turn(direction) {
    if (!image) return;
    quarterTurns = (quarterTurns + direction + 4) % 4;
    drawEditor();
    updateSizeNote();
  }

  // 90° 회전까지 반영한 사진의 가로·세로.
  function turnedSize() {
    return quarterTurns % 2 ? { width: image.height, height: image.width } : { width: image.width, height: image.height };
  }

  // 돌린 사진 안에 빈 모서리 없이 들어가는, 원래 비율과 같은 가장 큰 사각형의 배율(1 이하).
  function cropFactor(width, height) {
    const radians = Math.abs(angle) * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return Math.min(width / (width * cos + height * sin), height / (width * sin + height * cos));
  }

  function outputDimensions() {
    const size = turnedSize();
    if (edgeSelect.value !== "crop") return size;
    const factor = cropFactor(size.width, size.height);
    return { width: Math.max(1, Math.floor(size.width * factor)), height: Math.max(1, Math.floor(size.height * factor)) };
  }

  // frameWidth×frameHeight 크기의 틀 가운데에, 사진을 drawScale 배율로 돌려 그린다.
  function paintRotated(ctx, frameWidth, frameHeight, drawScale) {
    ctx.save();
    ctx.translate(frameWidth / 2, frameHeight / 2);
    ctx.rotate((quarterTurns * 90 + angle) * Math.PI / 180);
    ctx.scale(drawScale, drawScale);
    ctx.drawImage(image, -image.width / 2, -image.height / 2);
    ctx.restore();
  }

  function fillsWhite() {
    return edgeSelect.value === "white" || format.value === "jpg";
  }

  function drawEditor() {
    if (!image) return;
    const size = turnedSize();
    const ratio = size.width / size.height;
    const editorWidth = ratio >= 1 ? EDITOR_LONG : Math.round(EDITOR_LONG * ratio);
    const editorHeight = ratio >= 1 ? Math.round(EDITOR_LONG / ratio) : EDITOR_LONG;
    canvas.width = editorWidth;
    canvas.height = editorHeight;
    stage.style.aspectRatio = `${editorWidth} / ${editorHeight}`;
    // 작업 칸 너비를 꽉 채우되, 세로로 긴 사진은 화면 높이를 넘지 않게 한다.
    stage.style.width = `min(100%, calc(75vh * ${ratio.toFixed(4)}))`;
    const fit = editorWidth / size.width;
    // 잘라내기를 고르면 저장될 부분이 틀을 꽉 채우도록 확대해서 보여 준다.
    const drawScale = edgeSelect.value === "crop" ? fit / cropFactor(size.width, size.height) : fit;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, editorWidth, editorHeight);
    if (fillsWhite()) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, editorWidth, editorHeight);
    }
    paintRotated(ctx, editorWidth, editorHeight, drawScale);
    drawGrid(ctx, editorWidth, editorHeight);
  }

  // 수평·수직을 맞추기 쉽도록 촘촘한 격자를 깔고, 3등분 선은 조금 더 진하게 그린다.
  function drawGrid(ctx, width, height) {
    const cell = Math.max(width, height) / 12;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255, 255, 255, .45)";
    ctx.beginPath();
    for (let x = cell; x < width; x += cell) {
      ctx.moveTo(Math.round(x) + .5, 0);
      ctx.lineTo(Math.round(x) + .5, height);
    }
    for (let y = cell; y < height; y += cell) {
      ctx.moveTo(0, Math.round(y) + .5);
      ctx.lineTo(width, Math.round(y) + .5);
    }
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(0, 0, 0, .35)";
    ctx.beginPath();
    for (let i = 1; i < 3; i += 1) {
      ctx.moveTo(width * i / 3, 0);
      ctx.lineTo(width * i / 3, height);
      ctx.moveTo(0, height * i / 3);
      ctx.lineTo(width, height * i / 3);
    }
    ctx.stroke();
    ctx.restore();
  }

  function updateSizeNote() {
    if (!image) return;
    const size = outputDimensions();
    const cropped = edgeSelect.value === "crop" && angle !== 0;
    sizeNote.textContent = `저장 크기: ${size.width} × ${size.height}` + (cropped ? " · 돌리면서 생긴 빈 모서리만큼 가장자리가 잘려요" : "");
  }

  if (window.PixelHandoff) window.PixelHandoff.mount(status, async () => image && file ? (await makeResult()).output : null);

  async function makeResult() {
    const size = outputDimensions();
    const mime = format.value === "png" ? "image/png" : format.value === "webp" ? "image/webp" : "image/jpeg";
    const result = document.createElement("canvas");
    result.width = size.width;
    result.height = size.height;
    const ctx = result.getContext("2d", { alpha: mime !== "image/jpeg" });
    if (fillsWhite()) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size.width, size.height);
    }
    ctx.imageSmoothingQuality = "high";
    // 원래 픽셀 크기 그대로(배율 1) 돌리므로 화질이 줄지 않는다.
    paintRotated(ctx, size.width, size.height, 1);
    const blob = await new Promise((resolve, reject) => result.toBlob(value => value ? resolve(value) : reject(new Error("save failed")), mime, .92));
    return { size, output: { blob, name: outputName(file.name, mime) } };
  }

  async function saveResult() {
    if (!image || !file) return;
    processButton.disabled = true;
    setStatus("기울기를 맞춘 사진을 저장하고 있어요…", "");
    try {
      const { size, output } = await makeResult();
      downloadBlob(output.blob, output.name);
      setStatus(`${size.width} × ${size.height} 사진 저장 준비 완료 · ${formatBytes(output.blob.size)}`, "success");
    } catch (error) {
      console.error(error);
      setStatus("저장하지 못했어요. 다른 형식으로 다시 시도해 주세요.", "error");
    } finally {
      processButton.disabled = false;
    }
  }

  function outputName(name, mime) {
    const base = name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "image";
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    return `${base}-straight.${ext}`;
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
