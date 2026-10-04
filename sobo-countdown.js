(() => {
  const target = new Date('2026-10-17T18:00:00-04:00');
  const expiry = new Date('2026-10-18T00:00:00-04:00');
  const detailsUrl = 'assets/SOBO%202026%20Details.pdf';
  const nav = document.querySelector('header nav');
  if (!nav) return;

  const style = document.createElement('style');
  style.textContent = `
    .sobo-countdown{background:#fff000;border-block:2px solid #111;display:grid;gap:.2rem;justify-items:center;padding:.75rem 1rem;text-align:center}
    .sobo-countdown-title{font-family:'Cal Sans',sans-serif;font-size:clamp(1rem,3vw,1.25rem);font-weight:700;letter-spacing:.02em}.sobo-countdown-date{font-size:.95rem}.sobo-countdown-clock{display:flex;align-items:baseline;font-size:.9rem;font-variant-numeric:tabular-nums;justify-content:center;line-height:1.35;max-width:100%;white-space:nowrap}.sobo-countdown-clock .sobo-countdown-part{display:inline-flex;justify-content:center;width:6.5ch}.sobo-countdown-clock [data-unit]{display:inline-block;font-family:'Cal Sans',sans-serif;font-size:1rem;min-width:2ch;text-align:right}.sobo-countdown-clock small{display:inline-block;font-size:.72rem;text-align:left;width:4.5ch}.sobo-countdown-clock i{color:#555;display:inline-block;font-style:normal;text-align:center;width:1.15ch}.sobo-countdown-link{color:#0645ad;font-family:'Cal Sans',sans-serif;font-size:.95rem;font-weight:700;text-decoration:underline}.sobo-countdown.is-active{background:#ff00f5;min-height:3.5rem}.sobo-countdown.is-active .sobo-countdown-link{color:#111;font-size:clamp(1.35rem,3vw,2rem);letter-spacing:.01em}@media(max-width:768px){.sobo-countdown{padding:.7rem .35rem}.sobo-countdown-clock{font-size:.78rem}.sobo-countdown-clock .sobo-countdown-part{width:6.25ch}.sobo-countdown-clock small{font-size:.64rem;width:4.25ch}.sobo-countdown-clock i{width:1ch}}
  `;
  document.head.append(style);

  const banner = document.createElement('section');
  banner.className = 'sobo-countdown';
  banner.setAttribute('aria-live', 'polite');
  banner.innerHTML = `
    <div class="sobo-countdown-title">SOBO 2026 CARDS FLY COUNTDOWN</div>
    <div class="sobo-countdown-date">Saturday, Oct. 17th &mdash; 6pm</div>
    <div class="sobo-countdown-clock">
      <span class="sobo-countdown-part"><span data-unit="days">00</span><small>days</small></span><i>|</i>
      <span class="sobo-countdown-part"><span data-unit="hours">00</span><small>hours</small></span><i>|</i>
      <span class="sobo-countdown-part"><span data-unit="minutes">00</span><small>mins</small></span><i>|</i>
      <span class="sobo-countdown-part"><span data-unit="seconds">00</span><small>secs</small></span>
    </div>
    <a class="sobo-countdown-link" href="${detailsUrl}">SOBO Details</a>`;
  nav.insertAdjacentElement('afterend', banner);

  const setUnit = (unit, value) => {
    banner.querySelector(`[data-unit="${unit}"]`).textContent = String(value).padStart(2, '0');
  };
  const showActiveState = () => {
    banner.classList.add('is-active');
    banner.innerHTML = `<a class="sobo-countdown-link" href="${detailsUrl}">Let's fucking GO SOBO!!!</a>`;
  };
  const update = () => {
    const now = Date.now();
    if (now >= expiry.getTime()) {
      banner.remove();
      window.clearInterval(timer);
      return;
    }
    if (now >= target.getTime()) {
      showActiveState();
      return;
    }
    const totalSeconds = Math.floor((target.getTime() - now) / 1000);
    setUnit('days', Math.floor(totalSeconds / 86400));
    setUnit('hours', Math.floor((totalSeconds % 86400) / 3600));
    setUnit('minutes', Math.floor((totalSeconds % 3600) / 60));
    setUnit('seconds', totalSeconds % 60);
  };

  const timer = window.setInterval(update, 1000);
  update();
})();
