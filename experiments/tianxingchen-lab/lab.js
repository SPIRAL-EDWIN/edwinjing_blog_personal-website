(() => {
  'use strict';

  const root = document.documentElement;
  const nav = document.getElementById('site-nav');
  const toggle = nav.querySelector('.nav-toggle');
  const links = Array.from(nav.querySelectorAll('.nav-links a[href^="#"]'));
  const targets = links.map(link => ({ link, target: document.getElementById(link.hash.slice(1)) })).filter(item => item.target);
  const news = document.getElementById('news-list');
  const newsToggle = document.querySelector('.news-toggle');
  root.classList.add('js-enabled');

  function setMenuOpen(open, restoreFocus = false) {
    nav.classList.toggle('is-open', open);
    document.body.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation · 关闭导航' : 'Open navigation · 打开导航');
    if (restoreFocus) toggle.focus();
  }

  toggle.addEventListener('click', () => setMenuOpen(!nav.classList.contains('is-open')));
  links.forEach(link => link.addEventListener('click', () => setMenuOpen(false)));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.classList.contains('is-open')) setMenuOpen(false, true);
  });

  // Keep native hash navigation; only the selected link is managed here.
  function updateActiveLink() {
    const navHeight = nav.getBoundingClientRect().height;
    const threshold = window.scrollY + navHeight + 28;
    const ordered = targets.map(item => ({ ...item, top: item.target.getBoundingClientRect().top + window.scrollY })).sort((a, b) => a.top - b.top);
    let selected = ordered[0];
    for (const item of ordered) {
      if (item.top <= threshold) selected = item;
    }
    if (window.scrollY + window.innerHeight >= root.scrollHeight - 8) selected = ordered[ordered.length - 1];
    links.forEach(link => {
      const active = selected && link === selected.link;
      link.classList.toggle('active', Boolean(active));
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }

  let scheduled = false;
  function scheduleSelection() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      updateActiveLink();
    });
  }
  window.addEventListener('scroll', scheduleSelection, { passive: true });
  window.addEventListener('hashchange', scheduleSelection);
  window.addEventListener('resize', () => {
    if (window.innerWidth > 860) setMenuOpen(false);
    scheduleSelection();
  }, { passive: true });

  newsToggle.addEventListener('click', () => {
    const expanded = news.classList.toggle('news-expanded');
    newsToggle.setAttribute('aria-expanded', String(expanded));
    newsToggle.textContent = expanded ? 'Show less ↑' : 'Show more ↓';
    scheduleSelection();
  });

  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  if ('IntersectionObserver' in window && !motionPreference.matches) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.06, rootMargin: '0px 0px -30px 0px' });
    const reveals = document.querySelectorAll('.reveal');
    reveals.forEach(element => observer.observe(element));
    root.classList.add('reveals-enabled');
    motionPreference.addEventListener('change', event => {
      if (event.matches) {
        observer.disconnect();
        root.classList.remove('reveals-enabled');
      }
    });
  }

  scheduleSelection();
  window.addEventListener('load', scheduleSelection, { once: true });
})();
