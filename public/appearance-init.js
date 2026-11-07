// Applied before React mounts to prevent a light-frame flash for people
// who chose Dark or whose device is dark in System mode. Deliberately a
// same-origin external file: the production Content-Security-Policy forbids
// 'unsafe-inline', and should stay that way.
(function () {
  var mode = null, legacy = null;
  try {
    mode = localStorage.getItem('blaze_theme_mode');
    legacy = localStorage.getItem('blaze_dark_mode');
  } catch (_) {
    // Storage restrictions must not prevent following device appearance.
  }
  var systemDark = typeof matchMedia === 'function'
    && matchMedia('(prefers-color-scheme: dark)').matches;
  var dark = mode === 'dark' || (mode === 'system' && systemDark)
    || ((mode !== 'light' && mode !== 'dark' && mode !== 'system')
      && (legacy === 'true' || (legacy !== 'false' && systemDark)));
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
})();
