import assert from 'node:assert/strict';
import test from 'node:test';
import {
  installPwaResume,
  screenFill,
  shouldRecoverBlankPage,
  shouldReloadOnControllerChange,
} from './pwaResume.js';

test('a restored phone viewport keeps a real height', () => {
  assert.equal(screenFill(852, 780), '852px');
  assert.equal(screenFill(852, 0), '852px');
  assert.equal(screenFill(2436, 812), '100vh');
  assert.equal(screenFill(2436, 0), '');
  assert.equal(screenFill(0, 0), '');
});

test('a service worker update reloads a browser tab and leaves the Home Screen app up', () => {
  assert.equal(shouldReloadOnControllerChange({
    homeScreen: false,
    hadController: true,
    alreadyReloaded: false,
  }), true);
  assert.equal(shouldReloadOnControllerChange({
    homeScreen: true,
    hadController: true,
    alreadyReloaded: false,
  }), false);
  assert.equal(shouldReloadOnControllerChange({
    homeScreen: false,
    hadController: false,
    alreadyReloaded: false,
  }), false);
  assert.equal(shouldReloadOnControllerChange({
    homeScreen: false,
    hadController: true,
    alreadyReloaded: true,
  }), false);
});

test('a blank Home Screen document reloads once', () => {
  assert.equal(shouldRecoverBlankPage({ homeScreen: true, childCount: 0, alreadyRetried: false }), true);
  assert.equal(shouldRecoverBlankPage({ homeScreen: true, childCount: 2, alreadyRetried: false }), false);
  assert.equal(shouldRecoverBlankPage({ homeScreen: true, childCount: 0, alreadyRetried: true }), false);
  assert.equal(shouldRecoverBlankPage({ homeScreen: false, childCount: 0, alreadyRetried: false }), false);
});

function fakeWindow({ standalone = false, hadController = true, childCount = 2 } = {}) {
  const listeners = {};
  const swListeners = {};
  let visibility = 'visible';
  const storage = new Map();
  const timers = [];
  let reloads = 0;
  let updates = 0;
  const target = {
    timers,
    get reloads() { return reloads; },
    get updates() { return updates; },
    innerHeight: 780,
    screen: { height: 852 },
    navigator: {
      standalone,
      serviceWorker: {
        controller: hadController ? {} : null,
        addEventListener(type, fn) { swListeners[type] = fn; },
        getRegistration: () => Promise.resolve({ update: () => { updates += 1; } }),
      },
    },
    document: {
      documentElement: { classList: { add() {} }, style: { setProperty() {} } },
      get visibilityState() { return visibility; },
      getElementById: () => ({ childElementCount: childCount }),
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    },
    sessionStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    location: { reload: () => { reloads += 1; } },
    matchMedia: () => ({ matches: false }),
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    setTimeout(fn) { timers.push(fn); return timers.length; },
    clearTimeout() {},
    hide() {
      visibility = 'hidden';
      for (const fn of listeners.visibilitychange || []) fn();
    },
    show() {
      visibility = 'visible';
      for (const fn of listeners.visibilitychange || []) fn();
    },
    claim() { swListeners.controllerchange?.(); },
    setChildren(count) { childCount = count; },
  };
  return target;
}

test('coming back to the Home Screen app does not reload a page that is still there', async () => {
  const target = fakeWindow({ standalone: true, childCount: 4 });
  installPwaResume(target);
  target.claim();
  target.hide();
  target.show();
  for (const timer of target.timers) timer();
  assert.equal(target.reloads, 0);
  await Promise.resolve();
  assert.equal(target.updates, 1);
});

test('coming back to an empty Home Screen document reloads once', () => {
  const target = fakeWindow({ standalone: true, childCount: 0 });
  installPwaResume(target);
  target.hide();
  target.show();
  for (const timer of target.timers) timer();
  assert.equal(target.reloads, 1);
  target.hide();
  target.show();
  for (const timer of target.timers) timer();
  assert.equal(target.reloads, 1);
});

test('the first service worker claim does not reload a browser tab', () => {
  const target = fakeWindow({ standalone: false, hadController: false });
  installPwaResume(target);
  target.claim();
  assert.equal(target.reloads, 0);
  target.navigator.serviceWorker.controller = {};
  target.claim();
  assert.equal(target.reloads, 1);
});
