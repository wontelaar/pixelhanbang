(() => {
  "use strict";

  const PREVIEW_WIDTH = 540;
  const PREVIEW_HEIGHT = 960;
  const OUTPUT_WIDTH = 1080;
  const OUTPUT_HEIGHT = 1920;
  const input = document.querySelector("#fileInput");
  const dropzone = document.querySelector("#dropzone");
  const chooseButton = document.querySelector("#chooseButton");
  const fileList = document.querySelector("#fileList");
  const editorWrap = document.querySelector("#thumbnailEditorWrap");
  const video = document.querySelector("#sourceVideo");
  const timeline = document.querySelector("#timeline");
  const currentTime = document.querySelector("#currentTime");
  const durationTime = document.querySelector("#durationTime");
  const backButton = document.querySelector("#backButton");
  const forwardButton = document.querySelector("#forwardButton");
  const stage = document.querySelector("#thumbnailStage");
  const canvas = document.querySelector("#thumbnailCanvas");
  const zoom = document.querySelector("#zoom");
  const zoomValue = document.querySelector("#zoomValue");
  const resetButton = document.querySelector("#resetButton");
  const processButton = document.querySelector("#processButton");
  const status = document.querySelector("#status");
  let file = null;
  let objectUrl = "";
  let baseScale = 1;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;
  let pointerX = 0;
  let pointerY = 0;
  let seekTimer = 0;
  let frameRequest = 0;

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

  timeline.addEventListener("input", () => {
    currentTime.textContent = formatTime(Number(timeline.value));
    window.clearTimeout(seekTimer);
    seekTimer = window.setTimeout(() => seekTo(Number(timeline.value)), 45);
  });
  timeline.addEventListener("change", () => seekTo(Number(timeline.value)));
  backButton.addEventListener("click", () => seekTo(video.currentTime - 0.1));
  forwardButton.addEventListener("click", () => seekTo(video.currentTime + 0.1));
  video.addEventListener("timeupdate", updateTimeUI);
  video.addEventListener("seeked", () => {
    updateTimeUI();
    drawEditor();
  });
  video.addEventListener("loadeddata", drawEditor);
  video.addEventListener("play", startFrameUpdates);
  video.addEventListener("pause", drawEditor);
  video.addEventListener("ended", drawEditor);
  zoom.addEventListener("input", changeZoom);
  resetButton.addEventListener("click", resetPosition);
  processButton.addEventListener("click", saveThumbnail);

  stage.addEventListener("pointerdown", event => {
    if (!file) return;
    dragging = true;
    pointerX = event.clientX;
    pointerY = event.clientY;
    stage.setPointerCapture(event.pointerId);
    stage.classList.add("is-dragging");
  });
  stage.addEventListener("pointermove", event => {
    if (!dragging || !file) return;
    const rect = stage.getBoundingClientRect();
    const factor = PREVIEW_WIDTH / rect.width;
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
    if (!file || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
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
    const looksLikeVideo = candidate && (candidate.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|ogv)$/i.test(candidate.name));
    if (!looksLikeVideo) {
      setStatus("동영상 파일 한 개를 선택해 주세요.", "error");
      return;
    }
    clearCurrentFile();
    setStatus("동영상을 불러오고 있어요…", "");
    file = candidate;
    objectUrl = URL.createObjectURL(candidate);
    video.src = objectUrl;
    video.load();
    try {
      await waitForMedia("loadedmetadata", 20000);
      await waitForMedia("loadeddata", 30000);
      if (!Number.isFinite(video.duration) || !video.videoWidth || !video.videoHeight) {
        throw new Error("Video metadata unavailable");
      }
      renderFile();
      timeline.max = String(video.duration);
      timeline.value = "0";
      durationTime.textContent = formatTime(video.duration);
      currentTime.textContent = formatTime(0);
      baseScale = Math.max(PREVIEW_WIDTH / video.videoWidth, PREVIEW_HEIGHT / video.videoHeight);
      zoom.value = "100";
      zoomValue.textContent = "100%";
      scale = baseScale;
      centerPosition();
      editorWrap.classList.add("is-visible");
      setControlsDisabled(false);
      drawEditor();
      setStatus("시간 막대를 움직여 원하는 장면을 골라 주세요.", "");
    } catch (error) {
      console.error(error);
      setStatus("이 동영상을 재생하지 못했어요. 브라우저에서 재생 가능한 다른 영상으로 다시 시도해 주세요.", "error");
      setControlsDisabled(true);
    }
  }

  function waitForMedia(eventName, timeoutMs) {
    const ready = eventName === "loadedmetadata" ? video.readyState >= 1 : video.readyState >= 2;
    if (ready) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => finish(new Error("Video load timeout")), timeoutMs);
      const onReady = () => finish();
      const onError = () => finish(new Error("Video load failed"));
      function finish(error) {
        window.clearTimeout(timer);
        video.removeEventListener(eventName, onReady);
        video.removeEventListener("error", onError);
        error ? reject(error) : resolve();
      }
      video.addEventListener(eventName, onReady, { once: true });
      video.addEventListener("error", onError, { once: true });
    });
  }

  function renderFile() {
    fileList.innerHTML = "";
    const row = document.createElement("div");
    row.className = "file-row";
    row.innerHTML = `
      <div class="file-thumb file-thumb-placeholder" aria-hidden="true">VIDEO</div>
      <div><div class="file-name"></div><div class="file-meta">${formatBytes(file.size)} · ${video.videoWidth} × ${video.videoHeight}</div></div>
      <button class="remove-file" type="button" aria-label="이 동영상 삭제">×</button>
    `;
    row.querySelector(".file-name").textContent = file.name;
    row.querySelector(".remove-file").addEventListener("click", clearCurrentFile);
    fileList.appendChild(row);
  }

  function clearCurrentFile() {
    window.clearTimeout(seekTimer);
    if (frameRequest && typeof video.cancelVideoFrameCallback === "function") video.cancelVideoFrameCallback(frameRequest);
    frameRequest = 0;
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = "";
    file = null;
    fileList.innerHTML = "";
    editorWrap.classList.remove("is-visible");
    setControlsDisabled(true);
    canvas.getContext("2d").clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    setStatus("", "");
    input.value = "";
  }

  function setControlsDisabled(disabled) {
    timeline.disabled = disabled;
    backButton.disabled = disabled;
    forwardButton.disabled = disabled;
    zoom.disabled = disabled;
    resetButton.disabled = disabled;
    processButton.disabled = disabled;
  }

  function seekTo(seconds) {
    if (!file || !Number.isFinite(video.duration)) return;
    video.pause();
    const safeTime = Math.min(Math.max(0, seconds), video.duration);
    if (Math.abs(video.currentTime - safeTime) < 0.005) {
      updateTimeUI();
      drawEditor();
      return;
    }
    video.currentTime = safeTime;
  }

  function updateTimeUI() {
    if (!file || !Number.isFinite(video.duration)) return;
    timeline.value = String(video.currentTime);
    currentTime.textContent = formatTime(video.currentTime);
  }

  function startFrameUpdates() {
    if (!file) return;
    const update = () => {
      if (video.paused || video.ended || !file) return;
      updateTimeUI();
      drawEditor();
      if (typeof video.requestVideoFrameCallback === "function") {
        frameRequest = video.requestVideoFrameCallback(update);
      } else {
        frameRequest = window.requestAnimationFrame(update);
      }
    };
    update();
  }

  function changeZoom() {
    if (!file) return;
    const oldScale = scale;
    const sourceCenterX = (PREVIEW_WIDTH / 2 - offsetX) / oldScale;
    const sourceCenterY = (PREVIEW_HEIGHT / 2 - offsetY) / oldScale;
    scale = baseScale * Number(zoom.value) / 100;
    offsetX = PREVIEW_WIDTH / 2 - sourceCenterX * scale;
    offsetY = PREVIEW_HEIGHT / 2 - sourceCenterY * scale;
    zoomValue.textContent = zoom.value + "%";
    clampPosition();
    drawEditor();
  }

  function resetPosition() {
    if (!file) return;
    zoom.value = "100";
    zoomValue.textContent = "100%";
    scale = baseScale;
    centerPosition();
    drawEditor();
  }

  function centerPosition() {
    offsetX = (PREVIEW_WIDTH - video.videoWidth * scale) / 2;
    offsetY = (PREVIEW_HEIGHT - video.videoHeight * scale) / 2;
    clampPosition();
  }

  function clampPosition() {
    const width = video.videoWidth * scale;
    const height = video.videoHeight * scale;
    offsetX = width <= PREVIEW_WIDTH ? (PREVIEW_WIDTH - width) / 2 : Math.min(0, Math.max(PREVIEW_WIDTH - width, offsetX));
    offsetY = height <= PREVIEW_HEIGHT ? (PREVIEW_HEIGHT - height) / 2 : Math.min(0, Math.max(PREVIEW_HEIGHT - height, offsetY));
  }

  function drawEditor() {
    if (!file || video.readyState < 2) return;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, offsetX, offsetY, video.videoWidth * scale, video.videoHeight * scale);
  }

  async function saveThumbnail() {
    if (!file || video.readyState < 2) return;
    processButton.disabled = true;
    setStatus("선택한 장면을 저장하고 있어요…", "");
    try {
      video.pause();
      drawEditor();
      const result = document.createElement("canvas");
      result.width = OUTPUT_WIDTH;
      result.height = OUTPUT_HEIGHT;
      const ctx = result.getContext("2d");
      ctx.fillStyle = "#0b1220";
      ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      const factor = OUTPUT_WIDTH / PREVIEW_WIDTH;
      ctx.drawImage(video, offsetX * factor, offsetY * factor, video.videoWidth * scale * factor, video.videoHeight * scale * factor);
      const blob = await canvasToBlob(result);
      downloadBlob(blob, outputName(file.name));
      setStatus(`${formatTime(video.currentTime)} 장면을 JPG로 저장했어요.`, "success");
    } catch (error) {
      console.error(error);
      setStatus("썸네일을 저장하지 못했어요. 다른 장면이나 영상으로 다시 시도해 주세요.", "error");
    } finally {
      processButton.disabled = false;
    }
  }

  function canvasToBlob(value) {
    return new Promise((resolve, reject) => value.toBlob(blob => blob ? resolve(blob) : reject(new Error("JPG save failed")), "image/jpeg", 0.92));
  }

  function outputName(name) {
    const base = name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "shorts";
    const second = Math.max(0, Math.round(video.currentTime * 10) / 10).toFixed(1).replace(".", "-");
    return `${base}-thumbnail-${second}s.jpg`;
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

  function formatTime(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const secs = Math.floor(safe % 60);
    const hundredths = Math.floor((safe % 1) * 100);
    const body = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
    return hours ? `${String(hours).padStart(2, "0")}:${body}` : body;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }

  function setStatus(message, kind) {
    status.textContent = message;
    status.className = "status" + (kind ? " " + kind : "");
  }

  window.addEventListener("beforeunload", () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  });
})();
