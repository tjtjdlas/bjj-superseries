// SPYDER BJJ SUPER SERIES — shared site behavior

document.addEventListener('DOMContentLoaded', () => {

  // Device-specific landing links (e.g. ticket purchase buttons with separate PC/mobile URLs)
  const isMobileDevice = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  document.querySelectorAll('[data-pc-href]').forEach(a => {
    const target = isMobileDevice ? a.dataset.moHref : a.dataset.pcHref;
    if (target) a.href = target;
  });

  // Cyber hero: countdown timer to the event date
  const countdownEl = document.querySelector('#heroCountdown');
  if (countdownEl) {
    const target = new Date(countdownEl.dataset.target).getTime();
    const daysEl = document.querySelector('#cdDays');
    const hoursEl = document.querySelector('#cdHours');
    const minsEl = document.querySelector('#cdMins');
    const secsEl = document.querySelector('#cdSecs');
    const pad = (n) => String(Math.max(n, 0)).padStart(2, '0');
    const tick = () => {
      const diff = target - Date.now();
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      daysEl.textContent = pad(days);
      hoursEl.textContent = pad(hours);
      minsEl.textContent = pad(mins);
      secsEl.textContent = pad(secs);
    };
    tick();
    setInterval(tick, 1000);
  }

  // Venue map (Leaflet + CARTO dark tiles — pre-styled minimal basemap, no invert hack needed)
  const mapEl = document.querySelector('#venueMap');
  if (mapEl && window.L) {
    const coords = [37.5836983, 126.9249649];
    const minZoom = 13;
    const maxZoom = 19;
    const map = L.map(mapEl, {
      scrollWheelZoom: false,
      attributionControl: false,
      minZoom,
      maxZoom
    }).setView(coords, 16);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom,
      subdomains: 'abcd'
    }).addTo(map);

    L.marker(coords).addTo(map);

    // Zoom gauge slider (0-100%) as a replacement for scroll-wheel zoom
    const zoomRange = document.querySelector('#mapZoomRange');
    if (zoomRange) {
      const zoomToPercent = (zoom) => Math.round((zoom - minZoom) / (maxZoom - minZoom) * 100);
      const percentToZoom = (percent) => minZoom + (percent / 100) * (maxZoom - minZoom);

      zoomRange.value = zoomToPercent(map.getZoom());
      zoomRange.addEventListener('input', () => {
        map.setZoom(percentToZoom(Number(zoomRange.value)));
      });
      map.on('zoomend', () => {
        zoomRange.value = zoomToPercent(map.getZoom());
      });
    }
  }

  // Brand story image slider
  const slider = document.querySelector('#storySlider');
  if (slider) {
    const slides = slider.querySelectorAll('.slide');
    const dots = slider.querySelectorAll('.slide-dots button');
    let current = 0;
    let timer = null;

    const goTo = (index) => {
      slides[current].classList.remove('active');
      dots[current].classList.remove('active');
      current = index;
      slides[current].classList.add('active');
      dots[current].classList.add('active');
    };

    const startAuto = () => {
      timer = setInterval(() => goTo((current + 1) % slides.length), 3500);
    };
    const restartAuto = () => {
      clearInterval(timer);
      startAuto();
    };

    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => {
        if (i === current) return;
        goTo(i);
        restartAuto();
      });
    });

    const prevBtn = slider.querySelector('.slide-arrow.prev');
    const nextBtn = slider.querySelector('.slide-arrow.next');
    if (prevBtn && nextBtn) {
      prevBtn.addEventListener('click', () => {
        goTo((current - 1 + slides.length) % slides.length);
        restartAuto();
      });
      nextBtn.addEventListener('click', () => {
        goTo((current + 1) % slides.length);
        restartAuto();
      });
    }

    startAuto();
  }

  // Mobile nav toggle
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
    navLinks.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => navLinks.classList.remove('open'));
    });
  }

  // Active nav link based on current page
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a[href]').forEach(a => {
    const href = a.getAttribute('href').split('#')[0];
    if (href === path || (href === '' && path === 'index.html')) {
      a.classList.add('active');
    }
  });

  // 3D tilt on card hover (target/ticket/kit cards)
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!prefersReducedMotion && window.matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.tilt-card').forEach(card => {
      const maxTilt = 7;
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = `perspective(900px) rotateX(${(-py * maxTilt).toFixed(2)}deg) rotateY(${(px * maxTilt).toFixed(2)}deg) translateZ(8px)`;
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
      });
    });
  }

  // Word-by-word text reveal setup (must run before observer attaches)
  document.querySelectorAll('.reveal-text').forEach(el => {
    const words = el.textContent.trim().split(/\s+/);
    el.innerHTML = words.map((w, i) =>
      `<span class="word" style="transition-delay:${i * 55}ms">${w}</span>`
    ).join(' ');
  });

  // Reveal on scroll
  const revealEls = document.querySelectorAll('.reveal, .reveal-text, .section, .cta-band');
  if ('IntersectionObserver' in window && revealEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in'));
  }

  // Lightbox for gallery
  const lightbox = document.querySelector('.lightbox');
  if (lightbox) {
    const lbImg = lightbox.querySelector('img');
    document.querySelectorAll('[data-lightbox]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        lbImg.src = link.getAttribute('href');
        lightbox.classList.add('open');
      });
    });
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox || e.target.classList.contains('lightbox-close')) {
        lightbox.classList.remove('open');
        lbImg.src = '';
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        lightbox.classList.remove('open');
        lbImg.src = '';
      }
    });
  }

  // FAQ Accordion
  document.querySelectorAll('.accordion-item').forEach(item => {
    const btn = item.querySelector('button');
    const panel = item.querySelector('.accordion-panel');
    if (item.classList.contains('open')) {
      panel.style.maxHeight = panel.scrollHeight + 'px';
    }
    btn.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      item.parentElement.querySelectorAll('.accordion-item').forEach(other => {
        other.classList.remove('open');
        other.querySelector('.accordion-panel').style.maxHeight = null;
      });
      if (!isOpen) {
        item.classList.add('open');
        panel.style.maxHeight = panel.scrollHeight + 'px';
      }
    });
  });

  // Division tabs (bracket/roster page)
  document.querySelectorAll('.division-tabs').forEach(tabGroup => {
    const buttons = tabGroup.querySelectorAll('button');
    const targetSelector = tabGroup.getAttribute('data-target');
    const panels = targetSelector ? document.querySelectorAll(targetSelector + ' .division-panel') : [];
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const key = btn.getAttribute('data-division');
        panels.forEach(p => {
          p.classList.toggle('active', p.getAttribute('data-division') === key);
        });
      });
    });
  });

  // Roster search filter
  const searchInput = document.querySelector('#rosterSearch');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      document.querySelectorAll('.roster-table tbody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }

  // Nav background solidify on scroll
  const nav = document.querySelector('.nav');
  if (nav) {
    const onScroll = () => {
      nav.style.background = window.scrollY > 40 ? 'rgba(5,7,12,0.92)' : 'rgba(5,7,12,0.7)';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
});
