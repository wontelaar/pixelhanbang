// 옷걸이 찾기와 AI로 채우기. hanger-remove.js, remove-bg.js가 함께 쓴다.
(() => {
  "use strict";

  const ORT_URL = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.js";
  const ORT_WASM = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/";
  const MODEL_URL = "models/migan_pipeline_v2.onnx";
  const INPAINT_LIMIT = 2048;
  let sessionPromise = null;

  // 사진 위쪽 가운데에서 시작해 이어진 어두운 부분(검은 옷걸이)을 찾는다.
  // 큰 사진은 줄인 사본에서 찾고 원래 크기로 늘린다. 1이 옷걸이다. 못 찾으면 null.
  function findHanger(data, width, height) {
    const scale = Math.min(1, 800 / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const light = new Float32Array(w * h);
    const chroma = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const index = Math.min(height - 1, Math.floor(y / scale)) * width + Math.min(width - 1, Math.floor(x / scale));
        const r = data[index * 4], g = data[index * 4 + 1], b = data[index * 4 + 2];
        light[y * w + x] = (r + g + b) / 3;
        chroma[y * w + x] = Math.max(r, g, b) - Math.min(r, g, b);
      }
    }
    // 위쪽 끝 줄들의 밝기로 벽 밝기를 어림잡고, 그보다 확실히 어두운 무채색을 옷걸이 후보로 본다.
    const top = [];
    for (let y = 0; y < Math.max(2, Math.round(h * .04)); y += 1) for (let x = 0; x < w; x += 1) top.push(light[y * w + x]);
    top.sort((a, b) => a - b);
    const wall = top[Math.floor(top.length / 2)];
    for (const limit of [Math.min(90, wall * .5), Math.min(55, wall * .35)]) {
      const mask = grow(light, chroma, w, h, limit);
      if (!mask) continue;
      let area = 0, lowest = 0;
      for (let index = 0; index < mask.length; index += 1) if (mask[index]) { area += 1; lowest = Math.max(lowest, Math.floor(index / w)); }
      // 너무 넓거나 사진 아래까지 내려가면 어두운 옷까지 번진 것이라 버린다.
      if (area > w * h * .06 || lowest > h * .55) continue;
      return upscale(close(mask, w, h, Math.max(1, Math.round(Math.max(w, h) * .004))), w, h, width, height);
    }
    return null;
  }

  function grow(light, chroma, w, h, limit) {
    const dark = (index) => light[index] < limit && chroma[index] < 45;
    const mask = new Uint8Array(w * h);
    const queue = [];
    // 옷걸이 고리는 사진 맨 위 가운데쯤에서 내려온다.
    const seedBottom = Math.round(h * .15);
    for (let y = 0; y < seedBottom; y += 1) {
      for (let x = Math.round(w * .2); x < Math.round(w * .8); x += 1) {
        const index = y * w + x;
        if (dark(index)) { mask[index] = 1; queue.push(index); }
      }
    }
    if (!queue.length) return null;
    const bottom = Math.round(h * .6);
    while (queue.length) {
      const index = queue.pop();
      const x = index % w, y = (index - x) / w;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= bottom) continue;
          const near = ny * w + nx;
          if (mask[near] || !dark(near)) continue;
          mask[near] = 1;
          queue.push(near);
        }
      }
    }
    // 고리 근처에서 찾은 덩어리 중 제일 큰 것만 남긴다(벽의 작은 얼룩 제외).
    return largest(mask, w, h);
  }

  function largest(mask, w, h) {
    const label = new Int32Array(w * h);
    let best = 0, bestSize = 0, next = 0;
    for (let start = 0; start < mask.length; start += 1) {
      if (!mask[start] || label[start]) continue;
      next += 1;
      let size = 0;
      const queue = [start];
      label[start] = next;
      while (queue.length) {
        const index = queue.pop();
        size += 1;
        const x = index % w, y = (index - x) / w;
        for (const near of [x > 0 ? index - 1 : -1, x < w - 1 ? index + 1 : -1, y > 0 ? index - w : -1, y < h - 1 ? index + w : -1]) {
          if (near < 0 || !mask[near] || label[near]) continue;
          label[near] = next;
          queue.push(near);
        }
      }
      if (size > bestSize) { bestSize = size; best = next; }
    }
    if (bestSize < 30) return null;
    const out = new Uint8Array(w * h);
    for (let index = 0; index < out.length; index += 1) out[index] = label[index] === best ? 1 : 0;
    return out;
  }

  // 옷걸이 위 반사광처럼 밝게 빠진 작은 틈을 메운다(넓혔다가 다시 줄이기).
  function close(mask, w, h, radius) {
    const wide = dilate(mask, w, h, radius);
    const inverse = new Uint8Array(wide.length);
    for (let index = 0; index < wide.length; index += 1) inverse[index] = wide[index] ? 0 : 1;
    const shrunk = dilate(inverse, w, h, radius);
    for (let index = 0; index < wide.length; index += 1) wide[index] = shrunk[index] ? 0 : 1;
    return wide;
  }

  function dilate(source, width, height, radius) {
    const horizontal = new Uint8Array(source.length);
    for (let row = 0; row < height; row += 1) {
      const offset = row * width;
      let count = 0;
      for (let col = 0; col < Math.min(width, radius); col += 1) count += source[offset + col];
      for (let col = 0; col < width; col += 1) {
        const enter = col + radius;
        const leave = col - radius - 1;
        if (enter < width) count += source[offset + enter];
        if (leave >= 0) count -= source[offset + leave];
        horizontal[offset + col] = count > 0 ? 1 : 0;
      }
    }
    const result = new Uint8Array(source.length);
    for (let col = 0; col < width; col += 1) {
      let count = 0;
      for (let row = 0; row < Math.min(height, radius); row += 1) count += horizontal[row * width + col];
      for (let row = 0; row < height; row += 1) {
        const enter = row + radius;
        const leave = row - radius - 1;
        if (enter < height) count += horizontal[enter * width + col];
        if (leave >= 0) count -= horizontal[leave * width + col];
        result[row * width + col] = count > 0 ? 1 : 0;
      }
    }
    return result;
  }

  function upscale(mask, w, h, width, height) {
    if (w === width && h === height) return mask;
    const out = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      const sy = Math.min(h - 1, Math.floor(y * h / height));
      for (let x = 0; x < width; x += 1) out[y * width + x] = mask[sy * w + Math.min(w - 1, Math.floor(x * w / width))];
    }
    return out;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("script load failed"));
      document.head.appendChild(script);
    });
  }

  // AI 실행 파일과 모델은 처음 한 번만 받아 두고 다시 쓴다.
  function loadSession() {
    if (!sessionPromise) {
      sessionPromise = (async () => {
        if (!window.ort) await loadScript(ORT_URL);
        window.ort.env.wasm.wasmPaths = ORT_WASM;
        return window.ort.InferenceSession.create(MODEL_URL, { executionProviders: ["wasm"] });
      })();
      sessionPromise.catch(() => { sessionPromise = null; });
    }
    return sessionPromise;
  }

  // mask(1 = 채울 곳)를 주변으로 채운 RGBA를 새로 돌려준다. 채울 곳 주변만 잘라 AI에 넘기고,
  // 잘라낸 조각이 크면 줄여서 처리한 뒤 채운 자리에만 늘려 붙인다.
  async function inpaint(image, mask, options = {}) {
    const { width, height, data } = image;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let index = 0; index < mask.length; index += 1) {
      if (!mask[index]) continue;
      const x = index % width, y = (index - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const out = new Uint8ClampedArray(data);
    if (maxX < 0) return new ImageData(out, width, height);
    const session = await loadSession();
    const longSide = Math.max(width, height);
    const grow = options.grow ?? Math.max(3, Math.round(longSide * .004));
    const margin = Math.max(Math.max(maxX - minX, maxY - minY) * (options.marginScale ?? 4), longSide * .15, 96) + grow;
    const x0 = Math.max(0, Math.floor(minX - margin)), y0 = Math.max(0, Math.floor(minY - margin));
    const x1 = Math.min(width, Math.ceil(maxX + 1 + margin)), y1 = Math.min(height, Math.ceil(maxY + 1 + margin));
    const cw = x1 - x0, ch = y1 - y0;
    const crop = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y += 1) for (let x = 0; x < cw; x += 1) crop[y * cw + x] = mask[(y0 + y) * width + x0 + x];
    const fill = dilate(crop, cw, ch, grow);
    const scale = Math.min(1, INPAINT_LIMIT / Math.max(cw, ch));
    const sw = Math.max(1, Math.round(cw * scale)), sh = Math.max(1, Math.round(ch * scale));
    const source = document.createElement("canvas");
    source.width = cw;
    source.height = ch;
    const sourceData = new ImageData(cw, ch);
    for (let y = 0; y < ch; y += 1) {
      for (let x = 0; x < cw; x += 1) {
        const from = ((y0 + y) * width + x0 + x) * 4, to = (y * cw + x) * 4;
        sourceData.data[to] = data[from];
        sourceData.data[to + 1] = data[from + 1];
        sourceData.data[to + 2] = data[from + 2];
        sourceData.data[to + 3] = 255;
      }
    }
    source.getContext("2d").putImageData(sourceData, 0, 0);
    const small = document.createElement("canvas");
    small.width = sw;
    small.height = sh;
    const smallCtx = small.getContext("2d", { willReadFrequently: true });
    smallCtx.imageSmoothingQuality = "high";
    smallCtx.drawImage(source, 0, 0, sw, sh);
    const pixels = smallCtx.getImageData(0, 0, sw, sh).data;
    const size = sw * sh;
    const rgb = new Uint8Array(size * 3);
    const known = new Uint8Array(size);
    for (let y = 0; y < sh; y += 1) {
      for (let x = 0; x < sw; x += 1) {
        const index = y * sw + x;
        rgb[index] = pixels[index * 4];
        rgb[size + index] = pixels[index * 4 + 1];
        rgb[size * 2 + index] = pixels[index * 4 + 2];
        // 줄인 칸 안에 채울 곳이 조금이라도 걸치면 채울 곳으로 본다.
        let hole = 0;
        const fx0 = Math.floor(x / scale), fy0 = Math.floor(y / scale);
        const fx1 = Math.min(cw, Math.ceil((x + 1) / scale)), fy1 = Math.min(ch, Math.ceil((y + 1) / scale));
        for (let fy = fy0; fy < fy1 && !hole; fy += 1) for (let fx = fx0; fx < fx1; fx += 1) if (fill[fy * cw + fx]) { hole = 1; break; }
        known[index] = hole ? 0 : 255;
      }
    }
    const ort = window.ort;
    const result = await session.run({
      image: new ort.Tensor("uint8", rgb, [1, 3, sh, sw]),
      mask: new ort.Tensor("uint8", known, [1, 1, sh, sw])
    });
    const filled = result[session.outputNames[0]].data;
    const painted = new ImageData(sw, sh);
    for (let index = 0; index < size; index += 1) {
      painted.data[index * 4] = filled[index];
      painted.data[index * 4 + 1] = filled[size + index];
      painted.data[index * 4 + 2] = filled[size * 2 + index];
      painted.data[index * 4 + 3] = 255;
    }
    small.getContext("2d").putImageData(painted, 0, 0);
    const back = document.createElement("canvas");
    back.width = cw;
    back.height = ch;
    const backCtx = back.getContext("2d", { willReadFrequently: true });
    backCtx.imageSmoothingQuality = "high";
    backCtx.drawImage(small, 0, 0, cw, ch);
    const up = backCtx.getImageData(0, 0, cw, ch).data;
    for (let y = 0; y < ch; y += 1) {
      for (let x = 0; x < cw; x += 1) {
        if (!fill[y * cw + x]) continue;
        const from = (y * cw + x) * 4, to = ((y0 + y) * width + x0 + x) * 4;
        out[to] = up[from];
        out[to + 1] = up[from + 1];
        out[to + 2] = up[from + 2];
      }
    }
    return new ImageData(out, width, height);
  }

  window.PixelHanger = { findHanger, inpaint, loadSession, dilate };
})();
