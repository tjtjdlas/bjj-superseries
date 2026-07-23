// SPYDER BJJ SUPER SERIES — shared site behavior

document.addEventListener('DOMContentLoaded', () => {

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

  // Reveal on scroll
  const revealEls = document.querySelectorAll('.reveal');
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

  // Countdown to event date
  const countdownEl = document.querySelector('#countdown');
  if (countdownEl) {
    const eventDate = new Date('2026-10-18T10:00:00+09:00').getTime();
    const render = () => {
      const now = Date.now();
      const diff = eventDate - now;
      if (diff <= 0) {
        countdownEl.textContent = 'EVENT DAY';
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      countdownEl.textContent = `D-${d} ${h}h ${m}m`;
    };
    render();
    setInterval(render, 60000);
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
