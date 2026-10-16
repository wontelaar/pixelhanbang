(() => {
  "use strict";

  const AI_MODULE_URL = "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm";
  const input = document.querySelector("#fileInput");
  const dropzone = document.querySelector("#dropzone");
  const chooseButton = document.querySelector("#chooseButton");
  const fileList = document.querySelector("#fileList");
  const previewWrap = document.querySelector("#logoPreviewWrap");
  const originalCanvas = document.querySelector("#originalCanvas");
  const resultCanvas = document.querySelector("#resultCanvas");
  const backgroundNote = document.querySelector("#backgroundNote");
  const colorMode = document.querySelector("#colorMode");
  const primaryColorGroup = document.querySelector("#primaryColorGroup");
  const primaryColor = document.querySelector("#primaryColor");
  const primaryColorValue = document.querySelector("#primaryColorValue");
  const secondaryColorGroup = document.querySelector("#secondaryColorGroup");
  const secondaryColor = document.querySelector("#secondaryColor");
  const secondaryColorValue = document.querySelector("#secondaryColorValue");
  const detailLevel = document.querySelector("#detailLevel");
  const outputBackground = document.querySelector("#outputBackground");
  const processButton = document.querySelector("#processButton");
  const status = document.querySelector("#status");

  let selectedFile = null;
  let sourceData = null;
  let foregroundData = null;
  let latestResult = null;
  let previewTimer = 0;
  let renderSequence = 0;
  let objectUrl = "";
  let removeBackgroundPromise = null;

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

  colorMode.addEventListener("change", () => {
    const customColors = colorMode.value === "one" || colorMode.value === "two";
    primaryColorGroup.classList.toggle("hidden", !customColors);
    secondaryColorGroup.classList.toggle("hidden", colorMode.value !== "two");
    processButton.textContent = colorMode.value.startsWith("auto") ? "캐릭터 PNG 저장" : "로고 PNG 저장";
    scheduleRender();
  });
  primaryColor.addEventListener("input", () => {
    primaryColorValue.textContent = primaryColor.value.toUpperCase();
    scheduleRender();
  });
  secondaryColor.addEventListener("input", () => {
    secondaryColorValue.textContent = secondaryColor.value.toUpperCase();
    scheduleRender();
  });
  detailLevel.addEventListener("change", scheduleRender);
  outputBackground.addEventListener("change", scheduleRender);
  processButton.addEventListener("click", saveResult);
  window.addEventListener("beforeunload", clearObjectUrl);

  async function selectFile(file) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 25 * 1024 * 1024) {
      setStatus("JPG, PNG, WebP 사진(25MB 이하)을 선택해 주세요.", "error");
      return;
    }

    const selectionSequence = ++renderSequence;
    selectedFile = file;
    sourceData = null;
    foregroundData = null;
    latestResult = null;
    processButton.disabled = true;
    previewWrap.classList.remove("is-visible");
    renderFileRow(file);
    setStatus("사진을 불러오고 있어요…", "");

    try {
      const image = await decodeImage(file);
      if (selectionSequence !== renderSequence) {
        closeImage(image);
        return;
      }
      const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = width;
      sourceCanvas.height = height;
      const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
      sourceContext.imageSmoothingEnabled = true;
      sourceContext.imageSmoothingQuality = "high";
      sourceContext.drawImage(image, 0, 0, width, height);
      closeImage(image);
      sourceData = sourceContext.getImageData(0, 0, width, height);
      originalCanvas.width = width;
      originalCanvas.height = height;
      originalCanvas.getContext("2d").putImageData(sourceData, 0, 0);
      previewWrap.classList.add("is-visible");
      backgroundNote.textContent = "AI가 중심 대상을 찾고 있어요. 처음 한 번은 준비에 시간이 걸릴 수 있어요.";

      const aiInput = await canvasToBlob(sourceCanvas, "image/png");
      const cutoutBlob = await removeSubject(aiInput, selectionSequence);
      if (selectionSequence !== renderSequence) return;
      const cutout = await decodeImage(cutoutBlob);
      if (selectionSequence !== renderSequence) {
        closeImage(cutout);
        return;
      }
      const foregroundCanvas = document.createElement("canvas");
      foregroundCanvas.width = width;
      foregroundCanvas.height = height;
      const foregroundContext = foregroundCanvas.getContext("2d", { willReadFrequently: true });
      foregroundContext.imageSmoothingEnabled = true;
      foregroundContext.imageSmoothingQuality = "high";
      foregroundContext.drawImage(cutout, 0, 0, width, height);
      closeImage(cutout);
      foregroundData = foregroundContext.getImageData(0, 0, width, height);
      backgroundNote.textContent = "AI가 대상을 분리했어요. 배경과 방석 같은 주변 물체는 결과에서 빠집니다.";
      await renderLogo();
    } catch (error) {
      console.error(error);
      if (selectionSequence !== renderSequence) return;
      setStatus("AI가 대상을 분리하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.", "error");
      backgroundNote.textContent = "대상 분리에 실패했어요. 다른 사진으로 다시 시도해 주세요.";
    }
  }

  async function removeSubject(blob, sequence) {
    if (!removeBackgroundPromise) removeBackgroundPromise = import(AI_MODULE_URL).then(module => module.removeBackground || module.default);
    setStatus("AI 처리 기능을 준비하고 있어요…", "");
    const removeBackground = await removeBackgroundPromise;
    if (typeof removeBackground !== "function") throw new Error("AI module unavailable");
    return removeBackground(blob, {
      model: "small",
      proxyToWorker: false,
      output: { format: "image/png", quality: 1 },
      progress: (key, current, total) => {
        if (sequence !== renderSequence) return;
        const percent = total > 0 ? Math.min(100, Math.round(current / total * 100)) : 0;
        setStatus(String(key).startsWith("compute")
          ? "AI가 사진 속 대상을 분리하고 있어요…"
          : `AI 처리 기능 준비 중${percent ? ` ${percent}%` : ""}…`, "");
      }
    });
  }

  function renderFileRow(file) {
    clearObjectUrl();
    objectUrl = URL.createObjectURL(file);
    fileList.innerHTML = `
      <div class="file-row">
        <img class="file-thumb" alt="선택한 사진 미리보기">
        <div><div class="file-name"></div><div class="file-meta">${formatBytes(file.size)}</div></div>
        <button class="remove-file" type="button" aria-label="이 사진 삭제">×</button>
      </div>`;
    fileList.querySelector(".file-thumb").src = objectUrl;
    fileList.querySelector(".file-name").textContent = file.name;
    fileList.querySelector(".remove-file").addEventListener("click", clearSelection);
  }

  function clearSelection() {
    renderSequence += 1;
    selectedFile = null;
    sourceData = null;
    foregroundData = null;
    latestResult = null;
    input.value = "";
    fileList.innerHTML = "";
    previewWrap.classList.remove("is-visible");
    processButton.disabled = true;
    originalCanvas.width = 0;
    originalCanvas.height = 0;
    resultCanvas.width = 0;
    resultCanvas.height = 0;
    clearObjectUrl();
    setStatus("", "");
  }

  function clearObjectUrl() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = "";
  }

  function scheduleRender() {
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(renderLogo, 80);
  }

  async function renderLogo() {
    if (!sourceData || !foregroundData) return;
    const sequence = ++renderSequence;
    processButton.disabled = true;
    setStatus("색을 큼직하고 선명하게 채우고 있어요…", "");
    await nextPaint();
    try {
      const result = makeFlatIllustration(sourceData, foregroundData);
      if (sequence !== renderSequence) return;
      latestResult = result;
      resultCanvas.width = result.canvas.width;
      resultCanvas.height = result.canvas.height;
      resultCanvas.getContext("2d").drawImage(result.canvas, 0, 0);
      processButton.disabled = false;
      setStatus("대상만 남겨 선명한 색면으로 채웠어요.", "success");
    } catch (error) {
      console.error(error);
      if (sequence !== renderSequence) return;
      latestResult = null;
      processButton.disabled = true;
      setStatus(error.message === "NO_FOREGROUND"
        ? "사진에서 대상을 찾지 못했어요. 대상이 더 크게 나온 사진으로 시도해 주세요."
        : "캐릭터 이미지를 만들지 못했어요. 다른 사진으로 다시 시도해 주세요.", "error");
    }
  }

  function makeFlatIllustration(source, foreground) {
    const preset = {
      strong: { scale: .62, maskPasses: 2, colorPasses: 3, componentRatio: .0007, colorRatio: .0012 },
      normal: { scale: .8, maskPasses: 1, colorPasses: 2, componentRatio: .0003, colorRatio: .0006 },
      detail: { scale: 1, maskPasses: 0, colorPasses: 1, componentRatio: .0001, colorRatio: .0002 }
    }[detailLevel.value];
    const width = Math.max(1, Math.round(source.width * preset.scale));
    const height = Math.max(1, Math.round(source.height * preset.scale));
    const colors = scaledImageData(source, width, height, detailLevel.value === "strong" ? .9 : .45);
    const cutout = scaledImageData(foreground, width, height, 0);
    let mask = new Uint8Array(width * height);
    const alphaThreshold = detailLevel.value === "strong" ? 105 : detailLevel.value === "normal" ? 72 : 38;
    for (let point = 0; point < mask.length; point += 1) mask[point] = cutout.data[point * 4 + 3] >= alphaThreshold ? 1 : 0;
    for (let pass = 0; pass < preset.maskPasses; pass += 1) mask = majorityClean(mask, width, height);
    mask = removeSmallComponents(mask, width, height, Math.max(18, Math.round(width * height * preset.componentRatio)));
    mask = fillSmallHoles(mask, width, height, Math.max(24, Math.round(width * height * .003)));
    const box = maskBounds(mask, width, height);
    if (!box || box.count < Math.max(40, width * height * .001)) throw new Error("NO_FOREGROUND");

    let palette;
    let labels;
    if (colorMode.value === "one") {
      palette = [hexToRgb(primaryColor.value)];
      labels = new Uint8Array(mask.length);
    } else if (colorMode.value === "two") {
      palette = [hexToRgb(primaryColor.value), hexToRgb(secondaryColor.value)];
      labels = thresholdLabels(colors.data, mask, otsuThreshold(colors.data, mask));
    } else {
      const count = colorMode.value === "auto3" ? 3 : 5;
      palette = extractPalette(colors.data, mask, count).map(enhanceColor);
      labels = nearestLabels(colors.data, mask, palette);
    }

    for (let pass = 0; pass < preset.colorPasses; pass += 1) labels = smoothLabels(labels, mask, width, height, palette.length);
    if (palette.length > 1) labels = removeSmallColorRegions(labels, mask, width, height, Math.max(10, Math.round(width * height * preset.colorRatio)), palette.length);

    const output = new ImageData(width, height);
    const whiteBackground = outputBackground.value === "white";
    for (let point = 0; point < mask.length; point += 1) {
      const offset = point * 4;
      if (!mask[point]) {
        if (whiteBackground) {
          output.data[offset] = 255;
          output.data[offset + 1] = 255;
          output.data[offset + 2] = 255;
          output.data[offset + 3] = 255;
        }
        continue;
      }
      const selected = palette[labels[point]] || palette[0];
      output.data[offset] = selected.r;
      output.data[offset + 1] = selected.g;
      output.data[offset + 2] = selected.b;
      output.data[offset + 3] = 255;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").putImageData(output, 0, 0);
    return { canvas, box };
  }

  function scaledImageData(imageData, width, height, blur) {
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = imageData.width;
    sourceCanvas.height = imageData.height;
    sourceCanvas.getContext("2d").putImageData(imageData, 0, 0);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    if (blur && "filter" in context) context.filter = `blur(${blur}px)`;
    context.drawImage(sourceCanvas, 0, 0, width, height);
    context.filter = "none";
    return context.getImageData(0, 0, width, height);
  }

  function extractPalette(data, mask, count) {
    const samples = [];
    let foregroundCount = 0;
    for (const value of mask) foregroundCount += value;
    const step = Math.max(1, Math.floor(foregroundCount / 6500));
    let seen = 0;
    for (let point = 0; point < mask.length; point += 1) {
      if (!mask[point]) continue;
      if (seen++ % step) continue;
      const offset = point * 4;
      samples.push({ r: data[offset], g: data[offset + 1], b: data[offset + 2] });
    }
    if (!samples.length) return [{ r: 20, g: 30, b: 48 }];
    const mean = samples.reduce((sum, color) => ({ r: sum.r + color.r, g: sum.g + color.g, b: sum.b + color.b }), { r: 0, g: 0, b: 0 });
    const centers = [{ r: mean.r / samples.length, g: mean.g / samples.length, b: mean.b / samples.length }];
    while (centers.length < count) {
      let farthest = samples[0];
      let farthestDistance = -1;
      for (const sample of samples) {
        const distance = Math.min(...centers.map(center => colorDistance(sample, center)));
        if (distance > farthestDistance) {
          farthestDistance = distance;
          farthest = sample;
        }
      }
      centers.push({ ...farthest });
    }
    for (let iteration = 0; iteration < 8; iteration += 1) {
      const sums = centers.map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
      for (const sample of samples) {
        const index = nearestColor(sample, centers);
        sums[index].r += sample.r;
        sums[index].g += sample.g;
        sums[index].b += sample.b;
        sums[index].n += 1;
      }
      sums.forEach((sum, index) => {
        if (sum.n) centers[index] = { r: sum.r / sum.n, g: sum.g / sum.n, b: sum.b / sum.n };
      });
    }
    return centers;
  }

  function nearestLabels(data, mask, palette) {
    const labels = new Uint8Array(mask.length);
    for (let point = 0; point < mask.length; point += 1) {
      if (!mask[point]) continue;
      const offset = point * 4;
      labels[point] = nearestColor({ r: data[offset], g: data[offset + 1], b: data[offset + 2] }, palette);
    }
    return labels;
  }

  function thresholdLabels(data, mask, threshold) {
    const labels = new Uint8Array(mask.length);
    for (let point = 0; point < mask.length; point += 1) {
      if (!mask[point]) continue;
      const offset = point * 4;
      const luminance = data[offset] * .2126 + data[offset + 1] * .7152 + data[offset + 2] * .0722;
      labels[point] = luminance >= threshold ? 1 : 0;
    }
    return labels;
  }

  function smoothLabels(labels, mask, width, height, count) {
    const result = new Uint8Array(labels);
    const votes = new Uint8Array(count);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const point = y * width + x;
        if (!mask[point]) continue;
        votes.fill(0);
        for (let yy = -1; yy <= 1; yy += 1) {
          for (let xx = -1; xx <= 1; xx += 1) {
            const neighbor = (y + yy) * width + x + xx;
            if (mask[neighbor]) votes[labels[neighbor]] += 1;
          }
        }
        let best = labels[point];
        for (let index = 0; index < count; index += 1) if (votes[index] > votes[best]) best = index;
        if (votes[best] >= 5) result[point] = best;
      }
    }
    return result;
  }

  function removeSmallColorRegions(labels, mask, width, height, minimum, colorCount) {
    const visited = new Uint8Array(mask.length);
    const queue = new Int32Array(mask.length);
    const replacementVotes = new Uint32Array(colorCount);
    for (let origin = 0; origin < mask.length; origin += 1) {
      if (!mask[origin] || visited[origin]) continue;
      const originalLabel = labels[origin];
      let start = 0;
      let end = 0;
      visited[origin] = 1;
      queue[end++] = origin;
      replacementVotes.fill(0);
      while (start < end) {
        const point = queue[start++];
        const x = point % width;
        const y = Math.floor(point / width);
        inspect(point - 1, x > 0);
        inspect(point + 1, x + 1 < width);
        inspect(point - width, y > 0);
        inspect(point + width, y + 1 < height);
      }
      if (end < minimum) {
        let replacement = originalLabel;
        for (let index = 0; index < colorCount; index += 1) if (index !== originalLabel && replacementVotes[index] > replacementVotes[replacement]) replacement = index;
        if (replacement !== originalLabel) for (let index = 0; index < end; index += 1) labels[queue[index]] = replacement;
      }
      function inspect(point, allowed) {
        if (!allowed || !mask[point]) return;
        if (labels[point] === originalLabel) {
          if (!visited[point]) {
            visited[point] = 1;
            queue[end++] = point;
          }
        } else {
          replacementVotes[labels[point]] += 1;
        }
      }
    }
    return labels;
  }

  function majorityClean(mask, width, height) {
    const clean = new Uint8Array(mask);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        let count = 0;
        for (let yy = -1; yy <= 1; yy += 1) for (let xx = -1; xx <= 1; xx += 1) count += mask[(y + yy) * width + x + xx];
        const point = y * width + x;
        if (mask[point] && count <= 3) clean[point] = 0;
        else if (!mask[point] && count >= 6) clean[point] = 1;
      }
    }
    return clean;
  }

  function removeSmallComponents(mask, width, height, minimum) {
    const visited = new Uint8Array(mask.length);
    const queue = new Int32Array(mask.length);
    for (let origin = 0; origin < mask.length; origin += 1) {
      if (!mask[origin] || visited[origin]) continue;
      let start = 0;
      let end = 0;
      visited[origin] = 1;
      queue[end++] = origin;
      while (start < end) {
        const point = queue[start++];
        const x = point % width;
        const y = Math.floor(point / width);
        visit(point - 1, x > 0);
        visit(point + 1, x + 1 < width);
        visit(point - width, y > 0);
        visit(point + width, y + 1 < height);
      }
      if (end < minimum) for (let index = 0; index < end; index += 1) mask[queue[index]] = 0;
      function visit(point, allowed) {
        if (!allowed || visited[point] || !mask[point]) return;
        visited[point] = 1;
        queue[end++] = point;
      }
    }
    return mask;
  }

  function fillSmallHoles(mask, width, height, maximum) {
    const visited = new Uint8Array(mask.length);
    const queue = new Int32Array(mask.length);
    for (let origin = 0; origin < mask.length; origin += 1) {
      if (mask[origin] || visited[origin]) continue;
      let start = 0;
      let end = 0;
      let touchesEdge = false;
      visited[origin] = 1;
      queue[end++] = origin;
      while (start < end) {
        const point = queue[start++];
        const x = point % width;
        const y = Math.floor(point / width);
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;
        visit(point - 1, x > 0);
        visit(point + 1, x + 1 < width);
        visit(point - width, y > 0);
        visit(point + width, y + 1 < height);
      }
      if (!touchesEdge && end <= maximum) for (let index = 0; index < end; index += 1) mask[queue[index]] = 1;
      function visit(point, allowed) {
        if (!allowed || visited[point] || mask[point]) return;
        visited[point] = 1;
        queue[end++] = point;
      }
    }
    return mask;
  }

  function maskBounds(mask, width, height) {
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;
    let count = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!mask[y * width + x]) continue;
        count += 1;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    return right < left ? null : { left, top, right, bottom, count };
  }

  function otsuThreshold(data, mask) {
    const histogram = new Uint32Array(256);
    let total = 0;
    let sum = 0;
    for (let point = 0; point < mask.length; point += 1) {
      if (!mask[point]) continue;
      const offset = point * 4;
      const value = Math.round(data[offset] * .2126 + data[offset + 1] * .7152 + data[offset + 2] * .0722);
      histogram[value] += 1;
      sum += value;
      total += 1;
    }
    let backgroundWeight = 0;
    let backgroundSum = 0;
    let bestVariance = -1;
    let best = 128;
    for (let value = 0; value < 256; value += 1) {
      backgroundWeight += histogram[value];
      if (!backgroundWeight) continue;
      const foregroundWeight = total - backgroundWeight;
      if (!foregroundWeight) break;
      backgroundSum += value * histogram[value];
      const backgroundMean = backgroundSum / backgroundWeight;
      const foregroundMean = (sum - backgroundSum) / foregroundWeight;
      const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
      if (variance > bestVariance) {
        bestVariance = variance;
        best = value;
      }
    }
    return best;
  }

  function nearestColor(color, palette) {
    let best = 0;
    let bestDistance = Infinity;
    palette.forEach((candidate, index) => {
      const distance = colorDistance(color, candidate);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  }

  function colorDistance(a, b) {
    const redMean = (a.r + b.r) / 2;
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    return (2 + redMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - redMean) / 256) * db * db;
  }

  function enhanceColor(color) {
    const maximum = Math.max(color.r, color.g, color.b);
    const minimum = Math.min(color.r, color.g, color.b);
    const center = (maximum + minimum) / 2;
    return {
      r: clamp((center + (color.r - center) * 1.14 - 128) * 1.08 + 128),
      g: clamp((center + (color.g - center) * 1.14 - 128) * 1.08 + 128),
      b: clamp((center + (color.b - center) * 1.14 - 128) * 1.08 + 128)
    };
  }

  function clamp(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function saveResult() {
    if (!latestResult || !selectedFile) return;
    const { canvas, box } = latestResult;
    const subjectWidth = box.right - box.left + 1;
    const subjectHeight = box.bottom - box.top + 1;
    const padding = Math.max(8, Math.round(Math.max(subjectWidth, subjectHeight) * .05));
    const sourceLeft = Math.max(0, box.left - padding);
    const sourceTop = Math.max(0, box.top - padding);
    const sourceRight = Math.min(canvas.width - 1, box.right + padding);
    const sourceBottom = Math.min(canvas.height - 1, box.bottom + padding);
    const width = sourceRight - sourceLeft + 1;
    const height = sourceBottom - sourceTop + 1;
    const output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    const context = output.getContext("2d");
    if (outputBackground.value === "white") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(canvas, sourceLeft, sourceTop, width, height, 0, 0, width, height);
    output.toBlob(blob => {
      if (!blob) {
        setStatus("PNG 파일을 만들지 못했어요. 다시 시도해 주세요.", "error");
        return;
      }
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = `${baseName(selectedFile.name)}-${colorMode.value.startsWith("auto") ? "character" : "logo"}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("PNG 파일을 저장했어요.", "success");
    }, "image/png");
  }

  function canvasToBlob(canvas, type) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Canvas encode failed")), type));
  }

  async function decodeImage(file) {
    if ("createImageBitmap" in window) {
      try {
        return await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch (error) {
        console.warn("createImageBitmap failed; using Image fallback", error);
      }
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Image decode failed"));
      };
      image.src = url;
    });
  }

  function closeImage(image) {
    if (typeof image.close === "function") image.close();
  }

  function hexToRgb(hex) {
    const value = Number.parseInt(hex.slice(1), 16);
    return { r: value >> 16, g: value >> 8 & 255, b: value & 255 };
  }

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  }

  function baseName(name) {
    return name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "-") || "pixelhanbang";
  }

  function setStatus(message, type) {
    status.textContent = message;
    status.className = `status${type ? ` ${type}` : ""}`;
  }

  function nextPaint() {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }
})();
