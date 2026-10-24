export const BLANK_RELOAD_KEY = 'shribely-blank-reload';
export const SW_RELOAD_KEY = 'shribely-sw-reload';

// The early script in index.html uses these same rules so the first paint
// agrees with the check that runs when the Home Screen app comes back.
export function screenFill(screenH, innerH) {
  const screen = Number(screenH) || 0;
  const inner = Number(innerH) || 0;
  const sane = screen > 0 && screen <= 1600;
  if (inner > 0 && sane && screen < inner * 2) return `${screen}px`;
  if (inner > 0) return '100vh';
  if (sane) return `${screen}px`;
  return '';
}

export function isHomeScreen(nav, matchMedia) {
  if (nav?.standalone === true) return true;
  try {
    return matchMedia?.('(display-mode: standalone)')?.matches === true;
  } catch {
    return false;
  }
}

export function shouldReloadOnControllerChange({ homeScreen, hadController, alreadyReloaded }) {
  return hadController === true && homeScreen !== true && alreadyReloaded !== true;
}

export function shouldRecoverBlankPage({ homeScreen, childCount, alreadyRetried }) {
  return homeScreen === true && !(childCount > 0) && alreadyRetried !== true;
}

function readFlag(storage, key) {
  try { return storage?.getItem(key) === '1'; } catch { return false; }
}

function writeFlag(storage, key) {
  try { storage?.setItem(key, '1'); } catch { /* private mode */ }
}

function clearFlag(storage, key) {
  try { storage?.removeItem(key); } catch { /* private mode */ }
}

export function installPwaResume(target = window) {
  const doc = target.document;
  const nav = target.navigator;
  const storage = target.sessionStorage;
  const home = () => isHomeScreen(nav, target.matchMedia?.bind(target));

  const pin = () => {
    if (!home()) return;
    const fill = screenFill(target.screen?.height, target.innerHeight);
    if (!fill) return;
    doc.documentElement.classList.add('home-screen');
    doc.documentElement.style.setProperty('--screen-fill', fill);
  };

  if (nav?.serviceWorker) {
    let hadController = !!nav.serviceWorker.controller;
    nav.serviceWorker.addEventListener('controllerchange', () => {
      const previous = hadController;
      hadController = true;
      if (!shouldReloadOnControllerChange({
        homeScreen: home(),
        hadController: previous,
        alreadyReloaded: readFlag(storage, SW_RELOAD_KEY),
      })) return;
      writeFlag(storage, SW_RELOAD_KEY);
      target.location.reload();
    });
    if (readFlag(storage, SW_RELOAD_KEY)) {
      target.setTimeout(() => clearFlag(storage, SW_RELOAD_KEY), 10000);
    }

    // Ask for an update only after the page has been on screen. Checking
    // during the resume itself is what made iOS replace the page with a blank one.
    let updateTimer = 0;
    const scheduleUpdate = () => {
      clearTimeout(updateTimer);
      if (doc.visibilityState !== 'visible') return;
      updateTimer = target.setTimeout(() => {
        if (doc.visibilityState !== 'visible') return;
        nav.serviceWorker.getRegistration?.().then((reg) => reg?.update()).catch(() => {});
      }, 4000);
    };
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'hidden') clearTimeout(updateTimer);
      else scheduleUpdate();
    });
  }

  let leftAt = 0;
  const recover = () => {
    const root = doc.getElementById('root');
    const childCount = root ? root.childElementCount : 0;
    if (childCount > 0) clearFlag(storage, BLANK_RELOAD_KEY);
    if (!shouldRecoverBlankPage({
      homeScreen: home(),
      childCount,
      alreadyRetried: readFlag(storage, BLANK_RELOAD_KEY),
    })) return;
    writeFlag(storage, BLANK_RELOAD_KEY);
    target.location.reload();
  };

  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') {
      leftAt = Date.now();
      return;
    }
    if (!leftAt) return;
    pin();
    target.setTimeout(pin, 50);
    target.setTimeout(pin, 300);
    target.setTimeout(recover, 400);
  });

  target.addEventListener('pageshow', (event) => {
    pin();
    if (event?.persisted) recover();
  });
}
