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
          <p>2016년 시작된 국내 최초 인비테이셔널의 권위를 이어가는 SPYDER BJJ SUPER SERIES. 2026년 PART 2는 명지전문대학교 예체능관 3층에서 개최됩니다.</p>
        </div>
        <div class="footer-col">
          <h5>QUICK LINKS</h5>
          <a href="index.html#overview">대회 개요</a>
          <a href="index.html#venue">장소·일정</a>
          <a href="bracket.html">참가 선수 명단</a>
        </div>
        <div class="footer-col">
          <h5>TICKET & CONTACT</h5>
          <a href="tickets.html">티켓 예매 안내</a>
          <span>주최: SPYDER</span>
        </div>
      </div>
      <p class="footer-notice">본 대회 안내 사이트는 PC 환경에 최적화되어 있습니다.<br>원활한 정보 확인을 위해 PC 또는 노트북을 통한 접속을 권장합니다.</p>
      <div class="footer-bottom">
        <span>&copy; 2026 SPYDER BJJ SUPER SERIES. All rights reserved.</span>
      </div>
    </div>
  `;
});
