/* ==============================
   ChatNow – main.js (index page)
   ============================== */

/* ── Hamburger ── */
const hamburger = document.getElementById('hamburger');
const mobileNav = document.getElementById('mobileNav');
if (hamburger) {
  hamburger.addEventListener('click', () => mobileNav.classList.toggle('open'));
}

/* ── Live online counter (animated) ── */
function animateCounter(el, target, duration = 2000) {
  if (!el) return;
  const start = Math.floor(target * 0.85);
  const range = target - start;
  let startTime = null;
  function step(ts) {
    if (!startTime) startTime = ts;
    const progress = Math.min((ts - startTime) / duration, 1);
    el.textContent = Math.floor(start + range * easeOut(progress)).toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

// Animate hero badge counter on load
window.addEventListener('load', () => {
  const badge = document.querySelector('.hero-badge');
  if (badge) {
    const span = badge.querySelector('span') || badge;
    // Fluctuate counter every 5s
    setInterval(() => {
      const base = 12000 + Math.floor(Math.random() * 2000);
      badge.innerHTML = `<span class="pulse-dot"></span> ${base.toLocaleString()} people online now`;
    }, 5000);
  }
});

/* ── Start Chat from hero form ── */
function startChat() {
  const nickname = (document.getElementById('heroNickname')?.value || '').trim();
  const gender   = document.getElementById('heroGender')?.value  || '';
  const age      = document.getElementById('heroAge')?.value     || '';
  const country  = document.getElementById('heroCountry')?.value || '';

  // ❌ check ALL fields
  if (!nickname || !gender || !age || !country) {
    showTopAlert("⚠️ Please fill all details first!");

    // optional: focus first empty field
    if (!nickname) document.getElementById('heroNickname')?.focus();
    else if (!gender) document.getElementById('heroGender')?.focus();
    else if (!age) document.getElementById('heroAge')?.focus();
    else if (!country) document.getElementById('heroCountry')?.focus();

    return;
  }

  // ✅ if all filled → allow chat
  const user = {
    nickname,
    gender,
    age,
    country
  };

  // 👉 මෙතන ඔයාගේ original chat start code එක තියෙයි
  openDM(user); // or whatever function you use
}
  const params = new URLSearchParams({ nickname, gender, age, country });
  window.location.href = `chat.html?${params}`;
}

/* ── Toast notification ── */
function showToast(msg, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fa-solid fa-${type === 'warn' ? 'triangle-exclamation' : 'circle-info'}"></i> ${msg}`;
  Object.assign(toast.style, {
    position: 'fixed', bottom: '2rem', left: '50%',
    transform: 'translateX(-50%) translateY(20px)',
    background: type === 'warn' ? '#f97316' : '#00e5ff',
    color: '#0a0b14', fontWeight: '700', padding: '.75rem 1.5rem',
    borderRadius: '50px', fontSize: '.88rem', zIndex: '9999',
    opacity: '0', transition: 'all .3s', whiteSpace: 'nowrap',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ── Intersection Observer for section animations ── */
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      observer.unobserve(e.target);
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.feature-card, .room-card, .step, .stat').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(24px)';
  el.style.transition = 'opacity .5s ease, transform .5s ease';
  observer.observe(el);
});

// Add visible class styles inline
const animStyle = document.createElement('style');
animStyle.textContent = `.visible { opacity: 1 !important; transform: translateY(0) !important; }`;
document.head.appendChild(animStyle);
