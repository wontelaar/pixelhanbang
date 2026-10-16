(() => {
  const current = document.body.dataset.tool || document.body.dataset.page || "";
  const links = [
    ["resize", "resize.html", "크기 변경"],
    ["compress", "compress.html", "용량 줄이기"],
    ["convert", "convert.html", "형식 변환"],
    ["remove-bg", "remove-bg.html", "배경 투명하게"],
    ["mono-logo", "mono-logo.html", "사진 캐릭터"],
    ["circle-profile", "circle-profile.html", "원형 프로필"],
    ["shorts-thumbnail", "shorts-thumbnail.html", "쇼츠 썸네일"],
    ["heic", "heic-jpg.html", "HEIC→JPG"],
    ["square", "square.html", "정사각형"],
    ["grid", "grid.html", "인스타 분할"]
  ];
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
          ${links.map(([key, href, label]) => `<a href="${href}"${current === key ? ' aria-current="page"' : ""}>${label}</a>`).join("")}
        </nav>
      </div>
    `;
  }

  document.querySelectorAll("[data-tool-links]").forEach(container => {
    const notes = {
      resize: "가로·세로 픽셀을 원하는 크기로",
      compress: "화질을 조절해 파일 용량 줄이기",
      convert: "JPG·PNG·WebP로 바꾸기",
      "remove-bg": "단색 배경을 지우고 투명 PNG로",
      "mono-logo": "사진 속 대상만 선명한 색면 캐릭터로",
      "circle-profile": "사진을 원 안에 맞춰 프로필 만들기",
      "shorts-thumbnail": "동영상에서 원하는 장면을 세로 JPG로",
      heic: "아이폰 사진을 JPG로 일괄 변환",
      square: "잘림 없이 정사각형 여백 추가",
      grid: "인스타 피드용 3칸·9칸 만들기"
    };
    container.className = "tool-links";
    container.innerHTML = links.map(([key, href, label]) => `
      <a class="tool-link" href="${href}">
        <b>${label}</b>
        <span>${notes[key]}</span>
      </a>
    `).join("");
  });

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
