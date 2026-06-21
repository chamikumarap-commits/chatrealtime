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

window.addEventListener('load', () => {
  const badge = document.querySelector('.hero-badge');
  if (badge) {
    setInterval(() => {
      const base = 12000 + Math.floor(Math.random() * 2000);
      badge.innerHTML = `<span class="pulse-dot"></span> ${base.toLocaleString()} people online now`;
    }, 5000);
  }
});

/* ── Hero form validation helpers ── */

// Inject validation + shake styles once
(function injectHeroValidationStyles() {
  if (document.getElementById('hero-val-styles')) return;
  const s = document.createElement('style');
  s.id = 'hero-val-styles';
  s.textContent = `
    @keyframes heroShake {
      0%,100%{ transform:translateX(0) }
      20%    { transform:translateX(-6px) }
      40%    { transform:translateX(6px) }
      60%    { transform:translateX(-4px) }
      80%    { transform:translateX(4px) }
    }
    .hero-field-error input,
    .hero-field-error select {
      border: 1.5px solid #ef4444 !important;
      animation: heroShake .35s ease;
    }
    .hero-field-error .hero-val-msg {
      display: flex !important;
    }
    .hero-val-msg {
      display: none;
      align-items: center;
      gap: .3rem;
      font-size: .74rem;
      color: #ef4444;
      margin-top: .3rem;
      font-weight: 600;
    }
    .hero-val-msg i { font-size: .7rem; }
  `;
  document.head.appendChild(s);
})();

function markFieldError(el, msg) {
  // Wrap the element in a helper div if not already wrapped
  let wrapper = el.closest('.hero-val-wrap');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'hero-val-wrap';
    wrapper.style.cssText = 'display:flex;flex-direction:column;flex:1;min-width:0;';
    el.parentNode.insertBefore(wrapper, el);
    wrapper.appendChild(el);
  }
  wrapper.classList.add('hero-field-error');

  // Add message node if missing
  let msgEl = wrapper.querySelector('.hero-val-msg');
  if (!msgEl) {
    msgEl = document.createElement('span');
    msgEl.className = 'hero-val-msg';
    msgEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> <span></span>`;
    wrapper.appendChild(msgEl);
  }
  msgEl.querySelector('span').textContent = msg;

  // Re-trigger shake
  el.style.animation = 'none';
  el.offsetHeight;
  el.style.animation = '';
}

function clearFieldError(el) {
  const wrapper = el.closest('.hero-val-wrap');
  if (wrapper) wrapper.classList.remove('hero-field-error');
}

// Clear error on user interaction
document.addEventListener('DOMContentLoaded', () => {
  ['heroNickname','heroGender','heroAge','heroCountry'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input',  () => clearFieldError(el));
    el.addEventListener('change', () => clearFieldError(el));
  });
});

/* ── Start Chat (with full validation) ── */
function startChat() {
  const nicknameEl = document.getElementById('heroNickname');
  const genderEl   = document.getElementById('heroGender');
  const ageEl      = document.getElementById('heroAge');
  const countryEl  = document.getElementById('heroCountry');

  const nickname = (nicknameEl?.value || '').trim();
  const gender   = genderEl?.value  || '';
  const age      = ageEl?.value     || '';
  const country  = countryEl?.value || '';

  let hasError = false;

  // Nickname
  if (!nickname) {
    markFieldError(nicknameEl, 'Nickname is required');
    nicknameEl.focus();
    hasError = true;
  } else if (nickname.length < 3) {
    markFieldError(nicknameEl, 'Nickname must be at least 3 characters');
    nicknameEl.focus();
    hasError = true;
  }

  // Gender
  if (!gender) {
    markFieldError(genderEl, 'Please select your gender');
    hasError = true;
  }

  // Age
  if (!age) {
    markFieldError(ageEl, 'Please select your age range');
    hasError = true;
  }

  // Country
  if (!country) {
    markFieldError(countryEl, 'Please select your country');
    hasError = true;
  }

  if (hasError) {
    showToast('Please fill in all fields to continue', 'warn');
    return;
  }

  const params = new URLSearchParams({ nickname, gender, age, country });
  window.location.href = `/chat?${params}`;
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

const animStyle = document.createElement('style');
animStyle.textContent = `.visible { opacity: 1 !important; transform: translateY(0) !important; }`;
document.head.appendChild(animStyle);
