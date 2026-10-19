(() => {
  "use strict";

  const body = document.body;
  const mode = body.dataset.tool || "resize";
  const input = document.querySelector("#fileInput");
  const dropzone = document.querySelector("#dropzone");
  const chooseButton = document.querySelector("#chooseButton");
  const fileList = document.querySelector("#fileList");
  const processButton = document.querySelector("#processButton");
  const status = document.querySelector("#status");
  const quality = document.querySelector("#quality");
  const qualityValue = document.querySelector("#qualityValue");
  const widthInput = document.querySelector("#width");
  const heightInput = document.querySelector("#height");
  const keepRatio = document.querySelector("#keepRatio");
  const doubleSizeButton = document.querySelector("#doubleSizeButton");
  const doubleSizeHint = document.querySelector("#doubleSizeHint");
  const highQualityUpscale = document.querySelector("#highQualityUpscale");
  const format = document.querySelector("#format");
  const squareSize = document.querySelector("#squareSize");
  const background = document.querySelector("#background");
  const gridCount = document.querySelector("#gridCount");
  const targetSize = document.querySelector("#targetSize");
  const targetUnit = document.querySelector("#targetUnit");
  const targetFormat = document.querySelector("#targetFormat");
  let files = [];
  let aspectRatio = null;
  let firstImageSize = null;

  const modeSettings = {
    resize: { button: "크기 변경하고 저장", multiple: true },
    compress: { button: "용량 줄이고 저장", multiple: true },
    convert: { button: "형식 변환하고 저장", multiple: true },
    heic: { button: "JPG로 변환하고 저장", multiple: true },
    square: { button: "정사각형으로 저장", multiple: true },
    grid: { button: "분할 이미지 저장", multiple: false },
    target: { button: "목표 용량으로 저장", multiple: true }
  };

  if (!input || !dropzone || !processButton) return;
  input.multiple = modeSettings[mode].multiple;
  processButton.textContent = modeSettings[mode].button;

  chooseButton.addEventListener("click", () => input.click());
  dropzone.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    input.click();
  });
  dropzone.addEventListener("keydown", (event) => {
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

  if (quality) {
    const updateQuality = () => { qualityValue.textContent = quality.value + "%"; };
    quality.addEventListener("input", updateQuality);
    updateQuality();
  }

  if (widthInput && heightInput && keepRatio) {
    widthInput.addEventListener("input", () => {
      if (keepRatio.checked && aspectRatio && widthInput.value) {
        heightInput.value = Math.max(1, Math.round(Number(widthInput.value) / aspectRatio));
      }
    });
    heightInput.addEventListener("input", () => {
      if (keepRatio.checked && aspectRatio && heightInput.value) {
        widthInput.value = Math.max(1, Math.round(Number(heightInput.value) * aspectRatio));
      }
    });
  }

  if (doubleSizeButton) {
    doubleSizeButton.addEventListener("click", () => {
      if (!firstImageSize) return;
      const width = clampDimension(firstImageSize.width * 2);
      const height = clampDimension(firstImageSize.height * 2);
      widthInput.value = width;
      heightInput.value = height;
      keepRatio.checked = true;
      if (highQualityUpscale) highQualityUpscale.checked = true;
      setStatus(`${firstImageSize.width} × ${firstImageSize.height} → ${width} × ${height} 고화질 확대 준비 완료`, "success");
    });
  }

  processButton.addEventListener("click", processFiles);

  function addFiles(incoming) {
    const maxFiles = mode === "heic" ? 50 : 30;
    const valid = incoming.filter(file => {
      const supported = mode === "heic" ? isHeic(file) : /^image\/(jpeg|png|webp)$/.test(file.type);
      return supported && file.size <= 25 * 1024 * 1024;
    });
    if (!valid.length) {
      const message = mode === "heic"
        ? "HEIC 또는 HEIF 사진(장당 25MB 이하)을 선택해 주세요."
        : "JPG, PNG, WebP 이미지(장당 25MB 이하)를 선택해 주세요.";
      setStatus(message, "error");
      return;
    }
    if (mode === "grid") {
      clearObjectUrls();
      files = [valid[0]];
    } else {
      const combined = [...files, ...valid];
      const unique = new Map(combined.map(file => [file.name + file.size + file.lastModified, file]));
      files = [...unique.values()].slice(0, maxFiles);
    }
    renderFiles();
    inspectFirstImage();
    const limitNotice = incoming.length > maxFiles ? ` · 한 번에 최대 ${maxFiles}장까지 가능해요` : "";
    setStatus(files.length + "장 선택됨" + limitNotice, "");
  }

  function renderFiles() {
    clearObjectUrls();
    fileList.innerHTML = "";
    files.forEach((file, index) => {
      const row = document.createElement("div");
      row.className = "file-row";
      const thumb = isHeic(file)
        ? '<div class="file-thumb file-thumb-placeholder" aria-hidden="true">HEIC</div>'
        : '<img class="file-thumb" alt="">';
      row.innerHTML = `
        ${thumb}
        <div>
          <div class="file-name"></div>
          <div class="file-meta">${formatBytes(file.size)}</div>
        </div>
        <button class="remove-file" type="button" aria-label="이 이미지 삭제">×</button>
      `;
      if (!isHeic(file)) {
        const url = URL.createObjectURL(file);
        row.dataset.objectUrl = url;
        row.querySelector(".file-thumb").src = url;
      }
      row.querySelector(".file-name").textContent = file.name;
      row.querySelector(".remove-file").addEventListener("click", () => {
        files.splice(index, 1);
        renderFiles();
        inspectFirstImage();
        processButton.disabled = files.length === 0;
        setStatus(files.length ? files.length + "장 선택됨" : "", "");
      });
      fileList.appendChild(row);
    });
    processButton.disabled = files.length === 0;
    if (doubleSizeButton) doubleSizeButton.disabled = files.length === 0;
  }

  function clearObjectUrls() {
    fileList.querySelectorAll("[data-object-url]").forEach(node => URL.revokeObjectURL(node.dataset.objectUrl));
  }

  async function inspectFirstImage() {
    if (!files[0] || !widthInput || !heightInput) {
      firstImageSize = null;
      if (doubleSizeButton) doubleSizeButton.disabled = true;
      return;
    }
    try {
      const bitmap = await createImageBitmap(files[0], { imageOrientation: "from-image" });
      aspectRatio = bitmap.width / bitmap.height;
      firstImageSize = { width: bitmap.width, height: bitmap.height };
      if (!widthInput.value) widthInput.value = bitmap.width;
      if (!heightInput.value) heightInput.value = bitmap.height;
      if (doubleSizeButton) doubleSizeButton.disabled = false;
      if (doubleSizeHint) doubleSizeHint.textContent = `이 사진: ${bitmap.width} × ${bitmap.height} → ${clampDimension(bitmap.width * 2)} × ${clampDimension(bitmap.height * 2)}`;
      bitmap.close();
    } catch {
      aspectRatio = null;
      firstImageSize = null;
      if (doubleSizeButton) doubleSizeButton.disabled = true;
    }
  }

  async function processFiles() {
    if (!files.length) return;
    processButton.disabled = true;
    setStatus("이미지를 처리하고 있어요…", "");
    try {
      let outputs;
      let failures = 0;
      if (mode === "grid") {
        outputs = await processGrid(files[0]);
      } else if (mode === "target") {
        const limit = targetLimit();
        if (!limit) {
          setStatus("목표 용량을 숫자로 입력해 주세요. 예: 500", "error");
          return;
        }
        outputs = [];
        const rows = fileList.querySelectorAll(".file-row");
        for (let index = 0; index < files.length; index += 1) {
          setStatus(`${index + 1}/${files.length}번째 사진을 목표 용량에 맞추고 있어요…`, "");
          try {
            const item = await processTarget(files[index], limit);
            outputs.push(item);
            const meta = rows[index] && rows[index].querySelector(".file-meta");
            if (meta) meta.textContent = `${formatBytes(files[index].size)} → ${formatBytes(item.blob.size)} · ${item.width} × ${item.height}`;
            if (!item.met) failures += 1;
          } catch (error) {
            console.error(error);
            failures += 1;
          }
        }
        if (!outputs.length) throw new Error("No files could be processed");
      } else if (mode === "heic") {
        outputs = [];
        for (let index = 0; index < files.length; index += 1) {
          setStatus(`${index + 1}/${files.length}번째 사진을 JPG로 변환하고 있어요…`, "");
          try {
            outputs.push(await processOne(files[index]));
          } catch (error) {
            console.error(error);
            failures += 1;
          }
        }
        if (!outputs.length) throw new Error("No HEIC files could be converted");
      } else {
        outputs = await Promise.all(files.map(processOne));
      }
      makeOutputNamesUnique(outputs);
      if (outputs.length === 1) {
        downloadBlob(outputs[0].blob, outputs[0].name);
      } else {
        const zip = await createZip(outputs);
        downloadBlob(zip, "pixelhanbang-" + dateStamp() + ".zip");
      }
      const original = files.reduce((sum, file) => sum + file.size, 0);
      const result = outputs.reduce((sum, item) => sum + item.blob.size, 0);
      const comparison = mode === "compress" || mode === "target" ? ` · ${formatBytes(original)} → ${formatBytes(result)}` : "";
      const failureNotice = !failures ? "" : mode === "target"
        ? ` · ${failures}장은 목표 용량까지 줄이지 못했어요. 목표를 조금 높여 주세요`
        : ` · ${failures}장은 변환하지 못했어요`;
      setStatus(outputs.length + "개 파일 저장 준비 완료" + comparison + failureNotice, failures ? "error" : "success");
    } catch (error) {
      console.error(error);
      setStatus("처리하지 못한 이미지가 있어요. 다른 파일로 다시 시도해 주세요.", "error");
    } finally {
      processButton.disabled = false;
    }
  }

  async function processOne(file) {
    if (mode === "heic") {
      if (typeof window.heic2any !== "function") throw new Error("HEIC converter is unavailable");
      const converted = await window.heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: getQuality()
      });
      const blob = Array.isArray(converted) ? converted[0] : converted;
      if (!(blob instanceof Blob)) throw new Error("HEIC conversion failed");
      return { name: outputName(file.name, "image/jpeg", "heic"), blob };
    }

    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    let canvas;
    let mime = getMime(file);

    if (mode === "resize") {
      mime = selectedMime(format.value, file.type);
      let width = clampDimension(Number(widthInput.value) || bitmap.width);
      let height = clampDimension(Number(heightInput.value) || bitmap.height);
      if (keepRatio.checked) {
        if (Number(widthInput.value)) {
          height = clampDimension(width / (bitmap.width / bitmap.height));
        } else {
          width = clampDimension(height * (bitmap.width / bitmap.height));
        }
      }
      const shouldSharpen = Boolean(highQualityUpscale?.checked) && (width > bitmap.width || height > bitmap.height);
      canvas = drawResized(bitmap, width, height, mime === "image/jpeg" ? "#ffffff" : null, shouldSharpen);
    } else if (mode === "compress") {
      canvas = drawResized(bitmap, bitmap.width, bitmap.height);
      mime = file.type === "image/png" ? "image/webp" : (file.type || "image/jpeg");
    } else if (mode === "convert") {
      canvas = drawResized(bitmap, bitmap.width, bitmap.height, format.value === "jpg" ? "#ffffff" : null);
      mime = selectedMime(format.value, file.type);
    } else if (mode === "square") {
      const size = clampDimension(Number(squareSize.value) || 1080);
      canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.fillStyle = background.value || "#ffffff";
      ctx.fillRect(0, 0, size, size);
      const scale = Math.min(size / bitmap.width, size / bitmap.height);
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);
      ctx.drawImage(bitmap, Math.round((size - width) / 2), Math.round((size - height) / 2), width, height);
      mime = selectedMime(format.value, file.type);
    }

    bitmap.close();
    const blob = await canvasToBlob(canvas, mime, getQuality());
    return { name: outputName(file.name, mime, mode), blob };
  }

  function targetLimit() {
    const value = Number(targetSize && targetSize.value);
    if (!Number.isFinite(value) || value <= 0) return 0;
    const bytes = Math.round(value * (targetUnit.value === "MB" ? 1000 * 1000 : 1000));
    return Math.max(10 * 1000, bytes);
  }

  // 목표 용량 이하에서 가장 높은 화질을 찾고, 화질만으로 부족하면 픽셀 크기를 줄여 다시 찾는다.
  async function processTarget(file, limit) {
    const mime = targetFormat && targetFormat.value === "webp" ? "image/webp" : "image/jpeg";
    const name = outputName(file.name, mime, "target");
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      let scale = Math.min(1, 8000 / Math.max(bitmap.width, bitmap.height));
      // 작은 사본으로 픽셀당 용량을 먼저 재서, 목표보다 훨씬 큰 사진은 처음부터 알맞은 크기 근처에서 찾는다.
      const probeScale = Math.min(scale, 800 / Math.max(bitmap.width, bitmap.height));
      if (probeScale < scale) {
        const probeWidth = Math.max(1, Math.round(bitmap.width * probeScale));
        const probeHeight = Math.max(1, Math.round(bitmap.height * probeScale));
        const probe = await canvasToBlob(drawResized(bitmap, probeWidth, probeHeight, mime === "image/jpeg" ? "#ffffff" : null), mime, .55);
        const estimate = probe.size / (probeWidth * probeHeight) * bitmap.width * bitmap.height * scale * scale;
        if (estimate > limit * 1.5) scale *= Math.max(probeScale / scale, Math.sqrt(limit / estimate) * 1.1);
      }
      let smallest = null;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = drawResized(bitmap, width, height, mime === "image/jpeg" ? "#ffffff" : null);
        const top = await canvasToBlob(canvas, mime, .95);
        if (top.size <= limit) return { name, blob: top, met: true, width, height };
        let low = .55;
        let high = .95;
        let fit = null;
        const floor = await canvasToBlob(canvas, mime, low);
        if (floor.size <= limit) {
          fit = floor;
          for (let step = 0; step < 6; step += 1) {
            const middle = (low + high) / 2;
            const blob = await canvasToBlob(canvas, mime, middle);
            if (blob.size <= limit) {
              fit = blob;
              low = middle;
            } else {
              high = middle;
            }
          }
          return { name, blob: fit, met: true, width, height };
        }
        smallest = { name, blob: floor, met: false, width, height };
        if (Math.max(width, height) <= 160) break;
        scale *= Math.min(.9, Math.max(.4, Math.sqrt(limit / floor.size) * .95));
      }
      return smallest;
    } finally {
      bitmap.close();
    }
  }

  async function processGrid(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const count = Number(gridCount.value) === 9 ? 9 : 3;
    const rows = count === 9 ? 3 : 1;
    const cell = 1080;
    const master = document.createElement("canvas");
    master.width = cell * 3;
    master.height = cell * rows;
    const ctx = master.getContext("2d", { alpha: false });
    ctx.fillStyle = background.value || "#ffffff";
    ctx.fillRect(0, 0, master.width, master.height);
    const scale = Math.min(master.width / bitmap.width, master.height / bitmap.height);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    ctx.drawImage(bitmap, Math.round((master.width - width) / 2), Math.round((master.height - height) / 2), width, height);
    bitmap.close();

    const outputs = [];
    let number = 1;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const piece = document.createElement("canvas");
        piece.width = cell;
        piece.height = cell;
        piece.getContext("2d").drawImage(master, col * cell, row * cell, cell, cell, 0, 0, cell, cell);
        const blob = await canvasToBlob(piece, "image/jpeg", .92);
        outputs.push({ name: `grid-${String(number).padStart(2, "0")}.jpg`, blob });
        number += 1;
      }
    }
    return outputs;
  }

  function drawResized(bitmap, width, height, fill = null, sharpen = false) {
    let source = bitmap;
    let currentWidth = bitmap.width;
    let currentHeight = bitmap.height;
    const isUpscale = width > bitmap.width || height > bitmap.height;

    if (isUpscale) {
      while ((currentWidth < width || currentHeight < height) && (currentWidth !== width || currentHeight !== height)) {
        const nextWidth = currentWidth < width ? Math.min(width, Math.round(currentWidth * 1.5)) : width;
        const nextHeight = currentHeight < height ? Math.min(height, Math.round(currentHeight * 1.5)) : height;
        const nextCanvas = drawToCanvas(source, nextWidth, nextHeight, fill);
        source = nextCanvas;
        currentWidth = nextWidth;
        currentHeight = nextHeight;
      }
    }

    const canvas = currentWidth === width && currentHeight === height && source !== bitmap
      ? source
      : drawToCanvas(source, width, height, fill);

    if (sharpen && width * height <= 12000000) sharpenCanvas(canvas, 0.32);
    return canvas;
  }

  function drawToCanvas(source, width, height, fill = null) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: fill === null });
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, width, height);
    return canvas;
  }

  function sharpenCanvas(canvas, amount) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const original = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const blurredCanvas = document.createElement("canvas");
    blurredCanvas.width = canvas.width;
    blurredCanvas.height = canvas.height;
    const blurredContext = blurredCanvas.getContext("2d", { willReadFrequently: true });
    blurredContext.filter = "blur(0.75px)";
    blurredContext.drawImage(canvas, 0, 0);
    const blurred = blurredContext.getImageData(0, 0, canvas.width, canvas.height).data;
    const pixels = original.data;
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = clampChannel(pixels[index] + (pixels[index] - blurred[index]) * amount);
      pixels[index + 1] = clampChannel(pixels[index + 1] + (pixels[index + 1] - blurred[index + 1]) * amount);
      pixels[index + 2] = clampChannel(pixels[index + 2] + (pixels[index + 2] - blurred[index + 2]) * amount);
    }
    ctx.putImageData(original, 0, 0);
  }

  function clampChannel(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function selectedMime(value, fallback) {
    if (value === "jpg") return "image/jpeg";
    if (value === "png") return "image/png";
    if (value === "webp") return "image/webp";
    return getMime({ type: fallback });
  }

  function getMime(file) {
    return ["image/jpeg", "image/png", "image/webp"].includes(file.type) ? file.type : "image/jpeg";
  }

  function getQuality() {
    return quality ? Math.max(.3, Math.min(1, Number(quality.value) / 100)) : .9;
  }

  function canvasToBlob(canvas, mime, qualityValue) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("blob failed")), mime, qualityValue));
  }

  function outputName(name, mime, suffix) {
    const base = name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "image";
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    if (suffix === "heic") return `${base}.${ext}`;
    return `${base}-${suffix}.${ext}`;
  }

  function makeOutputNamesUnique(outputs) {
    const used = new Map();
    outputs.forEach(item => {
      const key = item.name.toLowerCase();
      const count = used.get(key) || 0;
      used.set(key, count + 1);
      if (!count) return;
      const dot = item.name.lastIndexOf(".");
      const base = dot > 0 ? item.name.slice(0, dot) : item.name;
      const ext = dot > 0 ? item.name.slice(dot) : "";
      item.name = `${base}-${count + 1}${ext}`;
    });
  }

  function isHeic(file) {
    return /^image\/hei(c|f)(-sequence)?$/i.test(file.type || "") || /\.(heic|heif)$/i.test(file.name || "");
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

  function clampDimension(value) {
    return Math.max(1, Math.min(8000, Math.round(value)));
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
    parts.forEach(part => { out.set(part, offset); offset += part.length; });
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
