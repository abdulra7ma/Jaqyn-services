import { useEffect } from 'react';

// Ports the prototype's componentDidMount: scroll-reveal, count-up, header state.
export function useLandingEffects() {
  useEffect(() => {
    // ---- scroll reveal ----
    const revealEls = [...document.querySelectorAll<HTMLElement>('[data-reveal]')];
    const revealIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const el = e.target as HTMLElement;
            const d = parseInt(el.getAttribute('data-delay') || '0', 10);
            window.setTimeout(() => el.classList.add('is-visible'), d);
            revealIO.unobserve(el);
          }
        });
      },
      { threshold: 0.14, rootMargin: '0px 0px -8% 0px' },
    );
    revealEls.forEach((el) => revealIO.observe(el));

    // ---- count up ----
    const animateCount = (el: HTMLElement) => {
      const target = parseFloat(el.getAttribute('data-count') || '0') || 0;
      const pre = el.getAttribute('data-prefix') || '';
      const suf = el.getAttribute('data-suffix') || '';
      const dur = 1300;
      const t0 = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        const v = Math.round(target * e);
        el.textContent = pre + v.toLocaleString('en-US') + suf;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const counts = [...document.querySelectorAll<HTMLElement>('[data-count]')];
    const countIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            animateCount(e.target as HTMLElement);
            countIO.unobserve(e.target);
          }
        });
      },
      { threshold: 0.5 },
    );
    counts.forEach((c) => countIO.observe(c));

    // ---- header scroll state ----
    const onScroll = () => {
      const hd = document.getElementById('jq-header');
      if (!hd) return;
      const s = window.scrollY > 18;
      hd.style.background = s ? 'rgba(251,246,238,.82)' : 'rgba(251,246,238,0)';
      hd.style.backdropFilter = s ? 'saturate(180%) blur(14px)' : 'none';
      (hd.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter =
        s ? 'saturate(180%) blur(14px)' : 'none';
      hd.style.borderBottomColor = s ? '#EFE3D1' : 'transparent';
      hd.style.boxShadow = s ? '0 4px 22px -14px rgba(46,36,29,.4)' : 'none';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // safety: reveal everything after a beat in case the observer misses
    const fallback = window.setTimeout(() => {
      document
        .querySelectorAll<HTMLElement>('[data-reveal]')
        .forEach((el) => el.classList.add('is-visible'));
    }, 2800);

    return () => {
      revealIO.disconnect();
      countIO.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(fallback);
    };
  }, []);
}
