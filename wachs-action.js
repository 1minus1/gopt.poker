(() => {
  const MESSAGE = 'WACHS, ACTION TO YOU!!!';
  const AUDIO_SRC = 'assets/wachs-action.mp3';
  const palettes = [
    ['#fff200', '#ff00f5', '#00f5ff', '#00ff66', '#ff5a00'],
    ['#00ff66', '#7a00ff', '#fff200', '#ff003c', '#00f5ff'],
    ['#ff5a00', '#00f5ff', '#ff00f5', '#fff200', '#111111'],
    ['#ff003c', '#fff200', '#00ff66', '#00f5ff', '#7a00ff'],
    ['#00f5ff', '#ff003c', '#fff200', '#7a00ff', '#00ff66'],
    ['#7a00ff', '#00ff66', '#ff5a00', '#fff200', '#ff00f5'],
  ];

  let modal;
  let audio;
  let fallbackCloseTimer;
  let lastActivationAt = 0;
  let lastPaletteIndex = -1;
  const DOUBLE_ACTIVATION_MS = 520;

  function pickPalette() {
    if (palettes.length === 1) return palettes[0];

    let index = Math.floor(Math.random() * palettes.length);
    if (index === lastPaletteIndex) {
      index = (index + 1) % palettes.length;
    }
    lastPaletteIndex = index;
    return palettes[index];
  }

  function ensureModal() {
    if (modal) return;

    modal = document.createElement('div');
    modal.className = 'wachs-modal';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', MESSAGE);
    modal.setAttribute('tabindex', '-1');
    modal.innerHTML = `
      <p class="wachs-modal-text">${MESSAGE}</p>
    `;
    document.body.appendChild(modal);
  }

  function closeModal() {
    if (!modal) return;

    modal.hidden = true;
    document.body.classList.remove('wachs-modal-open');
    clearTimeout(fallbackCloseTimer);
    if (audio && !audio.ended) {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  function scheduleFallbackClose(delay = 2500) {
    clearTimeout(fallbackCloseTimer);
    fallbackCloseTimer = setTimeout(closeModal, delay);
  }

  function scheduleSafetyClose() {
    const audioDuration = audio?.duration;
    const delay = Number.isFinite(audioDuration) && audioDuration > 0
      ? audioDuration * 1000 + 250
      : 8000;
    scheduleFallbackClose(delay);
  }

  function playAudio() {
    if (!audio) {
      audio = new Audio(AUDIO_SRC);
      audio.preload = 'auto';
      audio.addEventListener('ended', closeModal);
      audio.addEventListener('error', () => scheduleFallbackClose());
      audio.addEventListener('loadedmetadata', scheduleSafetyClose);
    }

    clearTimeout(fallbackCloseTimer);
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 1;
    scheduleSafetyClose();
    audio.play().catch(() => scheduleFallbackClose());
  }

  function openModal() {
    ensureModal();

    const [background, foreground, stripe, shadowOne, shadowTwo] = pickPalette();
    modal.style.setProperty('--wachs-bg', background);
    modal.style.setProperty('--wachs-fg', foreground);
    modal.style.setProperty('--wachs-stripe', stripe);
    modal.style.setProperty('--wachs-shadow-one', shadowOne);
    modal.style.setProperty('--wachs-shadow-two', shadowTwo);
    modal.hidden = false;
    document.body.classList.add('wachs-modal-open');
    modal.focus({ preventScroll: true });
    playAudio();
  }

  function handleLogoActivation(event) {
    const now = Date.now();
    if (now - lastActivationAt <= DOUBLE_ACTIVATION_MS) {
      lastActivationAt = 0;
      event.preventDefault();
      openModal();
      return;
    }

    lastActivationAt = now;
  }

  function handleLogoKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    event.preventDefault();
    handleLogoActivation(event);
  }

  function wireLogoTriggers() {
    document.querySelectorAll('img.logo').forEach(logo => {
      logo.classList.add('wachs-logo-trigger');
      logo.setAttribute('role', 'button');
      logo.setAttribute('tabindex', '0');
      logo.setAttribute('aria-label', 'Summon Wachs action warning');
      logo.addEventListener('click', handleLogoActivation);
      logo.addEventListener('keydown', handleLogoKeydown);
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeModal();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireLogoTriggers);
  } else {
    wireLogoTriggers();
  }
})();
