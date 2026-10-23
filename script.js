const header = document.querySelector('[data-header]');
const menuToggle = document.querySelector('[data-menu-toggle]');
const nav = document.querySelector('[data-nav]');

const updateHeader = () => {
  header?.classList.toggle('is-scrolled', window.scrollY > 12);
};

updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

const closeMenu = () => {
  if (!menuToggle || !nav) return;
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Open navigation');
  nav.classList.remove('is-open');
  document.body.classList.remove('menu-open');
};

menuToggle?.addEventListener('click', () => {
  const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Open navigation' : 'Close navigation');
  nav?.classList.toggle('is-open', !isOpen);
  document.body.classList.toggle('menu-open', !isOpen);
});

nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenu();
});
window.addEventListener('resize', () => {
  if (window.innerWidth > 860) closeMenu();
});

const copyButton = document.querySelector('[data-copy-email]');
copyButton?.addEventListener('click', async () => {
  const email = copyButton.dataset.copyEmail;
  if (!email) return;

  try {
    await navigator.clipboard.writeText(email);
    copyButton.textContent = 'Email copied';
  } catch {
    const textArea = document.createElement('textarea');
    textArea.value = email;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    const copied = document.execCommand('copy');
    textArea.remove();
    copyButton.textContent = copied ? 'Email copied' : email;
  }

  window.setTimeout(() => {
    copyButton.textContent = 'Copy email';
  }, 2500);
});

const projectForm = document.querySelector('#project-form');
projectForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!projectForm.reportValidity()) return;

  const data = new FormData(projectForm);
  const name = String(data.get('name') || '').trim();
  const business = String(data.get('business') || '').trim();
  const service = String(data.get('service') || '').trim();
  const message = String(data.get('message') || '').trim();
  const recipient = projectForm.dataset.recipient;

  const subject = `Project enquiry — ${business || name}`;
  const body = [
    'Hi Ankit,',
    '',
    message,
    '',
    '— Project details —',
    `Name: ${name}`,
    `Business: ${business || 'Not provided'}`,
    `Service: ${service}`,
  ].join('\n');

  const status = projectForm.querySelector('[data-form-status]');
  if (status) status.textContent = 'Opening your email app…';

  window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});

document.querySelectorAll('[data-year]').forEach((element) => {
  element.textContent = String(new Date().getFullYear());
});
