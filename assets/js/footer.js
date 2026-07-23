// Shared footer injection
document.addEventListener('DOMContentLoaded', () => {
  const el = document.querySelector('#footer-include');
  if (!el) return;
  el.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div>
          <div class="footer-brand">
            <img src="assets/img/spyder-bug.png" class="spider-icon" alt="">
            <img src="assets/img/spyder-wordmark.png" class="wordmark" alt="SPYDER">
          </div>
          <p>2016년 시작된 국내 최초 인비테이셔널의 권위를 이어가는 SPYDER BJJ SUPER SERIES. 2026년 PART 2는 명지전문대학교 체육관에서 개최됩니다.</p>
        </div>
        <div class="footer-col">
          <h5>QUICK LINKS</h5>
          <a href="index.html#overview">대회 개요</a>
          <a href="index.html#venue">장소·일정</a>
          <a href="kit.html">참가 KIT</a>
          <a href="bracket.html">대진표·선수명단</a>
        </div>
        <div class="footer-col">
          <h5>TICKET & CONTACT</h5>
          <a href="tickets.html">티켓 예매 안내</a>
          <span>문의: 대행사 확인 필요 (TBD)</span>
          <span>주최: SPYDER</span>
        </div>
      </div>
      <div class="footer-bottom">
        <span>&copy; 2026 SPYDER BJJ SUPER SERIES. All rights reserved.</span>
        <span>본 페이지는 대회 기획안 기준으로 제작되었으며, 세부 내용은 사정에 따라 변경될 수 있습니다.</span>
      </div>
    </div>
  `;
});
