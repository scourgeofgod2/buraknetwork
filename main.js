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

// ─── TERMINAL TYPEWRITER FUNCTION ───
function runTypewriter(container, delayStart) {
  const lines = container.querySelectorAll('.terminal-line');
  if (!lines.length) return;

  const lineData = Array.from(lines).map(el => {
    const html = el.innerHTML;
    el.innerHTML = '';
    el.style.opacity = '1';
    el.style.minHeight = '1.4em';
    return { el, html };
  });

  function typeHTML(el, html, done) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const nodes = Array.from(temp.childNodes);
    let nodeIdx = 0;
    let charIdx = 0;
    function next() {
      if (nodeIdx >= nodes.length) { if (done) done(); return; }
      const node = nodes[nodeIdx];
      if (node.nodeType === 3) {
        const text = node.textContent;
        if (charIdx < text.length) {
          if (!el._textNode || el._textNode._nodeIdx !== nodeIdx) {
            el._textNode = document.createTextNode('');
            el._textNode._nodeIdx = nodeIdx;
            el.appendChild(el._textNode);
          }
          el._textNode.textContent += text[charIdx];
          charIdx++;
          setTimeout(next, 22);
        } else { nodeIdx++; charIdx = 0; setTimeout(next, 8); }
      } else {
        el.appendChild(node.cloneNode(true));
        nodeIdx++; charIdx = 0; setTimeout(next, 8);
      }
    }
    next();
  }

  let idx = 0;
  function nextLine() {
    if (idx >= lineData.length) return;
    const { el, html } = lineData[idx++];
    if (el.classList.contains('t-cursor')) { el.innerHTML = html; return; }
    typeHTML(el, html, () => setTimeout(nextLine, 100));
  }
  setTimeout(nextLine, delayStart);
}

// ─── HERO TERMINAL ───
const heroTerminal = document.querySelector('.terminal-card');
if (heroTerminal) runTypewriter(heroTerminal, 1200);

// ─── ABOUT TERMINAL (scroll'a girince başlar) ───
const aboutTerminal = document.getElementById('aboutTerminal');
if (aboutTerminal) {
  let aboutStarted = false;
  const aboutObs = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && !aboutStarted) {
      aboutStarted = true;
      runTypewriter(aboutTerminal, 200);
      aboutObs.disconnect();
    }
  }, { threshold: 0.3 });
  aboutObs.observe(aboutTerminal);
}