// Captures a screenshot thumbnail of a URL by opening it in a popup window,
// waiting for it to render, then snapping the visible tab.

const DEFAULT_SCREENSHOT_DELAY_MS = 1500;

// Thumbnails only ever display at a few hundred CSS px (tile width is capped
// at 400px in settings), so there's no point storing a full 1280x800 capture.
// Re-encoding to WebP at a capped resolution keeps visual quality at the
// sizes it's actually shown at while cutting both storage size and the time
// the browser spends decoding it on every new tab page load.
const THUMB_MAX_DIMENSION = 640;
const THUMB_WEBP_QUALITY = 0.82;

// The capture window needs real OS focus to reliably render (an unfocused/
// occluded popup can be left un-painted by the window manager on some
// machines, producing blank captures), so only one capture window can
// meaningfully exist at a time — two focused windows would just fight each
// other for focus. Captures are fully serialized.
const MAX_CONCURRENT_CAPTURES = 1;
let activeCaptures = 0;
const captureWaiters = [];

function acquireCaptureSlot() {
  if (activeCaptures < MAX_CONCURRENT_CAPTURES) {
    activeCaptures++;
    return Promise.resolve();
  }
  return new Promise((resolve) => captureWaiters.push(resolve));
}

function releaseCaptureSlot() {
  const next = captureWaiters.shift();
  if (next) next();
  else activeCaptures--;
}

// captureVisibleTab occasionally fails with "image readback failed" — a
// transient GPU/compositor hiccup right after a window/focus change — that
// normally succeeds a moment later, so retry a few times before giving up.
async function captureVisibleTabWithRetry(windowId, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
    } catch (err) {
      if (i === attempts - 1 || !String(err).includes("image readback failed")) throw err;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}

let snapshotLock = Promise.resolve();
function takeSnapshot(windowId) {
  const result = snapshotLock.then(async () => {
    const dataUrl = await captureVisibleTabWithRetry(windowId);
    await new Promise((r) => setTimeout(r, 600)); // stay comfortably under ~2 calls/sec
    return dataUrl;
  });
  snapshotLock = result.then(() => {}, () => {}); // keep the lock alive even if this capture fails
  return result;
}

async function captureUrl(url, delayMs) {
  await acquireCaptureSlot();
  let win;
  try {
    // Chrome rejects window bounds that put less than 50% of the window
    // within visible screen space ("Invalid value for bounds"), so the old
    // fully off-screen popup (left: -3000) is no longer possible. A
    // minimize/restore dance was tried next, but restoring from "minimized"
    // to "normal" grabbed OS focus anyway (at least in Brave on Windows),
    // kicking the new-tab page into the background and getting it
    // reloaded/discarded — which re-ran render() and re-queued every tile
    // forever. And even a plain unfocused popup (focused: false) was
    // sometimes left un-rendered by the window manager, producing blank
    // captures, since nothing forced the OS to actually paint it.
    // So: give the window real focus up front. It will visibly flash for
    // the duration of the load + screenshot delay, but that's the only
    // combination that reliably renders on every machine.
    win = await chrome.windows.create({
      url,
      focused: true,
      type: "popup",
      width: 1280,
      height: 800
    });

    const tab = win.tabs[0];

    await waitForTabComplete(tab.id);
    // Give scripts/images extra time to paint after "complete" — some sites
    // (e.g. Disney+) keep showing a loading spinner well after onload fires.
    const wait = Number.isFinite(delayMs) ? delayMs : DEFAULT_SCREENSHOT_DELAY_MS;
    await new Promise((r) => setTimeout(r, wait));

    // Capture lossless (format/quality only matter for jpeg) so the WebP
    // re-encode below is the only lossy generation, instead of compressing twice.
    const rawDataUrl = await takeSnapshot(win.id);
    return await resizeAndEncode(rawDataUrl, THUMB_MAX_DIMENSION, THUMB_WEBP_QUALITY);
  } finally {
    if (win) {
      try { await chrome.windows.remove(win.id); } catch (e) {}
    }
    releaseCaptureSlot();
  }
}

async function resizeAndEncode(dataUrl, maxDimension, quality) {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    const outBlob = await canvas.convertToBlob({ type: "image/webp", quality });
    return await blobToDataUrl(outBlob);
  } catch (err) {
    // OffscreenCanvas/WebP encoding should be supported in any modern Chrome,
    // but fall back to the original capture rather than losing the thumbnail.
    return dataUrl;
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not encode thumbnail"));
    reader.readAsDataURL(blob);
  });
}

function waitForTabComplete(tabId, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };

    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === "complete") finish();
    };
    chrome.tabs.onUpdated.addListener(listener);

    chrome.tabs.get(tabId, (tab) => {
      if (tab && tab.status === "complete") finish();
    });

    setTimeout(finish, timeoutMs);
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "capture") {
    captureUrl(msg.url, msg.delayMs)
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((err) => {
        console.error("[thumbnail] capture failed:", err);
        sendResponse({ ok: false, error: String(err) });
      });
    return true; // async response
  }
});

// --- Bing "photo of the day" auto-refresh, checked at most once per day. ---

const BING_ALARM_NAME = "bingDailyCheck";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchTodaysBingImage() {
  const res = await fetch("https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-US");
  const data = await res.json();
  const img = (data.images || [])[0];
  if (!img) throw new Error("No image returned");
  return `https://www.bing.com${img.url}&w=1920&h=1080`;
}

async function checkBingDaily() {
  // Settings live in chrome.storage.sync; fall back to local for installs
  // that haven't opened a new tab yet to run the one-time migration.
  const syncData = await chrome.storage.sync.get("settings");
  const localData = syncData.settings ? null : await chrome.storage.local.get("settings");
  const settings = syncData.settings || (localData && localData.settings);
  if (!settings || !settings.bingDailyEnabled) return;
  if (settings.bingLastDate === todayKey()) return; // already updated today

  try {
    const url = await fetchTodaysBingImage();
    settings.bgImage = url;
    settings.bingLastDate = todayKey();
    try {
      await chrome.storage.sync.set({ settings });
    } catch (err) {
      await chrome.storage.local.set({ settings });
    }
  } catch (err) {
    // Will retry on the next alarm tick.
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(BING_ALARM_NAME, { periodInMinutes: 60 });
  checkBingDaily();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(BING_ALARM_NAME, { periodInMinutes: 60 });
  checkBingDaily();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === BING_ALARM_NAME) checkBingDaily();
});
