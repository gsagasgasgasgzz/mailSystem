(() => {
  'use strict';

  const root = document.documentElement;
  const button = document.getElementById('themeToggle');
  const storageKey = 'hogworld-theme-preference';
  const storedTheme = (() => {
    try {
      return localStorage.getItem(storageKey);
    } catch (error) {
      console.warn('Unable to read the saved theme preference.', error);
      return null;
    }
  })();
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  function applyTheme(theme) {
    const dark = theme === 'dark';
    root.dataset.theme = dark ? 'dark' : 'light';
    button.textContent = dark ? '☀️ โหมดสว่าง' : '🌙 โหมดมืด';
    button.setAttribute('aria-label', dark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด');
    button.setAttribute('aria-pressed', String(dark));
  }

  applyTheme(storedTheme === 'dark' || storedTheme === 'light'
    ? storedTheme
    : systemPrefersDark ? 'dark' : 'light');

  button.addEventListener('click', () => {
    const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(theme);
    try {
      localStorage.setItem(storageKey, theme);
    } catch (error) {
      console.warn('Unable to save the theme preference.', error);
    }
  });
})();
