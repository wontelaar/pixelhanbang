(() => {
  const current = document.body.dataset.tool || document.body.dataset.page || "";
  const links = [
    ["resize", "resize.html", "크기 변경"],
    ["compress", "compress.html", "용량 줄이기"],
    ["target", "target-size.html", "용량 맞추기"],
    ["convert", "convert.html", "형식 변환"],
    ["heic", "heic-jpg.html", "HEIC→JPG"],
    ["crop", "crop.html", "자르기"],
    ["square", "square.html", "정사각형"],
    ["stitch", "stitch.html", "이어붙이기"],
    ["split", "split.html", "긴 이미지 나누기"],
    ["remove-bg", "remove-bg.html", "배경 없애기"],
    ["tag-remove", "tag-remove.html", "택 지우기"],
    ["hanger-remove", "hanger-remove.html", "옷걸이 지우기"],
    ["mosaic", "mosaic.html", "모자이크"],
    ["watermark", "watermark.html", "워터마크"],
    ["exif", "exif.html", "사진 정보 지우기"],
    ["mono-logo", "mono-logo.html", "사진 캐릭터"],
    ["circle-profile", "circle-profile.html", "원형 프로필"],
    ["shorts-thumbnail", "shorts-thumbnail.html", "쇼츠 썸네일"],
    ["grid", "grid.html", "인스타 분할"]
  ];
  // 도구가 많아 상단 메뉴에는 자주 쓰는 것만 두고, 나머지는 '전체 도구'에서 고른다.
  const headerKeys = ["resize", "compress", "target", "convert", "heic", "crop", "remove-bg", "tag-remove", "mosaic", "watermark"];
  const headerLinks = links.filter(([key]) => headerKeys.includes(key) || key === current);
  const header = document.querySelector("#siteHeader");
  if (header) {
    header.className = "site-header";
    header.innerHTML = `
      <div class="header-inner">
        <a class="brand" href="index.html" aria-label="픽셀한방 홈">
          <span class="brand-mark" aria-hidden="true">PX</span>
          <span>픽셀한방</span>
        </a>
        <nav class="main-nav" aria-label="사진·영상 도구">
          ${headerLinks.map(([key, href, label]) => `<a href="${href}"${current === key ? ' aria-current="page"' : ""}>${label}</a>`).join("")}
          <a class="nav-all" href="index.html#tools">전체 도구</a>
        </nav>
      </div>
    `;
  }

  document.querySelectorAll("[data-tool-links]").forEach(container => {
    const notes = {
      resize: "가로·세로 픽셀을 원하는 크기로",
      compress: "화질을 조절해 파일 용량 줄이기",
      target: "500KB 이하처럼 정한 용량에 맞추기",
      convert: "JPG·PNG·WebP로 바꾸기",
      crop: "1:1·4:5·9:16·증명사진 비율로 자르기",
      "remove-bg": "배경 투명하게, 원하는 색으로 바꾸기",
      "tag-remove": "옷 목 택·라벨을 AI로 지우기",
      "hanger-remove": "옷걸이를 자동으로 찾아 AI로 지우기",
      mosaic: "얼굴·송장·번호판 가리기",
      watermark: "글자·로고 워터마크 한 번에 넣기",
      stitch: "여러 장을 세로·가로로 한 장에",
      split: "긴 상세페이지를 여러 장으로",
      exif: "촬영 위치·날짜 확인하고 지우기",
      "mono-logo": "사진 속 대상만 선명한 색면 캐릭터로",
      "circle-profile": "사진을 원 안에 맞춰 프로필 만들기",
      "shorts-thumbnail": "동영상에서 원하는 장면을 세로 JPG로",
      heic: "아이폰 사진을 JPG로 일괄 변환",
      square: "잘림 없이 정사각형 여백 추가",
      grid: "인스타 피드용 3칸·9칸, 3:4 조각"
    };
    container.className = "tool-links";
    container.innerHTML = links.map(([key, href, label]) => `
      <a class="tool-link" href="${href}">
        <b>${label}</b>
        <span>${notes[key]}</span>
      </a>
    `).join("");
  });

  // 지금 편집한 사진을 저장하지 않고 다른 도구로 바로 넘긴다. 사진은 이 브라우저(IndexedDB)에 잠깐 담았다가
  // 다음 도구가 열리면 꺼내서 지운다. 서버로는 보내지 않는다.
  const handoffTools = ["remove-bg", "hanger-remove", "tag-remove", "crop", "mosaic", "watermark", "resize", "compress", "square", "convert"];
  const openStore = () => new Promise((resolve, reject) => {
    const request = indexedDB.open("pixelhanbang-handoff", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("photo");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const storeAction = async (mode, action) => {
    const db = await openStore();
    try {
      return await new Promise((resolve, reject) => {
        const request = action(db.transaction("photo", mode).objectStore("photo"));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  };

  window.PixelHandoff = {
    // anchor 뒤에 "이어서 편집" 줄을 붙인다. getResult는 { blob, name }을 돌려주는 함수.
    mount(anchor, getResult) {
      if (!anchor || !window.indexedDB) return null;
      const box = document.createElement("div");
      box.className = "handoff";
      const label = document.createElement("label");
      label.className = "setting-label";
      label.textContent = "지금 사진 그대로 이어서 편집";
      const row = document.createElement("div");
      row.className = "handoff-row";
      const select = document.createElement("select");
      select.setAttribute("aria-label", "이어서 쓸 도구");
      handoffTools.filter(key => key !== current).map(key => links.find(link => link[0] === key)).filter(Boolean).forEach(([key, href, name]) => {
        const option = document.createElement("option");
        option.value = href;
        option.textContent = name;
        select.appendChild(option);
      });
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button-secondary";
      button.textContent = "보내기";
      const note = document.createElement("p");
      note.className = "setting-hint";
      note.textContent = "저장하지 않고 고른 도구로 바로 넘어가요. 투명한 배경도 그대로 넘어가요.";
      button.addEventListener("click", async () => {
        button.disabled = true;
        note.textContent = "사진을 넘길 준비를 하고 있어요…";
        try {
          const result = await getResult();
          if (!result || !result.blob) throw new Error("no result");
          await storeAction("readwrite", store => store.put({ blob: result.blob, name: result.name, time: Date.now() }, "current"));
          location.href = select.value + "?handoff=1";
        } catch (error) {
          console.error(error);
          note.textContent = "사진을 넘기지 못했어요. 먼저 사진을 고르고 다시 시도하거나, 저장한 뒤 다른 도구에서 열어 주세요.";
          button.disabled = false;
        }
      });
      row.append(select, button);
      box.append(label, row, note);
      anchor.after(box);
      return { box, setEnabled(enabled) { button.disabled = !enabled; } };
    }
  };

  // 다른 도구에서 넘긴 사진이 있으면, 도구 스크립트가 준비된 뒤 사진 선택 칸에 넣어 준다.
  if (new URLSearchParams(location.search).has("handoff") && window.indexedDB) {
    window.addEventListener("load", async () => {
      try {
        const item = await storeAction("readonly", store => store.get("current"));
        await storeAction("readwrite", store => store.delete("current"));
        history.replaceState(null, "", location.pathname);
        const input = document.querySelector("#fileInput");
        // 30분이 지난 사진은 쓰지 않는다(뒤로 가기 등으로 다시 열린 경우).
        if (!item || !input || Date.now() - item.time > 30 * 60 * 1000) return;
        const transfer = new DataTransfer();
        transfer.items.add(new File([item.blob], item.name, { type: item.blob.type || "image/png" }));
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (error) {
        console.error(error);
      }
    });
  }

  const footer = document.querySelector("#siteFooter");
  if (footer) {
    footer.className = "site-footer";
    footer.innerHTML = `
      <div class="footer-inner">
        <div>© ${new Date().getFullYear()} 픽셀한방 · 파일은 기기 안에서만 처리됩니다.</div>
        <div class="footer-links">
          <a href="guides.html">가이드 모음</a>
          <a href="photo-format-guide.html">사진 형식 가이드</a>
          <a href="shopping-photo-guide.html">상품사진 가이드</a>
          <a href="sns-image-guide.html">SNS 이미지 가이드</a>
          <a href="about.html">사이트 소개</a>
          <a href="contact.html">문의하기</a>
          <a href="privacy.html">개인정보처리방침</a>
          <a href="terms.html">이용약관</a>
        </div>
      </div>
    `;
  }
})();
