/** Password reveal controls. Never reads, stores or changes a secret value. */
export function installPasswordVisibility(doc = document) {
  const win = doc.defaultView;
  if (!win || doc.documentElement.dataset.passwordVisibilityInstalled) return () => {};
  doc.documentElement.dataset.passwordVisibilityInstalled = 'true';
  const controls = new Map();
  let serial = 0;
  const russian = !/^en(?:-|$)/i.test(doc.documentElement.lang);
  const caption = russian ? 'Показать пароль' : 'Show password';
  function setVisible(input, button, visible) {
    input.type = visible ? 'text' : 'password';
    button.setAttribute('aria-checked', String(visible));
    button.querySelector('.pw-reveal-check').textContent = visible ? '✓' : '';
  }
  function sync() {
    for (const [input, button] of controls) {
      if (!input.isConnected || !button.isConnected) {
        if (input.isConnected) input.type = 'password';
        button.remove(); controls.delete(input);
      } else {
        if (button.disabled !== input.disabled) button.disabled = input.disabled;
      }
    }
    for (const input of doc.querySelectorAll('input[type="password"]')) {
      if (controls.has(input)) continue;
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'pw-reveal-toggle';
      button.setAttribute('role', 'checkbox');
      button.setAttribute('aria-checked', 'false');
      if (!input.id) {
        do { serial += 1; input.id = 'pw-reveal-field-' + serial; }
        while (doc.querySelectorAll('[id="' + input.id + '"]').length > 1);
      }
      button.setAttribute('aria-controls', input.id);
      // Capture the original field label before inserting the control into it.
      const label = input.getAttribute('aria-label') || input.labels?.[0]?.textContent?.trim();
      if (label) button.setAttribute('aria-label', caption + ': ' + label);
      const check = doc.createElement('span');
      check.className = 'pw-reveal-check'; check.setAttribute('aria-hidden', 'true');
      const eye = doc.createElement('span');
      eye.textContent = '👁'; eye.setAttribute('aria-hidden', 'true');
      const text = doc.createElement('span'); text.textContent = caption;
      button.append(check, eye, text);
      if (button.disabled !== input.disabled) button.disabled = input.disabled;
      button.addEventListener('click', event => {
        // A button nested in an existing field label must not activate that label,
        // submit a form, or invalidate autosave/preflight via input/change events.
        event.preventDefault(); event.stopPropagation();
        setVisible(input, button, button.getAttribute('aria-checked') !== 'true');
      });
      controls.set(input, button);
      input.insertAdjacentElement('afterend', button);
    }
  }
  function conceal() {
    for (const [input, button] of controls) setVisible(input, button, false);
  }
  function visibility() { if (doc.hidden) conceal(); }
  const observer = new win.MutationObserver(sync);
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['type', 'disabled'] });
  doc.addEventListener('visibilitychange', visibility);
  doc.addEventListener('reset', conceal, true);
  win.addEventListener('pagehide', conceal);
  sync();
  return () => {
    observer.disconnect(); conceal();
    for (const button of controls.values()) button.remove();
    controls.clear();
    doc.removeEventListener('visibilitychange', visibility);
    doc.removeEventListener('reset', conceal, true);
    win.removeEventListener('pagehide', conceal);
    delete doc.documentElement.dataset.passwordVisibilityInstalled;
  };
}
