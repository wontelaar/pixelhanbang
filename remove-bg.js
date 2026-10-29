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
  previewStage.addEventListener("click", chooseColorFromPreview);
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
      row.querySelector(".remove-file").addEventListener("click", () => {
        files.splice(index, 1);
        renderFiles();
        loadPreview();
        setStatus(files.length ? files.length + "장 선택됨" : "", "");
      });
      fileList.appendChild(row);
    });
    processButton.disabled = files.length === 0;
  }

  function clearObjectUrls() {
    fileList.querySelectorAll("[data-object-url]").forEach(node => URL.revokeObjectURL(node.dataset.objectUrl));
  }

  async function loadPreview() {
    previewSource = null;
    if (!files[0]) {
      previewWrap.classList.remove("is-visible");
      previewCanvas.width = 0;
      previewCanvas.height = 0;
      return;
    }
    try {
      setStatus("미리보기를 만들고 있어요…", "");
      const image = await decodeImage(files[0]);
      const scale = Math.min(1, 900 / image.width, 620 / image.height);
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
    previewCanvas.getContext("2d").putImageData(copy, 0, 0);
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
          model: "isnet_quint8",
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
    const file = files[0];
    if (!file) return;
    const ctx = previewCanvas.getContext("2d");
    ctx.putImageData(previewSource, 0, 0);
    selectedColorNote.textContent = "AI가 물건을 찾고 있어요…";
    try {
      const cutout = await createImageBitmap(await aiCutout(file));
      if (sequence !== previewSequence || removeMethod.value !== "ai") return;
      ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(cutout, 0, 0, previewCanvas.width, previewCanvas.height);
      closeImage(cutout);
      selectedColorNote.textContent = "AI 결과예요. 체크무늬가 투명하게 저장될 부분이에요.";
      setStatus(files.length + "장 선택됨", "");
    } catch (error) {
      console.error(error);
      if (sequence !== previewSequence) return;
      selectedColorNote.textContent = "AI를 불러오지 못했어요. 인터넷 연결을 확인하거나 ‘같은 색 배경 지우기’를 써 보세요.";
    }
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
      setStatus(outputs.length + "개 투명 PNG 저장 준비 완료" + failureNotice, failures ? "error" : "success");
    } catch (error) {
      console.error(error);
      setStatus("처리하지 못한 이미지가 있어요. 사진 수를 줄이거나 다른 파일로 다시 시도해 주세요.", "error");
    } finally {
      processButton.disabled = false;
    }
  }

  async function processOne(file) {
    if (removeMethod.value === "ai") return { name: outputName(file.name), blob: await aiCutout(file) };
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
    ctx.putImageData(pixels, 0, 0);
    const blob = await canvasToBlob(canvas);
    return { name: outputName(file.name), blob };
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
