(() => {
  "use strict";

  const input = document.querySelector("#fileInput");
  const dropzone = document.querySelector("#dropzone");
  const chooseButton = document.querySelector("#chooseButton");
  const fileList = document.querySelector("#fileList");
  const processButton = document.querySelector("#processButton");
  const status = document.querySelector("#status");
  const backgroundMode = document.querySelector("#backgroundMode");
  const backgroundColor = document.querySelector("#backgroundColor");
  const tolerance = document.querySelector("#tolerance");
  const toleranceValue = document.querySelector("#toleranceValue");
  const previewWrap = document.querySelector("#previewWrap");
  const previewStage = document.querySelector("#previewStage");
  const previewCanvas = document.querySelector("#previewCanvas");
  const selectedColorNote = document.querySelector("#selectedColorNote");
  const removeMethod = document.querySelector("#removeMethod");
  const methodHint = document.querySelector("#methodHint");
  const colorGroup = document.querySelector("#colorGroup");
  const toleranceGroup = document.querySelector("#toleranceGroup");
  const previewTitle = document.querySelector("#previewTitle");
  const wandGroup = document.querySelector("#wandGroup");
  const wandTol = document.querySelector("#wandTol");
  const wandTolValue = document.querySelector("#wandTolValue");
  const wandUndo = document.querySelector("#wandUndo");
  const touchTool = document.querySelector("#touchTool");
  const touchHint = document.querySelector("#touchHint");
  const brushRow = document.querySelector("#brushRow");
  const brushSize = document.querySelector("#brushSize");
  const brushSizeValue = document.querySelector("#brushSizeValue");
  const wandRow = document.querySelector("#wandRow");
  const zoom = document.querySelector("#zoom");
  const zoomIn = document.querySelector("#zoomIn");
  const zoomOut = document.querySelector("#zoomOut");
  const zoomValue = document.querySelector("#zoomValue");
  const panButton = document.querySelector("#panButton");
  const PREVIEW_LONG = 1600;
  let panning = false;
  let pan = null;
  let stroke = null;
  let lastResult = null;
  let baseCache = null;   // 미리보기 크기의 AI 기본 알파(손보기 전)를 다시 계산하지 않게 보관
  const bgFill = document.querySelector("#bgFill");
  const bgColorRow = document.querySelector("#bgColorRow");
  const bgColor = document.querySelector("#bgColor");
  const bgHex = document.querySelector("#bgHex");
  const edits = new Map();   // 사진 → 눌러서 지운 곳 [{x, y, tol}] (0~1 비율 좌표)
  let previewFile = null;
  let previewAlpha = null;
  const AI_MODULE_URL = "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm";
  let removeBackgroundPromise = null;
  const aiCache = new Map();
  let previewSequence = 0;
  let files = [];
  let previewSource = null;
  let previewTimer = 0;

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
  input.addEventListener("change", () => addFiles([...input.files]));

  ["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => {
    event.preventDefault();
    dropzone.classList.add("is-over");
  }));
  ["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => {
    event.preventDefault();
    dropzone.classList.remove("is-over");
  }));
  dropzone.addEventListener("drop", event => addFiles([...event.dataTransfer.files]));

  removeMethod.addEventListener("change", () => {
    const color = removeMethod.value === "color";
    colorGroup.classList.toggle("hidden", !color);
    toleranceGroup.classList.toggle("hidden", !color);
    wandGroup.classList.toggle("hidden", color);
    methodHint.textContent = color
      ? "흰 벽·촬영지처럼 한 가지 색으로 고르게 찍은 배경에 써요. 상품과 배경 색이 비슷하면 상품까지 지워질 수 있어요."
      : "AI가 옷·사람·물건을 찾아 나머지를 지워요. 벽지나 방 안처럼 배경이 복잡해도 돼요. 처음에는 AI 파일을 받느라 시간이 걸려요.";
    updatePreview();
  });

  backgroundMode.addEventListener("change", () => {
    backgroundColor.disabled = backgroundMode.value !== "manual";
    selectedColorNote.textContent = backgroundMode.value === "manual"
      ? `선택한 배경색 ${backgroundColor.value.toUpperCase()}을 지워요.`
      : "사진마다 가장자리의 배경색을 자동으로 찾아요.";
    schedulePreview();
  });
  backgroundColor.addEventListener("input", () => {
    selectedColorNote.textContent = `선택한 배경색 ${backgroundColor.value.toUpperCase()}을 지워요.`;
    schedulePreview();
  });
  tolerance.addEventListener("input", () => {
    toleranceValue.textContent = tolerance.value;
    schedulePreview();
  });
  wandTol.addEventListener("input", () => { wandTolValue.textContent = wandTol.value; });
  brushSize.addEventListener("input", () => { brushSizeValue.textContent = brushSize.value; });
  touchTool.addEventListener("change", () => {
    const wand = touchTool.value === "wand";
    brushRow.classList.toggle("hidden", wand);
    wandRow.classList.toggle("hidden", !wand);
    touchHint.textContent = wand
      ? "남은 배경을 한 번 누르면 비슷한 색으로 이어진 부분이 투명해져요. 덜 지워지면 범위를 높이고, 옷까지 지워지면 낮추세요."
      : touchTool.value === "keep"
        ? "옷이 투명하게 빠진 곳을 넉넉하게 문지르면, 주변 옷과 색이 비슷한 곳만 되살아나요. 벽은 그대로 투명하게 남아요."
        : touchTool.value === "restore"
        ? "잘못 지워진 옷 부분을 칠하면 원래대로 돌아와요."
        : touchTool.value === "smooth"
        ? "자글거리는 가장자리를 따라 문지르면 삐져나온 부분만 깎여 선이 부드러워져요. 빈 곳을 채우지는 않아요."
        : "미리보기에서 남은 배경 위를 마우스나 손가락으로 칠하면 투명해져요. 작은 곳은 ＋로 확대해서 칠하세요.";
  });
  zoom.addEventListener("input", () => setZoom(Number(zoom.value)));
  zoomIn.addEventListener("click", () => setZoom(Number(zoom.value) + 50));
  zoomOut.addEventListener("click", () => setZoom(Number(zoom.value) - 50));
  panButton.addEventListener("click", () => {
    panning = !panning;
    panButton.setAttribute("aria-pressed", String(panning));
    previewStage.classList.toggle("is-panning", panning);
  });
  previewStage.addEventListener("wheel", event => {
    if (!previewSource || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    setZoom(Number(zoom.value) + (event.deltaY < 0 ? 25 : -25), event);
  }, { passive: false });
  window.addEventListener("resize", () => { if (previewSource) setZoom(Number(zoom.value)); });

  previewCanvas.addEventListener("pointerdown", event => {
    if (!previewSource) return;
    if (panning) {
      event.preventDefault();
      previewCanvas.setPointerCapture(event.pointerId);
      pan = { x: event.clientX, y: event.clientY, left: previewStage.scrollLeft, top: previewStage.scrollTop };
      return;
    }
    if (removeMethod.value !== "ai" || !previewAlpha) return;
    event.preventDefault();
    previewCanvas.setPointerCapture(event.pointerId);
    stroke = { type: touchTool.value, points: [toPreviewPoint(event)], startX: event.clientX, startY: event.clientY, moved: false };
    if (stroke.type !== "wand") drawStrokeOverlay();
  });
  previewCanvas.addEventListener("pointermove", event => {
    if (pan) {
      previewStage.scrollLeft = pan.left - (event.clientX - pan.x);
      previewStage.scrollTop = pan.top - (event.clientY - pan.y);
      return;
    }
    if (!stroke || stroke.type === "wand") return;
    stroke.points.push(toPreviewPoint(event));
    drawStrokeOverlay();
  });
  ["pointerup", "pointercancel"].forEach(type => previewCanvas.addEventListener(type, event => {
    if (previewCanvas.hasPointerCapture(event.pointerId)) previewCanvas.releasePointerCapture(event.pointerId);
    if (pan) {
      pan = null;
      return;
    }
    if (!stroke) return;
    const current = stroke;
    stroke = null;
    if (type === "pointercancel") {
      drawLast();
      return;
    }
    if (current.type === "wand") {
      eraseFromPreview(event);
      return;
    }
    const file = currentPreviewFile();
    if (!edits.has(file)) edits.set(file, []);
    edits.get(file).push({ type: current.type, points: current.points, r: brushRadius() / Math.max(previewSource.width, previewSource.height) });
    updatePreview();
  }));
  wandUndo.addEventListener("click", () => {
    const list = edits.get(currentPreviewFile());
    if (list && list.length) list.pop();
    updatePreview();
  });
  bgFill.addEventListener("change", () => {
    bgColorRow.classList.toggle("hidden", bgFill.value !== "color");
    updatePreview();
  });
  bgColor.addEventListener("input", () => {
    bgHex.value = bgColor.value.toUpperCase();
    bgHex.classList.remove("is-invalid");
    updatePreview();
  });
  bgHex.addEventListener("input", () => {
    const value = normalizeHex(bgHex.value);
    bgHex.classList.toggle("is-invalid", !value);
    if (!value) return;
    bgColor.value = value.toLowerCase();
    updatePreview();
  });
  previewStage.addEventListener("click", event => {
    if (removeMethod.value !== "ai" && !panning) chooseColorFromPreview(event);
  });
  previewStage.addEventListener("keydown", event => {
    if ((event.key === "Enter" || event.key === " ") && previewSource) {
      event.preventDefault();
      selectedColorNote.textContent = "미리보기에서 제거할 배경 부분을 눌러 주세요.";
    }
  });
  processButton.addEventListener("click", processFiles);

  function addFiles(incoming) {
    const valid = incoming.filter(file => /^image\/(jpeg|png|webp)$/.test(file.type) && file.size <= 25 * 1024 * 1024);
    if (!valid.length) {
      setStatus("JPG, PNG, WebP 이미지(장당 25MB 이하)를 선택해 주세요.", "error");
      return;
    }
    const combined = [...files, ...valid];
    const unique = new Map(combined.map(file => [file.name + file.size + file.lastModified, file]));
    files = [...unique.values()].slice(0, 20);
    renderFiles();
    loadPreview();
    const limitNotice = combined.length > 20 ? " · 한 번에 최대 20장까지 가능해요" : "";
    setStatus(files.length + "장 선택됨" + limitNotice, "");
  }

  function renderFiles() {
    clearObjectUrls();
    fileList.innerHTML = "";
    files.forEach((file, index) => {
      const row = document.createElement("div");
      row.className = "file-row";
      row.innerHTML = `
        <img class="file-thumb" alt="">
        <div>
          <div class="file-name"></div>
          <div class="file-meta">${formatBytes(file.size)}</div>
        </div>
        <button class="remove-file" type="button" aria-label="이 이미지 삭제">×</button>
      `;
      const url = URL.createObjectURL(file);
      row.dataset.objectUrl = url;
      row.querySelector(".file-thumb").src = url;
      row.querySelector(".file-name").textContent = file.name;
      if (file === currentPreviewFile()) row.classList.add("is-selected");
      row.addEventListener("click", event => {
        if (event.target.closest(".remove-file") || file === currentPreviewFile()) return;
        previewFile = file;
        renderFiles();
        loadPreview();
      });
      row.querySelector(".remove-file").addEventListener("click", () => {
        edits.delete(file);
        if (file === previewFile) previewFile = null;
        files.splice(index, 1);
        renderFiles();
        loadPreview();
        setStatus(files.length ? files.length + "장 선택됨" : "", "");
      });
      fileList.appendChild(row);
    });
    fileList.classList.toggle("is-selectable", files.length > 1);
    processButton.disabled = files.length === 0;
  }

  function clearObjectUrls() {
    fileList.querySelectorAll("[data-object-url]").forEach(node => URL.revokeObjectURL(node.dataset.objectUrl));
  }

  async function loadPreview() {
    previewSource = null;
    previewAlpha = null;
    lastResult = null;
    const file = currentPreviewFile();
    if (!file) {
      previewWrap.classList.remove("is-visible");
      previewCanvas.width = 0;
      previewCanvas.height = 0;
      return;
    }
    try {
      setStatus("미리보기를 만들고 있어요…", "");
      const image = await decodeImage(file);
      const scale = Math.min(1, PREVIEW_LONG / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = width;
      sourceCanvas.height = height;
      const ctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, 0, 0, width, height);
      closeImage(image);
      previewSource = ctx.getImageData(0, 0, width, height);
      previewCanvas.width = width;
      previewCanvas.height = height;
      previewWrap.classList.add("is-visible");
      previewTitle.textContent = files.length > 1 ? `${file.name} 미리보기` : "미리보기";
      setZoom(100);
      updatePreview();
      setStatus(files.length + "장 선택됨", "");
    } catch (error) {
      console.error(error);
      previewWrap.classList.remove("is-visible");
      setStatus("이 사진의 미리보기를 만들지 못했어요. 다른 사진으로 시도해 주세요.", "error");
    }
  }

  function schedulePreview() {
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(updatePreview, 80);
  }

  function updatePreview() {
    if (!previewSource) return;
    if (removeMethod.value === "ai") {
      updateAiPreview();
      return;
    }
    const copy = new ImageData(new Uint8ClampedArray(previewSource.data), previewSource.width, previewSource.height);
    const target = backgroundMode.value === "manual"
      ? hexToRgb(backgroundColor.value)
      : detectBorderColor(copy);
    removeConnectedBackground(copy, target, Number(tolerance.value));
    paintResult(previewCanvas, copy);
    if (backgroundMode.value === "auto") {
      const hex = rgbToHex(target);
      selectedColorNote.textContent = `자동으로 찾은 배경색 ${hex} · 사진을 누르면 직접 바꿀 수 있어요.`;
    }
  }

  // AI 결과는 사진마다 한 번만 계산해 두고 미리보기와 저장에 같이 쓴다.
  function aiCutout(file) {
    if (!aiCache.has(file)) {
      const job = (async () => {
        if (!removeBackgroundPromise) removeBackgroundPromise = import(AI_MODULE_URL).then(module => module.removeBackground || module.default);
        const removeBackground = await removeBackgroundPromise;
        if (typeof removeBackground !== "function") throw new Error("AI module unavailable");
        // 휴대폰 사진의 회전 정보를 먼저 반영해서 넘긴다.
        const image = await decodeImage(file);
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext("2d").drawImage(image, 0, 0);
        closeImage(image);
        const source = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("encode failed")), "image/png"));
        return removeBackground(source, {
          model: "isnet_fp16",
          proxyToWorker: false,
          output: { format: "image/png", quality: 1 },
          progress: (key, current, total) => {
            if (String(key).startsWith("compute")) return;
            const percent = total > 0 ? Math.min(100, Math.round(current / total * 100)) : 0;
            setStatus(`AI 파일을 받고 있어요${percent ? ` ${percent}%` : ""}… 처음 한 번만 받아요.`, "");
          }
        });
      })();
      job.catch(() => aiCache.delete(file));
      aiCache.set(file, job);
    }
    return aiCache.get(file);
  }

  async function updateAiPreview() {
    const sequence = ++previewSequence;
    const file = currentPreviewFile();
    if (!file) return;
    const source = previewSource;
    if (!previewAlpha) {
      previewCanvas.getContext("2d").putImageData(source, 0, 0);
      selectedColorNote.textContent = "AI가 물건을 찾고 있어요…";
    }
    try {
      const result = await aiResult(file, source);
      if (sequence !== previewSequence || removeMethod.value !== "ai" || source !== previewSource) return;
      previewAlpha = result.alpha;
      lastResult = result.image;
      paintResult(previewCanvas, result.image);
      const count = (edits.get(file) || []).length;
      wandUndo.disabled = count === 0;
      selectedColorNote.textContent = count
        ? `${count}번 손봤어요. 남은 곳이 있으면 더 칠하거나, ‘한 단계 되돌리기’로 취소하세요.`
        : "AI 결과예요. 남은 배경은 붓으로 칠해서 지울 수 있어요.";
      setStatus(files.length + "장 선택됨", "");
    } catch (error) {
      console.error(error);
      if (sequence !== previewSequence) return;
      selectedColorNote.textContent = "AI를 불러오지 못했어요. 인터넷 연결을 확인하거나 ‘같은 색 배경 지우기’를 써 보세요.";
    }
  }

  function currentPreviewFile() {
    return files.includes(previewFile) ? previewFile : files[0] || null;
  }

  function normalizeHex(value) {
    const text = String(value).trim().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(text)) return "#" + text.split("").map(c => c + c).join("").toUpperCase();
    if (/^[0-9a-f]{6}$/i.test(text)) return "#" + text.toUpperCase();
    return null;
  }

  function fillColor() {
    return bgFill.value === "color" ? (normalizeHex(bgHex.value) || bgColor.value) : null;
  }

  // 결과를 화면이나 저장용 캔버스에 그린다. 색 배경이면 그 색을 먼저 깔아 둔다.
  function paintResult(target, imageData) {
    target.width = imageData.width;
    target.height = imageData.height;
    const ctx = target.getContext("2d");
    const fill = fillColor();
    if (!fill) {
      ctx.putImageData(imageData, 0, 0);
      return;
    }
    const layer = document.createElement("canvas");
    layer.width = imageData.width;
    layer.height = imageData.height;
    layer.getContext("2d").putImageData(imageData, 0, 0);
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.drawImage(layer, 0, 0);
  }

  // AI 결과 알파를 source 크기로 받아, 옷 안쪽이 반투명하게 빠진 곳을 채우고 눌러서 지운 곳을 반영한다.
  async function aiResult(file, source) {
    // 미리보기에서는 손볼 때마다 AI 알파를 다시 계산하지 않고, 보관해 둔 기본 알파에 손본 내용만 다시 적용한다.
    if (baseCache && baseCache.file === file && baseCache.source === source) {
      const alpha = new Uint8Array(baseCache.alpha);
      applyEdits(file, source.data, alpha, source.width, source.height);
      return composeResult(source, alpha);
    }
    const result = await computeAiResult(file, source);
    return result;
  }

  function composeResult(source, alpha) {
    const image = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
    for (let index = 0; index < alpha.length; index += 1) image.data[index * 4 + 3] = alpha[index];
    cleanEdgeColors(source.data, image.data, alpha, source.width, source.height);
    return { image, alpha };
  }

  // 반투명한 가장자리 픽셀에는 벽 색이 섞여 있어, 다른 배경에 올리면 테두리가 비친다.
  // 주변의 확실한 배경색을 빼서 옷 색만 남긴다(옅은 픽셀은 주변 옷 색으로 채운다).
  function cleanEdgeColors(data, out, alpha, width, height) {
    const radius = Math.max(3, Math.round(Math.max(width, height) / 1024 * 3));
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const value = alpha[index];
        if (value === 0 || value >= 250) continue;
        let fn = 0, fr = 0, fg = 0, fb = 0, bn = 0, br = 0, bg = 0, bb = 0;
        const x0 = Math.max(0, x - radius), x1 = Math.min(width - 1, x + radius);
        const y0 = Math.max(0, y - radius), y1 = Math.min(height - 1, y + radius);
        for (let yy = y0; yy <= y1; yy += 1) {
          for (let xx = x0; xx <= x1; xx += 1) {
            const near = yy * width + xx;
            const a = alpha[near];
            if (a >= 250) { fn += 1; fr += data[near * 4]; fg += data[near * 4 + 1]; fb += data[near * 4 + 2]; }
            else if (a <= 5) { bn += 1; br += data[near * 4]; bg += data[near * 4 + 1]; bb += data[near * 4 + 2]; }
          }
        }
        if (!fn) continue;
        const a = value / 255;
        let r = fr / fn, g = fg / fn, b = fb / fn;
        if (bn) {
          // 섞인 색 = 옷 색 × a + 배경색 × (1 - a) 이므로 옷 색을 거꾸로 구한다. 옅을수록 오차가 커서 주변 옷 색 쪽으로 섞는다.
          const weight = Math.min(1, Math.max(0, (a - .2) / .4));
          const solve = (channel, back, fore) => {
            const own = Math.max(0, Math.min(255, (data[index * 4 + channel] - (1 - a) * back) / a));
            return own * weight + fore * (1 - weight);
          };
          r = solve(0, br / bn, r); g = solve(1, bg / bn, g); b = solve(2, bb / bn, b);
        }
        out[index * 4] = Math.round(r);
        out[index * 4 + 1] = Math.round(g);
        out[index * 4 + 2] = Math.round(b);
      }
    }
  }

  function applyEdits(file, data, alpha, width, height) {
    (edits.get(file) || []).forEach(item => {
      if (item.type === "erase" || item.type === "restore") paintStroke(alpha, width, height, item);
      else if (item.type === "smooth") smoothStroke(alpha, width, height, item);
      else if (item.type === "keep") keepStroke(data, alpha, width, height, item);
      else clearSimilar(data, alpha, width, height, item);
    });
  }

  // 문지른 자리 안에서만 가장자리를 다듬는다. 투명도를 흐리게 섞어 매끈한 기준선을 만든 뒤
  // 그 선 바깥으로 삐져나온 계단만 깎아 내므로, 큰 윤곽(어깨선)은 그대로 남고 배경이 새로 채워지지 않는다.
  function smoothStroke(alpha, width, height, item) {
    const { mask, box } = strokeMask(width, height, item);
    if (!box) return;
    // 흐림 폭은 붓 크기가 아니라 사진 크기 기준(긴 변의 0.4%, 최소 3픽셀)이다.
    // 몇 픽셀짜리 계단만 펴고, 곧은 가장자리는 거의 깎지 않는다.
    const blur = Math.max(3, Math.round(Math.max(width, height) * .004));
    const x0 = Math.max(0, box.x0 - blur), y0 = Math.max(0, box.y0 - blur);
    const x1 = Math.min(width, box.x1 + blur), y1 = Math.min(height, box.y1 + blur);
    const w = x1 - x0, h = y1 - y0;
    let values = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) values[y * w + x] = alpha[(y0 + y) * width + x0 + x];
    // 상자 흐림을 세 번 겹쳐 가우스 흐림에 가깝게 만든다.
    for (let pass = 0; pass < 3; pass += 1) values = boxBlur(values, w, h, Math.max(1, Math.round(blur / 1.7)));
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const index = (y0 + y) * width + x0 + x;
        const coverage = mask[index * 4 + 3];
        if (!coverage) continue;
        const soft = values[y * w + x] / 255;
        // 깎기만 한다: 매끈한 선 바깥으로 삐져나온 부분은 지우고, 빈 곳(벽)을 옷으로 채우지는 않는다.
        // 기준선을 홈 깊이만큼 안쪽(0.72)에 두어, 파인 홈까지 한 줄로 고르게 다듬는다.
        const crisp = Math.min(1, Math.max(0, (soft - .72) * 3 + .5)) * 255;
        const target = Math.min(alpha[index], crisp);
        alpha[index] = Math.round(alpha[index] + (target - alpha[index]) * coverage / 255);
      }
    }
  }

  // 문지른 자리 안에서 옷 색에 가까운 픽셀만 되살린다. 주변의 확실한 옷·배경 픽셀 중 가장 비슷한 색과 비교해
  // (그늘진 옷은 그늘진 옷 픽셀과 비교된다) 옷 쪽에 가까운 곳만 불투명하게 만들고, 이미 남아 있는 곳을 지우지는 않는다.
  function keepStroke(data, alpha, width, height, item) {
    const { mask, box } = strokeMask(width, height, item);
    if (!box) return;
    const radius = Math.max(8, Math.round(item.r * Math.max(width, height) * 2));
    const x0 = Math.max(0, box.x0 - radius), y0 = Math.max(0, box.y0 - radius);
    const x1 = Math.min(width, box.x1 + radius), y1 = Math.min(height, box.y1 + radius);
    const w = x1 - x0, h = y1 - y0;
    // 비교용 색 표본을 모은다. 문지른 자리는 빠진 옷일 수 있으니 배경 표본에서 뺀다.
    const fore = [], back = [];
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const index = (y0 + y) * width + x0 + x;
        if (alpha[index] >= 250) fore.push(index);
        else if (alpha[index] <= 5 && !mask[index * 4 + 3]) back.push(index);
      }
    }
    if (fore.length < 8 || back.length < 8) return;
    const pick = (list) => {
      const step = Math.max(1, Math.floor(list.length / 400));
      const out = [];
      for (let k = 0; k < list.length; k += step) out.push([data[list[k] * 4], data[list[k] * 4 + 1], data[list[k] * 4 + 2]]);
      return out;
    };
    const foreColors = pick(fore), backColors = pick(back);
    // 밝기보다 색감(누런 옷 vs 회색 벽) 차이를 더 크게 본다.
    const distance = (r, g, b, c) => {
      const light = (r + g + b - c[0] - c[1] - c[2]) / 3;
      const warm = (r - g) - (c[0] - c[1]);
      const blue = (b - g) - (c[2] - c[1]);
      return .35 * light * light + 2.5 * (warm * warm + blue * blue);
    };
    // 가장 가까운 세 표본의 평균 거리(잡티 하나에 휘둘리지 않게).
    const nearest = (r, g, b, colors) => {
      let a = Infinity, bb = Infinity, cc = Infinity;
      for (const c of colors) {
        const value = distance(r, g, b, c);
        if (value < a) { cc = bb; bb = a; a = value; }
        else if (value < bb) { cc = bb; bb = value; }
        else if (value < cc) cc = value;
      }
      return Math.sqrt((a + bb + cc) / 3);
    };
    // 1) 문지른 픽셀마다 "옷 쪽에 얼마나 가까운지(0~1)"를 구한다.
    const share = new Float32Array(w * h);
    const covered = new Uint8Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const index = (y0 + y) * width + x0 + x;
        const local = y * w + x;
        if (alpha[index] >= 250) { share[local] = 1; continue; }
        const coverage = mask[index * 4 + 3];
        if (!coverage) continue;
        covered[local] = coverage;
        const r = data[index * 4], g = data[index * 4 + 1], b = data[index * 4 + 2];
        const toBack = nearest(r, g, b, backColors), toFore = nearest(r, g, b, foreColors);
        share[local] = toBack / (toBack + toFore + 1e-6);
      }
    }
    // 2) 벽과 옷 색이 비슷하면 픽셀 하나하나는 들쭉날쭉하므로, 주변과 평균 내서 덩어리로 판단한다.
    const soft = boxBlur(boxBlur(share, w, h, 2), w, h, 2);
    // 3) 원래 남아 있던 옷에서 이어지는 곳만 되살린다. 떨어진 벽 조각은 옷 색과 비슷해도 살리지 않는다.
    const reach = new Uint8Array(w * h);
    const queue = [];
    for (let local = 0; local < w * h; local += 1) {
      if (alpha[(y0 + Math.floor(local / w)) * width + x0 + local % w] >= 250) { reach[local] = 1; queue.push(local); }
    }
    while (queue.length) {
      const local = queue.pop();
      const x = local % w, y = (local - x) / w;
      for (const near of [x > 0 ? local - 1 : -1, x < w - 1 ? local + 1 : -1, y > 0 ? local - w : -1, y < h - 1 ? local + w : -1]) {
        if (near < 0 || reach[near] || !covered[near] || soft[near] < .5) continue;
        reach[near] = 1;
        queue.push(near);
      }
    }
    // 4) 되살린 옷에 둘러싸여 바깥 배경과 이어지지 않는 구멍(주름 사이 밝은 곳 등)은 옷으로 채운다.
    const outside = new Uint8Array(w * h);
    for (let local = 0; local < w * h; local += 1) {
      if (!covered[local] && !reach[local] && alpha[(y0 + Math.floor(local / w)) * width + x0 + local % w] <= 5) { outside[local] = 1; queue.push(local); }
    }
    while (queue.length) {
      const local = queue.pop();
      const x = local % w, y = (local - x) / w;
      for (const near of [x > 0 ? local - 1 : -1, x < w - 1 ? local + 1 : -1, y > 0 ? local - w : -1, y < h - 1 ? local + w : -1]) {
        if (near < 0 || outside[near] || reach[near]) continue;
        outside[near] = 1;
        queue.push(near);
      }
    }
    for (let local = 0; local < w * h; local += 1) {
      if (!covered[local]) continue;
      let target = 0;
      // 옷으로 판단된 곳과 그 안의 구멍은 반투명하게 남기지 않고 완전히 불투명하게 만든다.
      if (reach[local] || !outside[local]) target = 255;
      const index = (y0 + Math.floor(local / w)) * width + x0 + local % w;
      if (target > alpha[index]) alpha[index] = Math.round(alpha[index] + (target - alpha[index]) * covered[local] / 255);
    }
    // 5) 되살린 가장자리가 계단처럼 보이지 않게 사진의 색 경계에 맞춘다(문지른 자리 안에서만).
    const snapped = new Uint8Array(alpha);
    const r = Math.max(2, Math.round(Math.max(width, height) / 1024 * 1.5));
    guidedTile(data, alpha, snapped, width, { x0, y0, x1, y1 }, { x0, y0, x1, y1 }, r, .0006);
    for (let local = 0; local < w * h; local += 1) {
      if (!covered[local]) continue;
      const index = (y0 + Math.floor(local / w)) * width + x0 + local % w;
      alpha[index] = snapped[index];
    }
  }

  function boxBlur(values, w, h, radius) {
    const temp = new Float32Array(values.length);
    const out = new Float32Array(values.length);
    for (let y = 0; y < h; y += 1) {
      let sum = 0;
      const row = y * w;
      for (let x = -radius; x <= radius; x += 1) sum += values[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x += 1) {
        temp[row + x] = sum / (radius * 2 + 1);
        sum += values[row + Math.min(w - 1, x + radius + 1)] - values[row + Math.max(0, x - radius)];
      }
    }
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      for (let y = -radius; y <= radius; y += 1) sum += temp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y += 1) {
        out[y * w + x] = sum / (radius * 2 + 1);
        sum += temp[Math.min(h - 1, y + radius + 1) * w + x] - temp[Math.max(0, y - radius) * w + x];
      }
    }
    return out;
  }

  // 붓 자국을 사진 크기에 맞춰 다시 그려, 덮인 정도(0~255)와 범위를 돌려준다.
  function strokeMask(width, height, item) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const radius = Math.max(.5, item.r * Math.max(width, height));
    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#fff";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = radius * 2;
    ctx.beginPath();
    let x0 = width, y0 = height, x1 = 0, y1 = 0;
    item.points.forEach((point, index) => {
      const x = point.x * width, y = point.y * height;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (item.points.length === 1) {
      ctx.arc(item.points[0].x * width, item.points[0].y * height, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.stroke();
    }
    const mask = ctx.getImageData(0, 0, width, height).data;
    if (!item.points.length) return { mask, box: null };
    return {
      mask,
      box: {
        x0: Math.max(0, Math.floor(x0 - radius - 1)), y0: Math.max(0, Math.floor(y0 - radius - 1)),
        x1: Math.min(width, Math.ceil(x1 + radius + 1)), y1: Math.min(height, Math.ceil(y1 + radius + 1))
      }
    };
  }

  // 붓으로 칠한 자리를 같은 비율로 다시 그려, 지우기는 투명하게·되살리기는 불투명하게 바꾼다.
  function paintStroke(alpha, width, height, item) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const radius = Math.max(.5, item.r * Math.max(width, height));
    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#fff";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = radius * 2;
    ctx.beginPath();
    item.points.forEach((point, index) => {
      const x = point.x * width, y = point.y * height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (item.points.length === 1) {
      ctx.arc(item.points[0].x * width, item.points[0].y * height, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.stroke();
    }
    const mask = ctx.getImageData(0, 0, width, height).data;
    const value = item.type === "erase" ? 0 : 255;
    for (let index = 0; index < alpha.length; index += 1) {
      const coverage = mask[index * 4 + 3];
      if (!coverage) continue;
      alpha[index] = coverage === 255 ? value : Math.round(alpha[index] + (value - alpha[index]) * coverage / 255);
    }
  }

  async function computeAiResult(file, source) {
    const cutout = await createImageBitmap(await aiCutout(file));
    const { width, height } = source;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cutout, 0, 0, width, height);
    closeImage(cutout);
    const cut = ctx.getImageData(0, 0, width, height).data;
    const raw = new Uint8Array(width * height);
    for (let index = 0; index < raw.length; index += 1) raw[index] = cut[index * 4 + 3];
    const alpha = snapEdges(source.data, refineAlpha(source.data, raw, width, height), width, height);
    if (source === previewSource) baseCache = { file, source, alpha: new Uint8Array(alpha) };
    applyEdits(file, source.data, alpha, width, height);
    return composeResult(source, alpha);
  }

  function toPreviewPoint(event) {
    const rect = previewCanvas.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    };
  }

  // 붓 크기는 확대해도 화면에서 같은 크기로 보이게, 미리보기 픽셀 기준 반지름을 배율만큼 줄인다.
  function brushRadius() {
    const rect = previewCanvas.getBoundingClientRect();
    return Number(brushSize.value) / 2 * (previewCanvas.width / (rect.width || previewCanvas.width));
  }

  function drawLast() {
    if (lastResult) paintResult(previewCanvas, lastResult);
  }

  function drawStrokeOverlay() {
    drawLast();
    if (!stroke) return;
    const ctx = previewCanvas.getContext("2d");
    ctx.save();
    ctx.strokeStyle = stroke.type === "erase" ? "rgba(230, 40, 60, .5)" : stroke.type === "smooth" ? "rgba(21, 101, 216, .35)" : stroke.type === "keep" ? "rgba(240, 160, 20, .45)" : "rgba(20, 160, 90, .5)";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = brushRadius() * 2;
    ctx.beginPath();
    stroke.points.forEach((point, index) => {
      const x = point.x * previewCanvas.width, y = point.y * previewCanvas.height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (stroke.points.length === 1) {
      ctx.arc(stroke.points[0].x * previewCanvas.width, stroke.points[0].y * previewCanvas.height, brushRadius(), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.stroke();
    }
    ctx.restore();
  }

  // 화면에 맞춘 크기를 100%로 두고 확대한다. 확대하면 상자 안에서 스크롤되고, ‘이동’으로 끌어 옮길 수 있다.
  function setZoom(value, anchorEvent) {
    if (!previewSource) return;
    const level = Math.max(100, Math.min(500, Math.round(value / 25) * 25));
    const stageRect = previewStage.getBoundingClientRect();
    const anchorX = anchorEvent ? anchorEvent.clientX - stageRect.left : previewStage.clientWidth / 2;
    const anchorY = anchorEvent ? anchorEvent.clientY - stageRect.top : previewStage.clientHeight / 2;
    const old = previewCanvas.getBoundingClientRect();
    const ratioX = old.width ? (previewStage.scrollLeft + anchorX - previewCanvas.offsetLeft) / old.width : .5;
    const ratioY = old.height ? (previewStage.scrollTop + anchorY - previewCanvas.offsetTop) / old.height : .5;
    const style = getComputedStyle(previewStage);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const inner = previewStage.offsetWidth - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth) - padX;
    const maxHeight = parseFloat(style.maxHeight) || 640;
    const aspect = previewSource.width / previewSource.height;
    const fitWidth = Math.max(80, Math.min(inner, (maxHeight - padY) * aspect));
    const displayWidth = fitWidth * level / 100;
    previewCanvas.style.width = `${Math.round(displayWidth)}px`;
    zoom.value = String(level);
    zoomValue.textContent = level + "%";
    previewStage.scrollLeft = ratioX * displayWidth + previewCanvas.offsetLeft - anchorX;
    previewStage.scrollTop = ratioY * displayWidth / aspect + previewCanvas.offsetTop - anchorY;
  }

  // AI가 애매하게(반투명) 남긴 곳을 주변 색으로 다시 판단한다.
  // 옷걸이 안쪽 벽처럼 주변 배경과 색이 같은 곳은 투명하게, 옷 안쪽처럼 배경에서 먼 곳은 불투명하게 만든다.
  // 큰 사진은 줄인 사본에서 계산해 애매한 픽셀에만 다시 넓혀 적용한다.
  function refineAlpha(data, raw, width, height) {
    const limit = 1000;
    const scale = Math.min(1, limit / Math.max(width, height));
    if (scale === 1) return recoverMissing(data, matteAlpha(data, raw, width, height), raw, width, height);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const pack = (fill) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const image = new ImageData(width, height);
      for (let index = 0; index < raw.length; index += 1) fill(image.data, index);
      canvas.getContext("2d").putImageData(image, 0, 0);
      const small = document.createElement("canvas");
      small.width = w;
      small.height = h;
      const ctx = small.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(canvas, 0, 0, w, h);
      return ctx.getImageData(0, 0, w, h).data;
    };
    const smallColor = pack((out, index) => {
      out[index * 4] = data[index * 4];
      out[index * 4 + 1] = data[index * 4 + 1];
      out[index * 4 + 2] = data[index * 4 + 2];
      out[index * 4 + 3] = 255;
    });
    const smallMask = pack((out, index) => {
      out[index * 4] = raw[index];
      out[index * 4 + 3] = 255;
    });
    const smallRaw = new Uint8Array(w * h);
    for (let index = 0; index < smallRaw.length; index += 1) smallRaw[index] = smallMask[index * 4];
    const refined = recoverMissing(smallColor, matteAlpha(smallColor, smallRaw, w, h), smallRaw, w, h);
    const refinedImage = new ImageData(w, h);
    for (let index = 0; index < refined.length; index += 1) {
      refinedImage.data[index * 4] = refined[index];
      refinedImage.data[index * 4 + 3] = 255;
    }
    const smallCanvas = document.createElement("canvas");
    smallCanvas.width = w;
    smallCanvas.height = h;
    smallCanvas.getContext("2d").putImageData(refinedImage, 0, 0);
    const big = document.createElement("canvas");
    big.width = width;
    big.height = height;
    const bigCtx = big.getContext("2d", { willReadFrequently: true });
    bigCtx.imageSmoothingQuality = "high";
    bigCtx.drawImage(smallCanvas, 0, 0, width, height);
    const up = bigCtx.getImageData(0, 0, width, height).data;
    const alpha = new Uint8Array(raw);
    for (let index = 0; index < alpha.length; index += 1) {
      // 애매했던 곳과, 잘려 나갔다가 되살아난 곳(소매 등)만 작은 사본의 결과로 바꾼다.
      if ((raw[index] >= 13 && raw[index] <= 242) || up[index * 4] > raw[index] + 40) alpha[index] = up[index * 4];
    }
    return alpha;
  }

  // AI는 사진을 1024px 정사각형으로 바꿔 판단하므로, 되돌린 경계가 계단처럼 보인다(큰 사진일수록 심하다).
  // 원본 사진의 색 경계를 기준으로 투명도를 다시 맞춘다(색 가이드 필터). 경계가 지나가는 조각만 계산한다.
  function snapEdges(data, alpha, width, height) {
    const r = Math.max(2, Math.round(Math.max(width, height) / 1024 * 1.5));
    const eps = .0006;
    const tile = 192;
    const out = new Uint8Array(alpha);
    for (let ty = 0; ty < height; ty += tile) {
      for (let tx = 0; tx < width; tx += tile) {
        const tx1 = Math.min(width, tx + tile), ty1 = Math.min(height, ty + tile);
        const x0 = Math.max(0, tx - 2 * r), y0 = Math.max(0, ty - 2 * r);
        const x1 = Math.min(width, tx1 + 2 * r), y1 = Math.min(height, ty1 + 2 * r);
        let low = 255, high = 0;
        for (let y = y0; y < y1 && !(low < 8 && high > 247); y += 1) {
          for (let x = x0; x < x1; x += 1) {
            const value = alpha[y * width + x];
            if (value < low) low = value;
            if (value > high) high = value;
          }
        }
        if (high < 8 || low > 247) continue;
        guidedTile(data, alpha, out, width, { x0, y0, x1, y1 }, { x0: tx, y0: ty, x1: tx1, y1: ty1 }, r, eps);
      }
    }
    return out;
  }

  function guidedTile(data, alpha, out, width, region, inner, r, eps) {
    const w = region.x1 - region.x0, h = region.y1 - region.y0;
    const stride = w + 1;
    const n = w * h;
    const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n), P = new Float32Array(n);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const source = (region.y0 + y) * width + region.x0 + x;
        const index = y * w + x;
        R[index] = data[source * 4] / 255;
        G[index] = data[source * 4 + 1] / 255;
        B[index] = data[source * 4 + 2] / 255;
        P[index] = alpha[source] / 255;
      }
    }
    const integral = (value) => {
      const sum = new Float64Array(stride * (h + 1));
      for (let y = 0; y < h; y += 1) {
        let row = 0;
        for (let x = 0; x < w; x += 1) {
          row += value(y * w + x);
          sum[(y + 1) * stride + x + 1] = sum[y * stride + x + 1] + row;
        }
      }
      return sum;
    };
    const mean = (sum, x, y) => {
      const ax = Math.max(0, x - r), ay = Math.max(0, y - r);
      const bx = Math.min(w, x + r + 1), by = Math.min(h, y + r + 1);
      return (sum[by * stride + bx] - sum[ay * stride + bx] - sum[by * stride + ax] + sum[ay * stride + ax]) / ((bx - ax) * (by - ay));
    };
    const sR = integral(i => R[i]), sG = integral(i => G[i]), sB = integral(i => B[i]), sP = integral(i => P[i]);
    const sRP = integral(i => R[i] * P[i]), sGP = integral(i => G[i] * P[i]), sBP = integral(i => B[i] * P[i]);
    const sRR = integral(i => R[i] * R[i]), sRG = integral(i => R[i] * G[i]), sRB = integral(i => R[i] * B[i]);
    const sGG = integral(i => G[i] * G[i]), sGB = integral(i => G[i] * B[i]), sBB = integral(i => B[i] * B[i]);
    // 경계 바로 옆 구간마다 "색 → 투명도" 관계(a, b)를 구하고, 그 평균으로 원본 픽셀의 투명도를 다시 낸다.
    const aR = new Float32Array(n), aG = new Float32Array(n), aB = new Float32Array(n), bb = new Float32Array(n);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const mr = mean(sR, x, y), mg = mean(sG, x, y), mb = mean(sB, x, y), mp = mean(sP, x, y);
        const cr = mean(sRP, x, y) - mr * mp, cg = mean(sGP, x, y) - mg * mp, cb = mean(sBP, x, y) - mb * mp;
        const rr = mean(sRR, x, y) - mr * mr + eps, rg = mean(sRG, x, y) - mr * mg, rb = mean(sRB, x, y) - mr * mb;
        const gg = mean(sGG, x, y) - mg * mg + eps, gb = mean(sGB, x, y) - mg * mb, b2 = mean(sBB, x, y) - mb * mb + eps;
        const i11 = gg * b2 - gb * gb, i12 = rb * gb - rg * b2, i13 = rg * gb - rb * gg;
        const i22 = rr * b2 - rb * rb, i23 = rb * rg - rr * gb, i33 = rr * gg - rg * rg;
        const det = rr * i11 + rg * i12 + rb * i13;
        const index = y * w + x;
        aR[index] = (i11 * cr + i12 * cg + i13 * cb) / det;
        aG[index] = (i12 * cr + i22 * cg + i23 * cb) / det;
        aB[index] = (i13 * cr + i23 * cg + i33 * cb) / det;
        bb[index] = mp - aR[index] * mr - aG[index] * mg - aB[index] * mb;
      }
    }
    const qR = integral(i => aR[i]), qG = integral(i => aG[i]), qB = integral(i => aB[i]), qb = integral(i => bb[i]);
    for (let y = inner.y0; y < inner.y1; y += 1) {
      for (let x = inner.x0; x < inner.x1; x += 1) {
        const lx = x - region.x0, ly = y - region.y0;
        const index = ly * w + lx;
        const value = mean(qR, lx, ly) * R[index] + mean(qG, lx, ly) * G[index] + mean(qB, lx, ly) * B[index] + mean(qb, lx, ly);
        // 경계가 흐려지지 않게 중간값 쪽을 조금 또렷하게 당긴다.
        out[y * width + x] = Math.max(0, Math.min(255, Math.round(((value - .5) * 1.8 + .5) * 255)));
      }
    }
  }

  // AI가 옷 일부(벽 앞에 늘어진 소매 등)를 배경으로 잘라 버린 경우를 되살린다.
  // AI는 이렇게 버린 곳에도 아주 옅은 흔적(1~12)을 남기고, 벽·그림자는 정확히 0으로 둔다.
  // 그래서 흔적이 있는 곳 중에서 벽보다 옷 색에 가깝고 남은 옷과 이어진 부분만 되살린다.
  function recoverMissing(data, alpha, raw, width, height) {
    const n = width * height;
    const hinted = (index) => raw[index] >= 1 && alpha[index] < 128;
    let hints = 0;
    for (let index = 0; index < n; index += 1) if (hinted(index)) hints += 1;
    if (!hints) return alpha;
    const neighbors = (index) => {
      const x = index % width, y = (index - x) / width;
      return [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, y > 0 ? index - width : -1, y < height - 1 ? index + width : -1];
    };
    // 옷 색 표본은 가장자리 근처 천에서, 벽 색 표본은 흔적이 전혀 없는 투명한 곳에서 뽑는다.
    const edgeLimit = Math.max(4, Math.round(Math.max(width, height) * .02));
    const inside = new Int32Array(n).fill(-1);
    const queue = [];
    for (let index = 0; index < n; index += 1) if (alpha[index] < 128) { inside[index] = 0; queue.push(index); }
    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head];
      if (inside[index] >= edgeLimit) continue;
      for (const near of neighbors(index)) {
        if (near < 0 || inside[near] >= 0) continue;
        inside[near] = inside[index] + 1;
        queue.push(near);
      }
    }
    const fore = [], back = [];
    for (let index = 0; index < n; index += 1) {
      if (alpha[index] >= 250 && inside[index] > 0) fore.push(index);
      else if (alpha[index] <= 5 && raw[index] === 0) back.push(index);
    }
    if (fore.length < 50 || back.length < 50) return alpha;
    const pick = (list) => {
      const step = Math.max(1, Math.floor(list.length / 500));
      const out = [];
      for (let k = 0; k < list.length; k += step) out.push([data[list[k] * 4], data[list[k] * 4 + 1], data[list[k] * 4 + 2]]);
      return out;
    };
    const foreColors = pick(fore), backColors = pick(back);
    const distance = (r, g, b, c) => {
      const light = (r + g + b - c[0] - c[1] - c[2]) / 3;
      const warm = (r - g) - (c[0] - c[1]);
      const blue = (b - g) - (c[2] - c[1]);
      return .35 * light * light + 2.5 * (warm * warm + blue * blue);
    };
    const nearest = (r, g, b, colors) => {
      let a = Infinity, bb = Infinity, cc = Infinity;
      for (const c of colors) {
        const value = distance(r, g, b, c);
        if (value < a) { cc = bb; bb = a; a = value; }
        else if (value < bb) { cc = bb; bb = value; }
        else if (value < cc) cc = value;
      }
      return Math.sqrt((a + bb + cc) / 3);
    };
    const share = new Float32Array(n);
    for (let index = 0; index < n; index += 1) {
      if (alpha[index] >= 128) { share[index] = 1; continue; }
      if (!hinted(index)) continue;
      const r = data[index * 4], g = data[index * 4 + 1], b = data[index * 4 + 2];
      const toBack = nearest(r, g, b, backColors), toFore = nearest(r, g, b, foreColors);
      share[index] = toBack / (toBack + toFore + 1e-6);
    }
    const soft = boxBlur(boxBlur(share, width, height, 1), width, height, 1);
    // 남은 옷에서 흔적을 따라 이어지는 곳만 되살린다.
    const reach = new Uint8Array(n);
    for (let index = 0; index < n; index += 1) if (alpha[index] >= 128) { reach[index] = 1; queue.push(index); }
    while (queue.length) {
      const index = queue.pop();
      for (const near of neighbors(index)) {
        if (near < 0 || reach[near] || !hinted(near) || soft[near] < .5) continue;
        reach[near] = 1;
        queue.push(near);
      }
    }
    // 되살린 옷에 둘러싸인 흔적 구멍(주름 그늘 등)도 채운다. 바깥과 이어진 곳은 그대로 둔다.
    const outside = new Uint8Array(n);
    for (let index = 0; index < n; index += 1) if (!reach[index] && !hinted(index)) { outside[index] = 1; queue.push(index); }
    while (queue.length) {
      const index = queue.pop();
      for (const near of neighbors(index)) {
        if (near < 0 || outside[near] || reach[near]) continue;
        outside[near] = 1;
        queue.push(near);
      }
    }
    const grown = new Float32Array(n);
    let garment = 0;
    for (let index = 0; index < n; index += 1) {
      if (alpha[index] >= 128) { garment += 1; continue; }
      if (reach[index] || (hinted(index) && !outside[index])) grown[index] = 1;
    }
    // 가늘게 뻗은 줄은 소매가 아니므로 걷어 낸다(가는 줄은 깎이고, 굵은 소매만 남는다).
    const thin = Math.max(2, Math.round(Math.max(width, height) * .004));
    const body = new Float32Array(n);
    for (let index = 0; index < n; index += 1) body[index] = alpha[index] >= 128 ? 1 : grown[index];
    const eroded = boxBlur(body, width, height, thin);
    for (let index = 0; index < n; index += 1) eroded[index] = eroded[index] > .999 ? 1 : 0;
    const opened = boxBlur(eroded, width, height, thin);
    const out = new Uint8Array(alpha);
    let added = 0;
    for (let index = 0; index < n; index += 1) {
      if (!grown[index] || opened[index] <= 0) continue;
      out[index] = 255;
      added += 1;
    }
    // 한꺼번에 너무 많이 붙으면 잘못 잡은 것으로 보고 되돌린다.
    if (added > garment * .12) return alpha;
    return out;
  }

  function matteAlpha(data, raw, width, height) {
    const radius = Math.max(8, Math.round(Math.max(width, height) * .045));
    const stride = width + 1;
    const sums = Array.from({ length: 8 }, () => new Float32Array(stride * (height + 1)));
    const row = new Float64Array(8);
    for (let y = 0; y < height; y += 1) {
      row.fill(0);
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const value = raw[index];
        const r = data[index * 4], g = data[index * 4 + 1], b = data[index * 4 + 2];
        if (value < 13) { row[0] += 1; row[1] += r; row[2] += g; row[3] += b; }
        else if (value > 242) { row[4] += 1; row[5] += r; row[6] += g; row[7] += b; }
        const cell = (y + 1) * stride + x + 1;
        for (let channel = 0; channel < 8; channel += 1) sums[channel][cell] = sums[channel][cell - stride] + row[channel];
      }
    }
    const box = (channel, x0, y0, x1, y1) => sums[channel][y1 * stride + x1] - sums[channel][y0 * stride + x1] - sums[channel][y1 * stride + x0] + sums[channel][y0 * stride + x0];
    // 밝기보다 색감(따뜻한 벽 vs 회색 옷) 차이를 더 크게 본다.
    const distance = (r, g, b, R, G, B) => {
      const light = (r + g + b - R - G - B) / 3;
      const warm = (r - g) - (R - G);
      const blue = (b - g) - (B - G);
      return Math.sqrt(.35 * light * light + 2.5 * (warm * warm + blue * blue));
    };
    const alpha = new Uint8Array(raw);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const value = raw[index];
        if (value < 13 || value > 242) continue;
        const x0 = Math.max(0, x - radius), y0 = Math.max(0, y - radius);
        const x1 = Math.min(width, x + radius + 1), y1 = Math.min(height, y + radius + 1);
        const background = box(0, x0, y0, x1, y1);
        const foreground = box(4, x0, y0, x1, y1);
        if (background < 4) {
          if (value > 60) alpha[index] = 255;
          continue;
        }
        if (foreground < 4) continue;
        const r = data[index * 4], g = data[index * 4 + 1], b = data[index * 4 + 2];
        const toBackground = distance(r, g, b, box(1, x0, y0, x1, y1) / background, box(2, x0, y0, x1, y1) / background, box(3, x0, y0, x1, y1) / background);
        const toForeground = distance(r, g, b, box(5, x0, y0, x1, y1) / foreground, box(6, x0, y0, x1, y1) / foreground, box(7, x0, y0, x1, y1) / foreground);
        const share = toBackground / (toBackground + toForeground + 1e-6);
        alpha[index] = Math.round(255 * Math.min(1, Math.max(0, (share - .5) * 1.8 + .5)));
      }
    }
    return alpha;
  }

  // 누른 점에서 시작해, 아직 남아 있는 픽셀 중 누른 곳과 색이 비슷하게 이어진 부분을 투명하게 한다.
  function clearSimilar(data, alpha, width, height, point) {
    const sx = Math.min(width - 1, Math.max(0, Math.round(point.x * width)));
    const sy = Math.min(height - 1, Math.max(0, Math.round(point.y * height)));
    const seed = sy * width + sx;
    if (!alpha[seed]) return;
    const r = data[seed * 4], g = data[seed * 4 + 1], b = data[seed * 4 + 2];
    const limit = point.tol * point.tol;
    const near = index => {
      const dr = data[index * 4] - r, dg = data[index * 4 + 1] - g, db = data[index * 4 + 2] - b;
      return dr * dr + dg * dg + db * db;
    };
    const marked = new Uint8Array(width * height);
    const stack = [seed];
    marked[seed] = 1;
    while (stack.length) {
      const index = stack.pop();
      const x = index % width;
      const neighbors = [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, index - width, index + width];
      for (const next of neighbors) {
        if (next < 0 || next >= marked.length || marked[next] || !alpha[next] || near(next) > limit) continue;
        marked[next] = 1;
        stack.push(next);
      }
    }
    // 경계에 반쯤 섞인 한 줄도 함께 지워 테두리가 남지 않게 한다.
    const edge = limit * 3.2;
    for (let index = 0; index < marked.length; index += 1) {
      if (marked[index] !== 1) continue;
      const x = index % width;
      for (const next of [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, index - width, index + width]) {
        if (next >= 0 && next < marked.length && !marked[next] && alpha[next] && near(next) <= edge) marked[next] = 2;
      }
    }
    for (let index = 0; index < marked.length; index += 1) if (marked[index]) alpha[index] = 0;
  }

  function eraseFromPreview(event) {
    const file = currentPreviewFile();
    if (!previewSource || !previewAlpha || !file) return;
    const rect = previewCanvas.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const px = Math.min(previewSource.width - 1, Math.floor(x * previewSource.width));
    const py = Math.min(previewSource.height - 1, Math.floor(y * previewSource.height));
    if (!previewAlpha[py * previewSource.width + px]) {
      selectedColorNote.textContent = "이미 투명한 곳이에요. 남아 있는 배경을 눌러 주세요.";
      return;
    }
    if (!edits.has(file)) edits.set(file, []);
    edits.get(file).push({ type: "wand", x, y, tol: Number(wandTol.value) });
    updatePreview();
  }

  function chooseColorFromPreview(event) {
    if (!previewSource || removeMethod.value === "ai") return;
    const rect = previewCanvas.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
    const x = Math.min(previewSource.width - 1, Math.max(0, Math.floor((event.clientX - rect.left) * previewSource.width / rect.width)));
    const y = Math.min(previewSource.height - 1, Math.max(0, Math.floor((event.clientY - rect.top) * previewSource.height / rect.height)));
    const index = (y * previewSource.width + x) * 4;
    const picked = {
      r: previewSource.data[index],
      g: previewSource.data[index + 1],
      b: previewSource.data[index + 2]
    };
    backgroundMode.value = "manual";
    backgroundColor.disabled = false;
    backgroundColor.value = rgbToHex(picked);
    selectedColorNote.textContent = `선택한 배경색 ${backgroundColor.value.toUpperCase()}을 지워요.`;
    updatePreview();
  }

  async function processFiles() {
    if (!files.length) return;
    processButton.disabled = true;
    const outputs = [];
    let failures = 0;
    try {
      for (let index = 0; index < files.length; index += 1) {
        setStatus(`${index + 1}/${files.length}번째 사진의 배경을 지우고 있어요…`, "");
        await nextPaint();
        try {
          outputs.push(await processOne(files[index]));
        } catch (error) {
          console.error(error);
          failures += 1;
        }
      }
      if (!outputs.length) throw new Error("No images could be processed");
      makeOutputNamesUnique(outputs);
      if (outputs.length === 1) {
        downloadBlob(outputs[0].blob, outputs[0].name);
      } else {
        setStatus("결과를 ZIP 파일로 묶고 있어요…", "");
        await nextPaint();
        downloadBlob(await createZip(outputs), "pixelhanbang-transparent-" + dateStamp() + ".zip");
      }
      const failureNotice = failures ? ` · ${failures}장은 처리하지 못했어요` : "";
      const kind = fillColor() ? `배경색 ${fillColor()} JPG` : "투명 PNG";
      setStatus(`${outputs.length}개 ${kind} 저장 준비 완료` + failureNotice, failures ? "error" : "success");
    } catch (error) {
      console.error(error);
      setStatus("처리하지 못한 이미지가 있어요. 사진 수를 줄이거나 다른 파일로 다시 시도해 주세요.", "error");
    } finally {
      processButton.disabled = false;
    }
  }

  async function processOne(file) {
    if (removeMethod.value === "ai") {
      const image = await decodeImage(file);
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      closeImage(image);
      const { image: result } = await aiResult(file, ctx.getImageData(0, 0, canvas.width, canvas.height));
      return finishOutput(file, result);
    }
    const image = await decodeImage(file);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    closeImage(image);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const target = backgroundMode.value === "manual"
      ? hexToRgb(backgroundColor.value)
      : detectBorderColor(pixels);
    removeConnectedBackground(pixels, target, Number(tolerance.value));
    return finishOutput(file, pixels);
  }

  async function finishOutput(file, imageData) {
    const canvas = document.createElement("canvas");
    paintResult(canvas, imageData);
    if (!fillColor()) return { name: outputName(file.name), blob: await canvasToBlob(canvas) };
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("JPG save failed")), "image/jpeg", .95));
    return { name: outputName(file.name).replace(/-transparent\.png$/, "-bg.jpg"), blob };
  }

  async function decodeImage(file) {
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch (error) {
        console.warn("createImageBitmap fallback", error);
      }
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = "async";
      image.src = url;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function closeImage(image) {
    if (typeof image.close === "function") image.close();
  }

  function detectBorderColor(imageData) {
    const { data, width, height } = imageData;
    const bins = new Map();
    const step = Math.max(1, Math.floor(Math.max(width, height) / 600));
    const add = (x, y) => {
      const index = (y * width + x) * 4;
      if (data[index + 3] === 0) return;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
      const bin = bins.get(key) || { count: 0, r: 0, g: 0, b: 0 };
      bin.count += 1;
      bin.r += r;
      bin.g += g;
      bin.b += b;
      bins.set(key, bin);
    };
    for (let x = 0; x < width; x += step) {
      add(x, 0);
      if (height > 1) add(x, height - 1);
    }
    for (let y = step; y < height - 1; y += step) {
      add(0, y);
      if (width > 1) add(width - 1, y);
    }
    let best = null;
    bins.forEach(bin => {
      if (!best || bin.count > best.count) best = bin;
    });
    if (!best) return { r: 255, g: 255, b: 255 };
    return {
      r: Math.round(best.r / best.count),
      g: Math.round(best.g / best.count),
      b: Math.round(best.b / best.count)
    };
  }

  function removeConnectedBackground(imageData, target, strength) {
    const { data, width, height } = imageData;
    const limit = 8 + strength * 1.32;
    const limitSquared = limit * limit;
    const matches = pixel => {
      if (data[pixel + 3] === 0) return false;
      const dr = data[pixel] - target.r;
      const dg = data[pixel + 1] - target.g;
      const db = data[pixel + 2] - target.b;
      return .299 * dr * dr + .587 * dg * dg + .114 * db * db <= limitSquared;
    };
    const stack = [];
    for (let x = 0; x < width; x += 1) {
      stack.push(x, (height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y += 1) {
      stack.push(y * width, y * width + width - 1);
    }

    while (stack.length) {
      const seed = stack.pop();
      const y = Math.floor(seed / width);
      let x = seed - y * width;
      let pixel = seed * 4;
      if (!matches(pixel)) continue;

      while (x > 0 && matches(pixel - 4)) {
        x -= 1;
        pixel -= 4;
      }

      let spanUp = false;
      let spanDown = false;
      while (x < width && matches(pixel)) {
        data[pixel + 3] = 0;
        if (y > 0) {
          const up = pixel - width * 4;
          if (matches(up)) {
            if (!spanUp) stack.push((y - 1) * width + x);
            spanUp = true;
          } else {
            spanUp = false;
          }
        }
        if (y < height - 1) {
          const down = pixel + width * 4;
          if (matches(down)) {
            if (!spanDown) stack.push((y + 1) * width + x);
            spanDown = true;
          } else {
            spanDown = false;
          }
        }
        x += 1;
        pixel += 4;
      }
    }
  }

  function hexToRgb(hex) {
    const value = hex.replace("#", "");
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16)
    };
  }

  function rgbToHex({ r, g, b }) {
    return "#" + [r, g, b].map(value => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("").toUpperCase();
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG save failed")), "image/png"));
  }

  function outputName(name) {
    const base = name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "image";
    return `${base}-transparent.png`;
  }

  function makeOutputNamesUnique(outputs) {
    const used = new Map();
    outputs.forEach(item => {
      const key = item.name.toLowerCase();
      const count = used.get(key) || 0;
      used.set(key, count + 1);
      if (!count) return;
      item.name = item.name.replace(/\.png$/i, `-${count + 1}.png`);
    });
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

  function dateStamp() {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("");
  }

  function nextPaint() {
    return new Promise(resolve => requestAnimationFrame(() => window.setTimeout(resolve, 0)));
  }

  function setStatus(message, kind) {
    status.textContent = message;
    status.className = "status" + (kind ? " " + kind : "");
  }

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function zipDate(date) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  function concat(parts) {
    const size = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(size);
    let offset = 0;
    parts.forEach(part => {
      out.set(part, offset);
      offset += part.length;
    });
    return out;
  }

  async function createZip(items) {
    const encoder = new TextEncoder();
    const locals = [];
    const centrals = [];
    let offset = 0;
    const stamp = zipDate(new Date());

    for (const item of items) {
      const name = encoder.encode(item.name);
      const data = new Uint8Array(await item.blob.arrayBuffer());
      const crc = crc32(data);
      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, stamp.time, true);
      lv.setUint16(12, stamp.date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      local.set(name, 30);
      locals.push(local, data);

      const central = new Uint8Array(46 + name.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, stamp.time, true);
      cv.setUint16(14, stamp.date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      central.set(name, 46);
      centrals.push(central);
      offset += local.length + data.length;
    }

    const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, items.length, true);
    ev.setUint16(10, items.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    return new Blob([concat([...locals, ...centrals, end])], { type: "application/zip" });
  }
})();
