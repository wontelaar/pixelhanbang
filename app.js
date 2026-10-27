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
  const gridShape = document.querySelector("#gridShape");
  const wmText = document.querySelector("#wmText");
  const wmLogo = document.querySelector("#wmLogo");
  const wmLogoClear = document.querySelector("#wmLogoClear");
  const wmLogoNote = document.querySelector("#wmLogoNote");
  const wmPosition = document.querySelector("#wmPosition");
  const wmSize = document.querySelector("#wmSize");
  const wmSizeValue = document.querySelector("#wmSizeValue");
  const wmOpacity = document.querySelector("#wmOpacity");
  const wmOpacityValue = document.querySelector("#wmOpacityValue");
  const wmColor = document.querySelector("#wmColor");
  const splitDirection = document.querySelector("#splitDirection");
  const splitMode = document.querySelector("#splitMode");
  const splitValue = document.querySelector("#splitValue");
  const splitUnit = document.querySelector("#splitUnit");
  const stitchDirection = document.querySelector("#stitchDirection");
  const stitchSize = document.querySelector("#stitchSize");
  const stitchSizeLabel = document.querySelector("#stitchSizeLabel");
  const stitchGap = document.querySelector("#stitchGap");
  let wmLogoBitmap = null;
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
    target: { button: "목표 용량으로 저장", multiple: true },
    watermark: { button: "워터마크 넣고 저장", multiple: true },
    split: { button: "나눠서 저장", multiple: false },
    stitch: { button: "이어붙여 저장", multiple: true },
    exif: { button: "정보 지우고 저장", multiple: true }
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

  [[wmSize, wmSizeValue, "%"], [wmOpacity, wmOpacityValue, "%"]].forEach(([control, label, unit]) => {
    if (!control || !label) return;
    const update = () => { label.textContent = control.value + unit; };
    control.addEventListener("input", update);
    update();
  });

  if (wmLogo) {
    wmLogo.addEventListener("change", async () => {
      const logo = wmLogo.files[0];
      if (wmLogoBitmap) wmLogoBitmap.close();
      wmLogoBitmap = null;
      if (logo) {
        try {
          wmLogoBitmap = await createImageBitmap(logo);
        } catch {
          wmLogo.value = "";
          setStatus("로고 이미지를 불러오지 못했어요. PNG나 JPG 파일을 선택해 주세요.", "error");
        }
      }
      updateLogoNote();
    });
    wmLogoClear.addEventListener("click", () => {
      if (wmLogoBitmap) wmLogoBitmap.close();
      wmLogoBitmap = null;
      wmLogo.value = "";
      updateLogoNote();
    });
  }

  if (splitMode && splitUnit) {
    splitMode.addEventListener("change", () => {
      splitUnit.textContent = splitMode.value === "pixels" ? "px" : "조각";
      splitValue.value = splitMode.value === "pixels" ? "1500" : "3";
    });
  }

  if (stitchDirection && stitchSizeLabel) {
    stitchDirection.addEventListener("change", () => {
      stitchSizeLabel.textContent = stitchDirection.value === "horizontal" ? "결과 높이" : "결과 가로 폭";
    });
  }

  processButton.addEventListener("click", processFiles);

  function updateLogoNote() {
    if (!wmLogoNote) return;
    wmLogoNote.textContent = wmLogoBitmap
      ? `로고 ${wmLogoBitmap.width} × ${wmLogoBitmap.height} · 문구 대신 로고가 들어가요`
      : "투명 배경 PNG 로고를 쓰면 가장 깔끔해요.";
    wmLogoClear.hidden = !wmLogoBitmap;
  }

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
    if (mode === "grid" || mode === "split") {
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
      const removeButton = row.querySelector(".remove-file");
      removeButton.addEventListener("click", () => {
        files.splice(index, 1);
        renderFiles();
        inspectFirstImage();
        setStatus(files.length ? files.length + "장 선택됨" : "", "");
      });
      if (mode === "stitch") addMoveButtons(row, removeButton, index);
      if (mode === "exif") showMetadata(row, file);
      fileList.appendChild(row);
    });
    processButton.disabled = files.length < minimumFiles();
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
    let extraNotice = "";
    try {
      let outputs;
      let failures = 0;
      if (mode === "watermark" && !wmLogoBitmap && !wmText.value.trim()) {
        setStatus("넣을 문구를 적거나 로고 이미지를 선택해 주세요.", "error");
        return;
      }
      if (mode === "grid") {
        outputs = await processGrid(files[0]);
      } else if (mode === "split") {
        outputs = await processSplit(files[0]);
      } else if (mode === "stitch") {
        if (files.length < 2) {
          setStatus("이어붙일 사진을 두 장 이상 선택해 주세요.", "error");
          return;
        }
        const stitched = await processStitch(files);
        outputs = [stitched];
        extraNotice = ` · ${stitched.width} × ${stitched.height}` + (stitched.reduced ? " · 너무 길어서 전체 크기를 조금 줄였어요" : "");
      } else if (mode === "exif") {
        outputs = [];
        for (let index = 0; index < files.length; index += 1) {
          setStatus(`${index + 1}/${files.length}번째 사진의 정보를 지우고 있어요…`, "");
          try {
            outputs.push(await stripMetadata(files[index]));
          } catch (error) {
            console.error(error);
            failures += 1;
          }
        }
        if (!outputs.length) throw new Error("No files could be cleaned");
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
      setStatus(outputs.length + "개 파일 저장 준비 완료" + comparison + extraNotice + failureNotice, failures ? "error" : "success");
    } catch (error) {
      console.error(error);
      setStatus(error.userMessage || "처리하지 못한 이미지가 있어요. 다른 파일로 다시 시도해 주세요.", "error");
    } finally {
      processButton.disabled = files.length < minimumFiles();
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
    } else if (mode === "watermark") {
      canvas = drawResized(bitmap, bitmap.width, bitmap.height, mime === "image/jpeg" ? "#ffffff" : null);
      drawWatermark(canvas);
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
    const cellHeight = gridShape && gridShape.value === "portrait" ? 1440 : 1080;
    const master = document.createElement("canvas");
    master.width = cell * 3;
    master.height = cellHeight * rows;
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
        piece.height = cellHeight;
        piece.getContext("2d").drawImage(master, col * cell, row * cellHeight, cell, cellHeight, 0, 0, cell, cellHeight);
        const blob = await canvasToBlob(piece, "image/jpeg", .92);
        outputs.push({ name: `grid-${String(number).padStart(2, "0")}.jpg`, blob });
        number += 1;
      }
    }
    return outputs;
  }

  function minimumFiles() {
    return mode === "stitch" ? 2 : 1;
  }

  function userError(message) {
    const error = new Error(message);
    error.userMessage = message;
    return error;
  }

  // 이어붙이기: 목록 순서가 결과 순서라 위·아래로 옮길 수 있게 한다.
  function addMoveButtons(row, removeButton, index) {
    const actions = document.createElement("div");
    actions.className = "file-actions";
    [["↑", "위로 옮기기", -1], ["↓", "아래로 옮기기", 1]].forEach(([label, name, step]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "remove-file file-move";
      button.textContent = label;
      button.setAttribute("aria-label", name);
      const target = index + step;
      button.disabled = target < 0 || target >= files.length;
      button.addEventListener("click", () => {
        [files[index], files[target]] = [files[target], files[index]];
        renderFiles();
      });
      actions.appendChild(button);
    });
    removeButton.replaceWith(actions);
    actions.appendChild(removeButton);
  }

  function showMetadata(row, file) {
    const box = document.createElement("div");
    box.className = "file-exif";
    box.textContent = "사진 정보를 읽고 있어요…";
    row.children[1].appendChild(box);
    readMetadata(file).then(info => {
      box.replaceChildren();
      const lines = [...info.items];
      if (info.gps) lines.unshift(["촬영 위치", `${info.gps.lat.toFixed(5)}, ${info.gps.lon.toFixed(5)}`]);
      if (!lines.length && !info.extras.length) {
        const none = document.createElement("div");
        none.textContent = "담긴 사진 정보가 없어요.";
        box.appendChild(none);
        return;
      }
      lines.forEach(([label, value]) => {
        const line = document.createElement("div");
        if (label === "촬영 위치") line.className = "warn";
        const name = document.createElement("b");
        name.textContent = label + " ";
        line.append(name, value);
        if (label === "촬영 위치") {
          const link = document.createElement("a");
          link.href = `https://www.google.com/maps?q=${info.gps.lat.toFixed(6)},${info.gps.lon.toFixed(6)}`;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = " 지도에서 보기";
          line.appendChild(link);
        }
        box.appendChild(line);
      });
      if (info.extras.length) {
        const line = document.createElement("div");
        const name = document.createElement("b");
        name.textContent = "기타 ";
        line.append(name, info.extras.join(", "));
        box.appendChild(line);
      }
    }).catch(error => {
      console.error(error);
      box.textContent = "사진 정보를 읽지 못했어요.";
    });
  }

  function drawWatermark(canvas) {
    const ctx = canvas.getContext("2d");
    const short = Math.min(canvas.width, canvas.height);
    const ratio = Number(wmSize.value) / 100;
    const margin = Math.round(short * .03);
    let mark;
    if (wmLogoBitmap) {
      const width = Math.max(1, Math.round(short * ratio * 4));
      const height = Math.max(1, Math.round(width * wmLogoBitmap.height / wmLogoBitmap.width));
      mark = document.createElement("canvas");
      mark.width = width;
      mark.height = height;
      const markCtx = mark.getContext("2d");
      markCtx.imageSmoothingQuality = "high";
      markCtx.drawImage(wmLogoBitmap, 0, 0, width, height);
    } else {
      const fontSize = Math.max(8, Math.round(short * ratio));
      const font = `700 ${fontSize}px "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
      const text = wmText.value.trim();
      const measure = document.createElement("canvas").getContext("2d");
      measure.font = font;
      const pad = Math.ceil(fontSize * .3);
      mark = document.createElement("canvas");
      mark.width = Math.max(1, Math.ceil(measure.measureText(text).width) + pad * 2);
      mark.height = Math.ceil(fontSize * 1.3) + pad * 2;
      const markCtx = mark.getContext("2d");
      const dark = wmColor.value === "black";
      markCtx.font = font;
      markCtx.textBaseline = "middle";
      markCtx.fillStyle = dark ? "#111111" : "#ffffff";
      markCtx.shadowColor = dark ? "rgba(255, 255, 255, .55)" : "rgba(0, 0, 0, .5)";
      markCtx.shadowBlur = Math.max(2, fontSize * .12);
      markCtx.fillText(text, pad, mark.height / 2);
    }

    ctx.save();
    ctx.globalAlpha = Number(wmOpacity.value) / 100;
    const position = wmPosition.value;
    if (position === "tile") {
      const stepX = mark.width + short * .12;
      const stepY = mark.height + short * .14;
      const reach = Math.hypot(canvas.width, canvas.height) / 2 + Math.max(stepX, stepY);
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-Math.PI / 6);
      let rowIndex = 0;
      for (let y = -reach; y < reach; y += stepY) {
        const shift = rowIndex % 2 ? stepX / 2 : 0;
        for (let x = -reach - shift; x < reach; x += stepX) ctx.drawImage(mark, x, y);
        rowIndex += 1;
      }
    } else {
      const [vertical, horizontal] = position.split("-");
      const x = horizontal === "left" ? margin : horizontal === "right" ? canvas.width - mark.width - margin : (canvas.width - mark.width) / 2;
      const y = vertical === "top" ? margin : vertical === "bottom" ? canvas.height - mark.height - margin : (canvas.height - mark.height) / 2;
      ctx.drawImage(mark, Math.round(x), Math.round(y));
    }
    ctx.restore();
  }

  async function processSplit(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      const vertical = splitDirection.value !== "horizontal";
      const length = vertical ? bitmap.height : bitmap.width;
      const value = Math.max(1, Math.floor(Number(splitValue.value) || 0));
      const size = Math.max(1, Math.min(length, splitMode.value === "pixels" ? value : Math.ceil(length / value)));
      const count = Math.ceil(length / size);
      if (count > 100) throw userError("조각이 100개를 넘어요. 조각 높이를 더 크게 하거나 개수를 줄여 주세요.");
      const mime = getMime(file);
      const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
      const base = file.name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "image";
      const outputs = [];
      for (let index = 0; index < count; index += 1) {
        const start = index * size;
        const piece = Math.min(size, length - start);
        const canvas = document.createElement("canvas");
        canvas.width = vertical ? bitmap.width : piece;
        canvas.height = vertical ? piece : bitmap.height;
        const ctx = canvas.getContext("2d", { alpha: mime !== "image/jpeg" });
        if (mime === "image/jpeg") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        if (vertical) ctx.drawImage(bitmap, 0, start, bitmap.width, piece, 0, 0, bitmap.width, piece);
        else ctx.drawImage(bitmap, start, 0, piece, bitmap.height, 0, 0, piece, bitmap.height);
        const blob = await canvasToBlob(canvas, mime, .92);
        outputs.push({ name: `${base}-${String(index + 1).padStart(2, "0")}.${ext}`, blob });
      }
      return outputs;
    } finally {
      bitmap.close();
    }
  }

  // 이어붙이기: 모든 사진을 같은 가로 폭(가로로 붙이면 같은 높이)으로 맞춰 순서대로 붙인다.
  async function processStitch(list) {
    const bitmaps = [];
    try {
      for (const file of list) bitmaps.push(await createImageBitmap(file, { imageOrientation: "from-image" }));
      const vertical = stitchDirection.value !== "horizontal";
      let side = clampDimension(Number(stitchSize.value) || (vertical ? bitmaps[0].width : bitmaps[0].height));
      let gap = Math.max(0, Math.min(200, Math.round(Number(stitchGap.value) || 0)));
      const layout = () => bitmaps.map(bitmap => Math.max(1, Math.round(vertical ? bitmap.height * side / bitmap.width : bitmap.width * side / bitmap.height)));
      let lengths = layout();
      let total = lengths.reduce((sum, value) => sum + value, 0) + gap * (bitmaps.length - 1);
      // 브라우저 캔버스 한계를 넘지 않게 긴 쪽 30000픽셀, 전체 1억 픽셀 안으로 줄인다.
      const scale = Math.min(1, 30000 / total, Math.sqrt(100000000 / (total * side)));
      const reduced = scale < 1;
      if (reduced) {
        side = Math.max(1, Math.floor(side * scale));
        gap = Math.round(gap * scale);
        lengths = layout();
        total = lengths.reduce((sum, value) => sum + value, 0) + gap * (bitmaps.length - 1);
      }
      const mime = selectedMime(format.value, "image/jpeg");
      const master = document.createElement("canvas");
      master.width = vertical ? side : total;
      master.height = vertical ? total : side;
      const ctx = master.getContext("2d");
      ctx.fillStyle = background.value || "#ffffff";
      ctx.fillRect(0, 0, master.width, master.height);
      let offset = 0;
      bitmaps.forEach((bitmap, index) => {
        const width = vertical ? side : lengths[index];
        const height = vertical ? lengths[index] : side;
        const piece = drawResized(bitmap, width, height);
        if (vertical) ctx.drawImage(piece, 0, offset);
        else ctx.drawImage(piece, offset, 0);
        offset += lengths[index] + gap;
      });
      const blob = await canvasToBlob(master, mime, .92);
      const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
      return { name: `pixelhanbang-stitch-${dateStamp()}.${ext}`, blob, width: master.width, height: master.height, reduced };
    } finally {
      bitmaps.forEach(bitmap => bitmap.close());
    }
  }

  /* ---------- 사진 정보(EXIF) 읽기·지우기 ---------- */

  async function readMetadata(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = { items: [], gps: null, extras: [], orientation: 1 };
    if (isJpeg(bytes)) {
      jpegSegments(bytes).forEach(segment => {
        if (segment.marker === 0xe1 && startsWith(bytes, segment.start, "Exif\0\0")) parseTiff(bytes, segment.start + 6, info);
        else if (segment.marker === 0xe1 && startsWith(bytes, segment.start, "http://ns.adobe.com/xap/1.0/")) addExtra(info, "XMP 편집 정보");
        else if (segment.marker === 0xed) addExtra(info, "IPTC 정보");
        else if (segment.marker === 0xfe) addExtra(info, "주석");
      });
    } else if (isPng(bytes)) {
      pngChunks(bytes).forEach(chunk => {
        if (chunk.type === "eXIf") parseTiff(bytes, chunk.start, info);
        else if (["tEXt", "iTXt", "zTXt"].includes(chunk.type)) addExtra(info, "텍스트 정보");
        else if (chunk.type === "tIME") addExtra(info, "수정 시각");
      });
    } else if (isWebp(bytes)) {
      webpChunks(bytes).forEach(chunk => {
        if (chunk.type === "EXIF") parseTiff(bytes, chunk.start + (startsWith(bytes, chunk.start, "Exif\0\0") ? 6 : 0), info);
        else if (chunk.type === "XMP ") addExtra(info, "XMP 편집 정보");
      });
    }
    return info;
  }

  function addExtra(info, label) {
    if (!info.extras.includes(label)) info.extras.push(label);
  }

  function startsWith(bytes, offset, text) {
    if (offset + text.length > bytes.length) return false;
    for (let index = 0; index < text.length; index += 1) {
      if (bytes[offset + index] !== text.charCodeAt(index)) return false;
    }
    return true;
  }

  function isJpeg(bytes) { return bytes[0] === 0xff && bytes[1] === 0xd8; }
  function isPng(bytes) { return startsWith(bytes, 1, "PNG\r\n"); }
  function isWebp(bytes) { return startsWith(bytes, 0, "RIFF") && startsWith(bytes, 8, "WEBP"); }

  // JPEG 머리 부분의 세그먼트 목록. SOS(그림 데이터 시작)에서 멈춘다.
  function jpegSegments(bytes) {
    const segments = [];
    let pos = 2;
    while (pos + 4 <= bytes.length && bytes[pos] === 0xff) {
      const marker = bytes[pos + 1];
      if (marker === 0xff) { pos += 1; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { pos += 2; continue; }
      const length = (bytes[pos + 2] << 8) | bytes[pos + 3];
      if (length < 2) break;
      segments.push({ marker, offset: pos, start: pos + 4, end: Math.min(bytes.length, pos + 2 + length) });
      if (marker === 0xda) break;
      pos += 2 + length;
    }
    return segments;
  }

  function pngChunks(bytes) {
    const chunks = [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let pos = 8;
    while (pos + 12 <= bytes.length) {
      const length = view.getUint32(pos);
      const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
      const end = pos + 12 + length;
      if (end > bytes.length) break;
      chunks.push({ type, offset: pos, start: pos + 8, end });
      pos = end;
      if (type === "IEND") break;
    }
    return chunks;
  }

  function webpChunks(bytes) {
    const chunks = [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let pos = 12;
    while (pos + 8 <= bytes.length) {
      const type = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
      const length = view.getUint32(pos + 4, true);
      const end = Math.min(bytes.length, pos + 8 + length + (length % 2));
      chunks.push({ type, offset: pos, start: pos + 8, end });
      pos = end;
    }
    return chunks;
  }

  function parseTiff(bytes, base, info) {
    try {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const little = bytes[base] === 0x49;
      const u16 = offset => view.getUint16(offset, little);
      const u32 = offset => view.getUint32(offset, little);
      const readIfd = offset => {
        const entries = new Map();
        const count = u16(offset);
        for (let index = 0; index < count; index += 1) {
          const entry = offset + 2 + index * 12;
          entries.set(u16(entry), { type: u16(entry + 2), count: u32(entry + 4), at: entry + 8 });
        }
        return entries;
      };
      const ascii = item => {
        if (!item || item.type !== 2) return "";
        const start = item.count <= 4 ? item.at : base + u32(item.at);
        let text = "";
        for (let index = 0; index < item.count && start + index < bytes.length; index += 1) {
          const code = bytes[start + index];
          if (!code) break;
          text += String.fromCharCode(code);
        }
        try { text = decodeURIComponent(escape(text)); } catch { /* 영문 그대로 */ }
        return text.trim();
      };
      const rationals = item => {
        if (!item || item.type !== 5) return [];
        const start = base + u32(item.at);
        const values = [];
        for (let index = 0; index < item.count; index += 1) {
          const denominator = u32(start + index * 8 + 4);
          values.push(denominator ? u32(start + index * 8) / denominator : 0);
        }
        return values;
      };
      const ifd0 = readIfd(base + u32(base + 4));
      const exif = ifd0.has(0x8769) ? readIfd(base + u32(ifd0.get(0x8769).at)) : new Map();
      const orientation = ifd0.get(0x0112);
      if (orientation && orientation.type === 3) info.orientation = u16(orientation.at);
      const device = [ascii(ifd0.get(0x010f)), ascii(ifd0.get(0x0110))].filter(Boolean);
      if (device.length) {
        const model = device[1] && device[0] && device[1].startsWith(device[0]) ? device[1] : device.join(" ");
        info.items.push(["촬영 기기", model]);
      }
      const taken = ascii(exif.get(0x9003)) || ascii(ifd0.get(0x0132));
      if (taken) info.items.push(["촬영 일시", taken.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3")]);
      const lens = ascii(exif.get(0xa434));
      if (lens) info.items.push(["렌즈", lens]);
      const software = ascii(ifd0.get(0x0131));
      if (software) info.items.push(["저장 프로그램", software]);
      const artist = ascii(ifd0.get(0x013b));
      if (artist) info.items.push(["작성자", artist]);
      if (ifd0.has(0x8825)) {
        const gps = readIfd(base + u32(ifd0.get(0x8825).at));
        const toDegrees = values => values.length >= 3 ? values[0] + values[1] / 60 + values[2] / 3600 : NaN;
        let lat = toDegrees(rationals(gps.get(2)));
        let lon = toDegrees(rationals(gps.get(4)));
        if (ascii(gps.get(1)) === "S") lat = -lat;
        if (ascii(gps.get(3)) === "W") lon = -lon;
        if (Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon)) info.gps = { lat, lon };
      }
    } catch (error) {
      console.warn("EXIF parse failed", error);
      addExtra(info, "읽을 수 없는 정보");
    }
  }

  // 그림 데이터는 다시 압축하지 않고, 정보가 담긴 부분만 빼서 화질 손실 없이 저장한다.
  async function stripMetadata(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let cleaned;
    if (isJpeg(bytes)) cleaned = stripJpeg(bytes, (await readMetadata(file)).orientation);
    else if (isPng(bytes)) cleaned = stripPng(bytes, (await readMetadata(file)).orientation);
    else if (isWebp(bytes)) cleaned = stripWebp(bytes);
    else throw new Error("Unsupported format");
    return { name: outputName(file.name, getMime(file), "clean"), blob: new Blob([cleaned], { type: getMime(file) }) };
  }

  function stripJpeg(bytes, orientation) {
    const parts = [bytes.subarray(0, 2)];
    const segments = jpegSegments(bytes);
    let orientationWritten = orientation === 1;
    const writeOrientation = () => {
      if (orientationWritten) return;
      parts.push(orientationSegment(orientation));
      orientationWritten = true;
    };
    for (const segment of segments) {
      const { marker } = segment;
      if (marker === 0xda) {
        writeOrientation();
        parts.push(bytes.subarray(segment.offset, jpegImageEnd(bytes, segment.end)));
        return concat(parts);
      }
      const isApp = marker >= 0xe0 && marker <= 0xef;
      const keepApp = marker === 0xe0 || marker === 0xee || (marker === 0xe2 && startsWith(bytes, segment.start, "ICC_PROFILE\0"));
      if ((isApp && !keepApp) || marker === 0xfe) continue;
      if (marker !== 0xe0) writeOrientation();
      parts.push(bytes.subarray(segment.offset, segment.end));
    }
    throw new Error("JPEG image data not found");
  }

  // SOS 뒤 그림 데이터를 따라가 첫 EOI(FFD9)까지만 남긴다. 뒤에 붙은 보조 이미지와 그 정보는 버린다.
  function jpegImageEnd(bytes, pos) {
    while (pos + 1 < bytes.length) {
      if (bytes[pos] !== 0xff) { pos += 1; continue; }
      const marker = bytes[pos + 1];
      if (marker === 0x00 || marker === 0xff || (marker >= 0xd0 && marker <= 0xd7)) { pos += marker === 0xff ? 1 : 2; continue; }
      if (marker === 0xd9) return pos + 2;
      const length = (bytes[pos + 2] << 8) | bytes[pos + 3];
      pos += 2 + length;
    }
    return bytes.length;
  }

  function orientationSegment(orientation) {
    const segment = new Uint8Array(36);
    const view = new DataView(segment.buffer);
    view.setUint16(0, 0xffe1);
    view.setUint16(2, 34);
    segment.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4);
    segment.set([0x4d, 0x4d, 0x00, 0x2a], 10);
    view.setUint32(14, 8);
    view.setUint16(18, 1);
    view.setUint16(20, 0x0112);
    view.setUint16(22, 3);
    view.setUint32(24, 1);
    view.setUint16(28, orientation);
    view.setUint32(32, 0);
    return segment;
  }

  function stripPng(bytes, orientation) {
    const drop = ["eXIf", "tEXt", "iTXt", "zTXt", "tIME"];
    const parts = [bytes.subarray(0, 8)];
    let last = 8;
    pngChunks(bytes).forEach(chunk => {
      if (!drop.includes(chunk.type)) parts.push(bytes.subarray(chunk.offset, chunk.end));
      // 브라우저는 PNG의 방향 정보도 따르므로, 방향만 담은 eXIf를 IHDR 바로 뒤에 다시 넣는다.
      if (chunk.type === "IHDR" && orientation !== 1) parts.push(pngExifChunk(orientation));
      last = chunk.end;
    });
    // 끝이 잘린 파일이라도 읽지 못한 나머지는 그대로 붙여 그림 데이터를 잃지 않게 한다.
    if (last < bytes.length) parts.push(bytes.subarray(last));
    return concat(parts);
  }

  function pngExifChunk(orientation) {
    const tiff = orientationSegment(orientation).subarray(10);
    const chunk = new Uint8Array(12 + tiff.length);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, tiff.length);
    chunk.set([0x65, 0x58, 0x49, 0x66], 4);
    chunk.set(tiff, 8);
    view.setUint32(8 + tiff.length, crc32(chunk.subarray(4, 8 + tiff.length)));
    return chunk;
  }

  function stripWebp(bytes) {
    const parts = [];
    webpChunks(bytes).forEach(chunk => {
      if (chunk.type === "EXIF" || chunk.type === "XMP ") return;
      const copy = bytes.slice(chunk.offset, chunk.end);
      if (chunk.type === "VP8X") copy[8] &= ~0x0c;
      parts.push(copy);
    });
    const body = concat(parts);
    const out = new Uint8Array(12 + body.length);
    out.set(bytes.subarray(0, 4), 0);
    new DataView(out.buffer).setUint32(4, 4 + body.length, true);
    out.set(bytes.subarray(8, 12), 8);
    out.set(body, 12);
    return out;
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
