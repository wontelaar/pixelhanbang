(() => {
  "use strict";

  const MAX_FILES = 30;
  const MAX_STEP = 5;
  const PREVIEW_LONG = 1080;
  // 한 단계마다 감마를 이만큼 곱한다. 밝게(+)는 감마가 1보다 작아지고 어둡게(−)는 커진다.
  // 더하기 방식과 달리 흰 배경·하늘처럼 이미 밝은 곳은 하얗게 날아가지 않고 중간 톤 위주로 바뀐다.
  const GAMMA_PER_STEP = 0.88;
  const input = document.querySelector("#fileInput");
  const dropzone = document.querySelector("#dropzone");
  const chooseButton = document.querySelector("#chooseButton");
  const fileList = document.querySelector("#fileList");
  const previewWrap = document.querySelector("#previewWrap");
  const previewCanvas = document.querySelector("#previewCanvas");
  const previewName = document.querySelector("#previewName");
  const compareButton = document.querySelector("#compareButton");
  const stepInput = document.querySelector("#step");
  const stepValue = document.querySelector("#stepValue");
  const darkerButton = document.querySelector("#darkerButton");
  const brighterButton = document.querySelector("#brighterButton");
  const resetButton = document.querySelector("#resetButton");
  const format = document.querySelector("#format");
  const processButton = document.querySelector("#processButton");
  const status = document.querySelector("#status");
  const controls = [stepInput, darkerButton, brighterButton, resetButton, compareButton];
  let files = [];
  let selectedIndex = 0;
  let previewSource = null;
  let previewToken = 0;
  let step = 0;
  let comparing = false;

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
  input.addEventListener("change", () => {
    addFiles([...input.files]);
    input.value = "";
  });
  ["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => {
    event.preventDefault();
    dropzone.classList.add("is-over");
  }));
  ["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => {
    event.preventDefault();
    dropzone.classList.remove("is-over");
  }));
  dropzone.addEventListener("drop", event => addFiles([...event.dataTransfer.files]));

  stepInput.addEventListener("input", () => setStep(Number(stepInput.value)));
  darkerButton.addEventListener("click", () => setStep(step - 1));
  brighterButton.addEventListener("click", () => setStep(step + 1));
  resetButton.addEventListener("click", () => setStep(0));
  processButton.addEventListener("click", processFiles);

  // 누르고 있는 동안만 원본을 보여 준다.
  ["pointerdown", "keydown"].forEach(type => compareButton.addEventListener(type, event => {
    if (type === "keydown" && event.key !== " " && event.key !== "Enter") return;
    comparing = true;
    drawPreview();
  }));
  ["pointerup", "pointerleave", "pointercancel", "keyup", "blur"].forEach(type => compareButton.addEventListener(type, () => {
    if (!comparing) return;
    comparing = false;
    drawPreview();
  }));

  function addFiles(incoming) {
    const valid = incoming.filter(file => /^image\/(jpeg|png|webp)$/.test(file.type) && file.size <= 25 * 1024 * 1024);
    if (!valid.length) {
      setStatus("JPG, PNG, WebP 이미지(장당 25MB 이하)를 선택해 주세요.", "error");
      return;
    }
    const combined = [...files, ...valid];
    const unique = new Map(combined.map(file => [file.name + file.size + file.lastModified, file]));
    const wasEmpty = files.length === 0;
    files = [...unique.values()].slice(0, MAX_FILES);
    if (wasEmpty) selectedIndex = 0;
    renderFiles();
    loadPreview();
    const limitNotice = combined.length > MAX_FILES ? ` · 한 번에 최대 ${MAX_FILES}장까지 가능해요` : "";
    setStatus(`${files.length}장 선택됨 · 단계를 고르면 모든 사진에 똑같이 적용돼요` + limitNotice, "");
  }

  function renderFiles() {
    fileList.querySelectorAll("[data-object-url]").forEach(node => URL.revokeObjectURL(node.dataset.objectUrl));
    fileList.replaceChildren();
    fileList.classList.toggle("is-selectable", files.length > 1);
    files.forEach((file, index) => {
      const row = document.createElement("div");
      row.className = "file-row" + (index === selectedIndex ? " is-selected" : "");
      const thumb = document.createElement("img");
      thumb.className = "file-thumb";
      thumb.alt = "";
      const url = URL.createObjectURL(file);
      row.dataset.objectUrl = url;
      thumb.src = url;
      const info = document.createElement("div");
      const name = document.createElement("div");
      name.className = "file-name";
      name.textContent = file.name;
      const meta = document.createElement("div");
      meta.className = "file-meta";
      meta.textContent = formatBytes(file.size) + (index === selectedIndex && files.length > 1 ? " · 미리보는 중" : "");
      info.append(name, meta);
      const remove = document.createElement("button");
      remove.className = "remove-file";
      remove.type = "button";
      remove.setAttribute("aria-label", "이 이미지 삭제");
      remove.textContent = "×";
      remove.addEventListener("click", event => {
        event.stopPropagation();
        files.splice(index, 1);
        if (selectedIndex >= files.length) selectedIndex = Math.max(0, files.length - 1);
        else if (index < selectedIndex) selectedIndex -= 1;
        renderFiles();
        loadPreview();
        setStatus(files.length ? files.length + "장 선택됨" : "", "");
      });
      row.addEventListener("click", () => {
        if (index === selectedIndex) return;
        selectedIndex = index;
        renderFiles();
        loadPreview();
      });
      row.append(thumb, info, remove);
      fileList.appendChild(row);
    });
    const hasFiles = files.length > 0;
    controls.forEach(control => { control.disabled = !hasFiles; });
    processButton.disabled = !hasFiles;
    processButton.textContent = files.length > 1 ? `${files.length}장 밝기 맞춰 저장` : "밝기 맞춰 저장";
    previewWrap.classList.toggle("is-visible", hasFiles);
    updateStepButtons();
  }

  // 미리보기는 화면에 맞게 줄인 사진으로 그려서 단계를 바꿀 때 바로 반응하게 한다.
  async function loadPreview() {
    const token = ++previewToken;
    if (!files.length) {
      previewSource = null;
      return;
    }
    const file = files[selectedIndex];
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      if (token !== previewToken) {
        bitmap.close();
        return;
      }
      const scale = Math.min(1, PREVIEW_LONG / Math.max(bitmap.width, bitmap.height));
      const source = document.createElement("canvas");
      source.width = Math.max(1, Math.round(bitmap.width * scale));
      source.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = source.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, source.width, source.height);
      bitmap.close();
      previewSource = { canvas: source, pixels: ctx.getImageData(0, 0, source.width, source.height) };
      previewName.textContent = file.name;
      drawPreview();
    } catch (error) {
      console.error(error);
      setStatus("이 사진을 불러오지 못했어요. 다른 사진으로 다시 시도해 주세요.", "error");
    }
  }

  function drawPreview() {
    if (!previewSource) return;
    const { pixels } = previewSource;
    previewCanvas.width = pixels.width;
    previewCanvas.height = pixels.height;
    const ctx = previewCanvas.getContext("2d");
    if (comparing || step === 0) {
      ctx.putImageData(pixels, 0, 0);
      return;
    }
    const adjusted = new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height);
    applyCurve(adjusted.data, curveFor(step));
    ctx.putImageData(adjusted, 0, 0);
  }

  function setStep(value) {
    step = Math.max(-MAX_STEP, Math.min(MAX_STEP, Math.round(value)));
    stepInput.value = String(step);
    updateStepButtons();
    drawPreview();
  }

  function updateStepButtons() {
    stepValue.textContent = step === 0 ? "원본" : step > 0 ? `밝게 ${step}단계` : `어둡게 ${-step}단계`;
    if (!files.length) return;
    darkerButton.disabled = step <= -MAX_STEP;
    brighterButton.disabled = step >= MAX_STEP;
  }

  function curveFor(value) {
    const gamma = Math.pow(GAMMA_PER_STEP, value);
    const table = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i += 1) table[i] = Math.round(255 * Math.pow(i / 255, gamma));
    return table;
  }

  // 투명도(알파)는 그대로 두고 빨강·초록·파랑에만 같은 곡선을 적용해 색감이 틀어지지 않게 한다.
  function applyCurve(data, table) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = table[data[i]];
      data[i + 1] = table[data[i + 1]];
      data[i + 2] = table[data[i + 2]];
    }
  }

  async function makeOne(file, table) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const mime = outputMime(file);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (mime === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    if (table) {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      applyCurve(pixels.data, table);
      ctx.putImageData(pixels, 0, 0);
    }
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("save failed")), mime, .92));
    canvas.width = 0;
    canvas.height = 0;
    return { blob, name: outputName(file.name, mime) };
  }

  if (window.PixelHandoff) {
    window.PixelHandoff.mount(status, async () => files.length ? makeOne(files[selectedIndex], step ? curveFor(step) : null) : null);
  }

  async function processFiles() {
    if (!files.length) return;
    processButton.disabled = true;
    const table = step ? curveFor(step) : null;
    const outputs = [];
    let failures = 0;
    try {
      for (let index = 0; index < files.length; index += 1) {
        setStatus(`${index + 1}/${files.length}번째 사진의 밝기를 맞추고 있어요…`, "");
        try {
          outputs.push(await makeOne(files[index], table));
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
        downloadBlob(await createZip(outputs), `pixelhanbang-brightness-${dateStamp()}.zip`);
      }
      const failureNotice = failures ? ` · ${failures}장은 처리하지 못했어요` : "";
      setStatus(`${outputs.length}개 파일 저장 준비 완료 · ${stepValue.textContent}` + failureNotice, failures ? "error" : "success");
    } catch (error) {
      console.error(error);
      setStatus("처리하지 못했어요. 사진 수를 줄여 다시 시도해 주세요.", "error");
    } finally {
      processButton.disabled = false;
    }
  }

  // 원래 형식을 따르되, 사용자가 형식을 고르면 그 형식으로 저장한다.
  function outputMime(file) {
    if (format.value === "png") return "image/png";
    if (format.value === "webp") return "image/webp";
    if (format.value === "jpg") return "image/jpeg";
    return file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg";
  }

  function outputName(name, mime) {
    const base = name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "image";
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const suffix = step > 0 ? `bright${step}` : step < 0 ? `dark${-step}` : "copy";
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
      item.name = `${item.name.slice(0, dot)}-${count + 1}${item.name.slice(dot)}`;
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
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
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

  // 압축하지 않고(저장 방식) 묶는 ZIP. 사진은 이미 압축된 형식이라 따로 압축해도 거의 줄지 않는다.
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
