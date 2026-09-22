/**
 * MAFIA WARS — CREDITS JS
 * Scrolls credits upward over 10 seconds, then fades out
 */

window.addEventListener('DOMContentLoaded', () => {
  const scroll = document.getElementById('credits-scroll');
  const backBtn = document.getElementById('btn-back');

  backBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  // Add progress bar
  const progressWrap = document.createElement('div');
  progressWrap.id = 'progress-bar-wrap';
  const progressBar = document.createElement('div');
  progressBar.id = 'progress-bar';
  progressWrap.appendChild(progressBar);
  document.body.appendChild(progressWrap);

  // Measure total content height
  const totalDuration = 11000; // ms  (10s scroll + 1s buffer)
  const startTime = performance.now();

  // Initial position: scroll starts just below viewport
  const viewH = window.innerHeight;

  function animate(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / totalDuration, 1);

    // Move from +100vh to a position where all content has scrolled through
    const scrollHeight = scroll.offsetHeight;
    const totalTravel  = viewH + scrollHeight;
    const y = viewH - (progress * totalTravel);

    scroll.style.top = y + 'px';

    // Progress bar
    progressBar.style.width = (progress * 100) + '%';

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      // Fade out, then redirect
      document.body.style.transition = 'opacity 1.2s ease';
      document.body.style.opacity = '0';
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1300);
    }
  }

  requestAnimationFrame(animate);
});
