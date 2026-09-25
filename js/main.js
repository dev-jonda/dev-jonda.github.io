'use strict';

const DISCORD_ID = '804038889299247135';
const root = document.documentElement;
const themeButton = document.getElementById('theme-toggle');
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
let chosenTheme = null;
try { chosenTheme = localStorage.getItem('theme'); } catch (_) { /* Úložiště může být blokované. */ }
if (!['light', 'dark'].includes(chosenTheme)) chosenTheme = null;

function applyTheme(theme) {
  root.dataset.theme = theme;
  themeButton.setAttribute('aria-pressed', String(theme === 'dark'));
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#141813' : '#f5f5ef';
}
applyTheme(chosenTheme || (systemTheme.matches ? 'dark' : 'light'));
themeButton.hidden = false;
themeButton.addEventListener('click', () => {
  chosenTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(chosenTheme);
  try { localStorage.setItem('theme', chosenTheme); } catch (_) { /* Téma funguje i bez uložení. */ }
});
systemTheme.addEventListener('change', event => {
  if (!chosenTheme) applyTheme(event.matches ? 'dark' : 'light');
});
document.getElementById('year').textContent = new Date().getFullYear();

// Obsah zůstává viditelný bez JS i při preferenci omezeného pohybu.
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
if ('IntersectionObserver' in window && !motion.matches) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.remove('is-pending');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });
  document.querySelectorAll('.reveal').forEach(section => {
    section.classList.add('is-pending');
    observer.observe(section);
  });
  motion.addEventListener('change', event => {
    if (event.matches) {
      document.querySelectorAll('.is-pending').forEach(section => section.classList.remove('is-pending'));
      observer.disconnect();
    }
  });
}

const copyButton = document.getElementById('copy-email');
const copyMessage = document.getElementById('copy-message');
let copyTimer;
copyButton.hidden = false;
copyButton.addEventListener('click', async () => {
  clearTimeout(copyTimer);
  const email = copyButton.dataset.email;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(email);
    } else {
      // Fallback také pro lokální náhled bez HTTPS.
      const field = document.createElement('textarea');
      field.value = email;
      field.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.append(field);
      field.select();
      let copied;
      try { copied = document.execCommand('copy'); } finally { field.remove(); copyButton.focus(); }
      if (!copied) throw new Error('Clipboard unavailable');
    }
    copyMessage.textContent = 'Zkopírováno!';
    copyTimer = setTimeout(() => { copyMessage.textContent = ''; }, 3500);
  } catch (_) {
    copyMessage.textContent = `Kopírování není dostupné. Označ a zkopíruj adresu ${email}.`;
  }
});

// REST API Lanyardu; textContent bezpečně zobrazuje i názvy aktivit z API.
const presence = document.getElementById('discord-status');
const presenceText = document.getElementById('discord-text');
let presenceBusy = false;
async function updatePresence() {
  if (document.hidden || presenceBusy) return;
  presenceBusy = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://api.lanyard.rest/v1/users/${DISCORD_ID}`, { signal: controller.signal });
    if (!response.ok) throw new Error('Lanyard HTTP error');
    const result = await response.json();
    if (!result.success || !result.data) throw new Error('Lanyard unavailable');
    const data = result.data;
    const labels = { online: 'Online', idle: 'Neaktivní', dnd: 'Nerušit', offline: 'Offline' };
    if (!labels[data.discord_status]) throw new Error('Unknown status');
    presence.dataset.status = data.discord_status;
    let activity = '';
    if (data.discord_status !== 'offline') {
      if (data.listening_to_spotify && data.spotify) activity = ` · Poslouchám ${data.spotify.song} — ${data.spotify.artist}`;
      else {
        const game = Array.isArray(data.activities) ? data.activities.find(item => item.type === 0) : null;
        if (game) activity = ` · Hraju ${game.name}`;
      }
    }
    presenceText.textContent = `Discord · ${labels[data.discord_status]}${activity}`;
  } catch (_) {
    presence.dataset.status = 'unknown';
    presenceText.textContent = 'Discord · stav nedostupný';
  } finally {
    clearTimeout(timeout);
    presenceBusy = false;
  }
}
updatePresence();
setInterval(updatePresence, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) updatePresence(); });

const form = document.getElementById('contact-form');
const submitButton = form.querySelector('[type="submit"]');
const formStatus = document.getElementById('form-status');
let sending = false;
function showFormStatus(message, state) {
  formStatus.textContent = message;
  formStatus.dataset.state = state;
}
// Listener je připojen dříve, než se tlačítko aktivuje. Žádné přesměrování.
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (sending || !form.reportValidity()) return;
  if (form.elements.botcheck.checked) return;
  const key = form.elements.access_key.value.trim();
  if (!key || key === 'TVUJ_WEB3FORMS_KLIC_ZDE') {
    showFormStatus('Formulář zatím není aktivní. Napiš mi prosím na jonas@jonasbouse.cz.', 'error');
    return;
  }
  sending = true;
  submitButton.disabled = true;
  const buttonContent = submitButton.innerHTML;
  submitButton.textContent = 'Odesílám…';
  form.setAttribute('aria-busy', 'true');
  showFormStatus('Odesílám zprávu…', 'pending');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  // Během odesílání se text nemění, aby reset nesmazal nově rozepsanou zprávu.
  const editable = [...form.querySelectorAll('input:not([type="hidden"],[type="checkbox"]), textarea')];
  const payload = Object.fromEntries(new FormData(form));
  payload.access_key = key;
  editable.forEach(field => { field.readOnly = true; });
  try {
    const response = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const result = await response.json();
    if (!response.ok || result.success !== true) throw new Error('Submission failed');
    form.reset();
    showFormStatus('Zpráva odeslána. Díky, ozvu se ti!', 'success');
  } catch (error) {
    showFormStatus(error.name === 'AbortError'
      ? 'Potvrzení nedorazilo včas. Zpráva mohla být odeslána. Případně mi napiš e-mailem.'
      : 'Odeslání se nepodařilo potvrdit. Text zůstává vyplněný. Zkus to později nebo mi napiš e-mailem.', 'error');
  } finally {
    clearTimeout(timeout);
    sending = false;
    submitButton.disabled = false;
    submitButton.innerHTML = buttonContent;
    form.removeAttribute('aria-busy');
    editable.forEach(field => { field.readOnly = false; });
  }
});
submitButton.disabled = false;
