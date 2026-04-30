// ─── LANGUAGE TOGGLE ───
const translations = { lang: 'tr' };

function setLang(lang) {
  translations.lang = lang;
  document.querySelectorAll('[data-tr]').forEach(el => {
    const val = lang === 'en' ? el.dataset.en : el.dataset.tr;
    if (!val) return;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.placeholder = val;
    } else {
      el.innerHTML = val;
    }
  });
  document.documentElement.lang = lang === 'en' ? 'en' : 'tr';
  document.getElementById('langToggle').textContent = lang === 'en' ? 'TR' : 'EN';
}

document.getElementById('langToggle').addEventListener('click', () => {
  setLang(translations.lang === 'tr' ? 'en' : 'tr');
});

// ─── HAMBURGER MENU ───
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('navLinks');

hamburger.addEventListener('click', () => {
  navLinks.classList.toggle('open');
});

navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => navLinks.classList.remove('open'));
});

// ─── NAVBAR SCROLL ───
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 20);
  updateActiveNav();
});

// ─── ACTIVE NAV LINK ───
function updateActiveNav() {
  const sections = document.querySelectorAll('section[id]');
  const scrollY = window.scrollY + 80;
  sections.forEach(section => {
    const top = section.offsetTop;
    const height = section.offsetHeight;
    const id = section.getAttribute('id');
    const link = document.querySelector(`.nav-links a[href="#${id}"]`);
    if (!link) return;
    if (scrollY >= top && scrollY < top + height) {
      document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
      link.classList.add('active');
    }
  });
}

// ─── SKILL BARS ANIMATION ───
const skillObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.querySelectorAll('.skill-fill').forEach(fill => {
        fill.classList.add('animated');
      });
    }
  });
}, { threshold: 0.3 });

const skillsSection = document.querySelector('.skills-section');
if (skillsSection) skillObserver.observe(skillsSection);

// ─── FADE UP ANIMATIONS ───
const fadeObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => entry.target.classList.add('visible'), i * 80);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll(
  '.info-card, .timeline-item, .project-card, .collab-card, .cert-card, .ref-card, .edu-card, .skill-group, .contact-link-item, .lang-item'
).forEach(el => {
  el.classList.add('fade-up');
  fadeObserver.observe(el);
});

// ─── CONTACT FORM ───
const form = document.getElementById('contactForm');
if (form) {
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('cf-name').value.trim();
    const email = document.getElementById('cf-email').value.trim();
    const subject = document.getElementById('cf-subject').value.trim();
    const message = document.getElementById('cf-message').value.trim();
    const btn = form.querySelector('button[type="submit"]');
    const original = btn.textContent;

    btn.textContent = translations.lang === 'en' ? 'Sending...' : 'Gönderiliyor...';
    btn.disabled = true;

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message })
      });
      if (!res.ok) throw new Error();
      btn.textContent = translations.lang === 'en' ? 'Sent! ✓' : 'Gönderildi! ✓';
      btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
      form.reset();
    } catch {
      btn.textContent = translations.lang === 'en' ? 'Error. Try again.' : 'Hata. Tekrar dene.';
      btn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
      btn.disabled = false;
    }

    setTimeout(() => {
      btn.textContent = original;
      btn.style.background = '';
      btn.disabled = false;
    }, 3500);
  });
}

// ─── SMOOTH ANCHOR SCROLL ───
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', e => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    const offset = 70;
    const top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  });
});

// ─── TERMINAL TYPEWRITER ───
const terminalLines = document.querySelectorAll('.terminal-line');
terminalLines.forEach((line, i) => {
  line.style.opacity = '0';
  line.style.transition = 'opacity 0.3s';
  setTimeout(() => { line.style.opacity = '1'; }, 300 + i * 180);
});