const DEFAULT_TILES = [
  { id: "youtube", name: "Youtube", url: "https://www.youtube.com" },
  { id: "google", name: "Google", url: "https://www.google.com" },
  { id: "gmail", name: "Gmail", url: "https://mail.google.com" },
  { id: "facebook", name: "Facebook", url: "https://www.facebook.com" }
];

const DEFAULT_SETTINGS = {
  theme: "light",
  bgColorLight: "#f1f1f1",
  bgColorDark: "#202124",
  bgImage: "",
  spacing: 18,
  tileWidth: 250,
  tileHeight: 140,
  titlePadding: 10,
  pagePadding: 20,
  tilesPerRow: 0, // 0 = auto (fit as many as the available width allows)
  bingDailyEnabled: false,
  bingLastDate: "",
  screenshotDelay: 1500,
  dockPosition: "bottom"
};

const dock = document.getElementById("dock");
const dockOverlay = document.getElementById("dockOverlay");
const dockModalTitle = document.getElementById("dockModalTitle");
const dockUrlInput = document.getElementById("dockUrlInput");
const dockSaveBtn = document.getElementById("dockSaveBtn");
const dockCancelBtn = document.getElementById("dockCancelBtn");
const dockDeleteBtn = document.getElementById("dockDeleteBtn");
const dockPosBottomBtn = document.getElementById("dockPosBottomBtn");
const dockPosTopBtn = document.getElementById("dockPosTopBtn");
const dockPosLeftBtn = document.getElementById("dockPosLeftBtn");
const dockPosRightBtn = document.getElementById("dockPosRightBtn");
const dockContextMenu = document.getElementById("dockContextMenu");
const dockContextEditBtn = document.getElementById("dockContextEditBtn");

const grid = document.getElementById("grid");
const optionsBtn = document.getElementById("optionsBtn");
const overlay = document.getElementById("overlay");
const modalTitle = document.getElementById("modalTitle");
const nameInput = document.getElementById("nameInput");
const urlInput = document.getElementById("urlInput");
const saveBtn = document.getElementById("saveBtn");
const cancelBtn = document.getElementById("cancelBtn");
const deleteBtn = document.getElementById("deleteBtn");
const thumbPreview = document.getElementById("thumbPreview");
const uploadThumbBtn = document.getElementById("uploadThumbBtn");
const removeThumbBtn = document.getElementById("removeThumbBtn");
const thumbFileInput = document.getElementById("thumbFileInput");

const settingsPanel = document.getElementById("settingsPanel");
const settingsBackdrop = document.getElementById("settingsBackdrop");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const lightThemeBtn = document.getElementById("lightThemeBtn");
const darkThemeBtn = document.getElementById("darkThemeBtn");
const bgColorLightInput = document.getElementById("bgColorLight");
const bgColorDarkInput = document.getElementById("bgColorDark");
const loadBingBtn = document.getElementById("loadBingBtn");
const bingDailyToggle = document.getElementById("bingDailyToggle");
const clearImageBtn = document.getElementById("clearImageBtn");
const imageGrid = document.getElementById("imageGrid");
const imageSearchInput = document.getElementById("imageSearchInput");
const imageSearchBtn = document.getElementById("imageSearchBtn");
const pexelsKeyRow = document.getElementById("pexelsKeyRow");
const pexelsKeyInput = document.getElementById("pexelsKeyInput");
const savePexelsKeyBtn = document.getElementById("savePexelsKeyBtn");
const spacingInput = document.getElementById("spacing");
const tileWidthInput = document.getElementById("tileWidth");
const tileHeightInput = document.getElementById("tileHeight");
const titlePaddingInput = document.getElementById("titlePadding");
const pagePaddingInput = document.getElementById("pagePadding");
const tilesPerRowInput = document.getElementById("tilesPerRow");
const spacingValue = document.getElementById("spacingValue");
const tileWidthValue = document.getElementById("tileWidthValue");
const tileHeightValue = document.getElementById("tileHeightValue");
const titlePaddingValue = document.getElementById("titlePaddingValue");
const pagePaddingValue = document.getElementById("pagePaddingValue");
const tilesPerRowValue = document.getElementById("tilesPerRowValue");
const screenshotDelayInput = document.getElementById("screenshotDelay");
const screenshotDelayValue = document.getElementById("screenshotDelayValue");
const resetBtn = document.getElementById("resetBtn");
const savedNote = document.getElementById("savedNote");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");

let tiles = [];
let dockItems = [];
let editingId = null; // null => adding new tile
let editingDockId = null; // null => adding new dock item
let contextMenuDockId = null;
let pendingThumbDataUrl = null; // set when the user picks a new image in the modal
let pendingThumbRemoved = false; // set when the user removes the custom thumbnail
let settings = { ...DEFAULT_SETTINGS };
let savedNoteTimer = null;
let draggedId = null;
let draggedDockId = null;
let lastDropAt = 0;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function debounce(fn, waitMs) {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
  debounced.flush = (...args) => {
    clearTimeout(timer);
    return fn(...args);
  };
  return debounced;
}

// Tiles and settings live in chrome.storage.sync so they follow the user
// across any Chrome profile they're signed into. Screenshots (thumbs) and
// the Pexels key stay in chrome.storage.local: thumbs are per-device capture
// results that would blow past sync's 8KB-per-item / 100KB-total quota, and
// there's no benefit to syncing a personal API key across machines.

async function loadTiles() {
  const syncData = await chrome.storage.sync.get("tiles");
  if (syncData.tiles) {
    tiles = syncData.tiles;
    return;
  }

  // One-time migration from the old local-only storage for existing installs.
  const localData = await chrome.storage.local.get("tiles");
  tiles = localData.tiles || DEFAULT_TILES;
  await persistTiles();
  if (localData.tiles) await chrome.storage.local.remove("tiles");
}

async function persistTiles() {
  try {
    await chrome.storage.sync.set({ tiles });
  } catch (err) {
    // Most likely the sync quota was exceeded (e.g. too many tiles, or very
    // long names/URLs). Fall back to local-only storage so nothing is lost.
    await chrome.storage.local.set({ tiles });
    alert(
      "Could not sync your tiles to your Chrome account (storage limit reached). " +
      "They were saved on this device only.\n\n" + err.message
    );
  }
}

async function saveTiles() {
  await persistTiles();
}

async function loadDockItems() {
  const syncData = await chrome.storage.sync.get("dockItems");
  if (syncData.dockItems) {
    dockItems = syncData.dockItems;
    return;
  }

  // One-time migration from the old local-only storage for existing installs.
  const localData = await chrome.storage.local.get("dockItems");
  dockItems = localData.dockItems || [];
  if (localData.dockItems) {
    await persistDockItems();
    await chrome.storage.local.remove("dockItems");
  }
}

async function persistDockItems() {
  try {
    await chrome.storage.sync.set({ dockItems });
  } catch (err) {
    await chrome.storage.local.set({ dockItems });
    alert(
      "Could not sync your dock icons to your Chrome account (storage limit reached). " +
      "They were saved on this device only.\n\n" + err.message
    );
  }
}

// Reads/writes of the shared "thumbs" object must be serialized: render()
// kicks off a capture for every tile that's missing a thumbnail without
// awaiting them, so on a fresh install several setThumb() calls can run
// concurrently. Without this queue, each does its own read-modify-write on
// the same object, and the slower call's write clobbers the faster one's —
// silently losing that tile's cached screenshot every time.
let thumbsQueue = Promise.resolve();
function withThumbsLock(fn) {
  const result = thumbsQueue.then(fn, fn);
  thumbsQueue = result.then(() => {}, () => {}); // keep the queue alive even if fn rejects
  return result;
}

async function getThumb(id) {
  return withThumbsLock(async () => {
    const data = await chrome.storage.local.get("thumbs");
    const thumbs = data.thumbs || {};
    return thumbs[id];
  });
}

async function setThumb(id, dataUrl) {
  return withThumbsLock(async () => {
    const data = await chrome.storage.local.get("thumbs");
    const thumbs = data.thumbs || {};
    thumbs[id] = { dataUrl, ts: Date.now() };
    await chrome.storage.local.set({ thumbs });
  });
}

async function loadSettings() {
  const syncData = await chrome.storage.sync.get("settings");
  if (syncData.settings) {
    settings = { ...DEFAULT_SETTINGS, ...syncData.settings };
    return;
  }

  // One-time migration from the old local-only storage for existing installs.
  const localData = await chrome.storage.local.get("settings");
  settings = { ...DEFAULT_SETTINGS, ...(localData.settings || {}) };
  await persistSettings.flush();
  if (localData.settings) await chrome.storage.local.remove("settings");
}

const persistSettings = debounce(async () => {
  try {
    await chrome.storage.sync.set({ settings });
  } catch (err) {
    // Likely a sync quota issue (e.g. a very large custom background image
    // URL). Fall back to local-only storage so the change isn't lost.
    await chrome.storage.local.set({ settings });
  }
}, 600);

// Flush any pending debounced write immediately before the page disappears.
window.addEventListener("pagehide", () => persistSettings.flush());

function applySettingsToPage() {
  const isDark = settings.theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  const root = document.documentElement.style;
  root.setProperty("--bg-color", isDark ? settings.bgColorDark : settings.bgColorLight);
  const safeBgImage = settings.bgImage && isHttpUrl(settings.bgImage) ? settings.bgImage : "";
  // Use CSS.escape so a URL containing a stray quote can't break out of url("...").
  root.setProperty("--bg-image", safeBgImage ? `url("${CSS.escape(safeBgImage)}")` : "none");
  root.setProperty("--gap", settings.spacing + "px");
  root.setProperty("--tile-w", settings.tileWidth + "px");
  root.setProperty("--tile-h", settings.tileHeight + "px");
  root.setProperty("--label-padding", settings.titlePadding + "px");
  root.setProperty("--page-padding", settings.pagePadding + "px");
  root.setProperty("--tiles-per-row", settings.tilesPerRow > 0 ? settings.tilesPerRow : "auto-fill");

  const validPositions = ["bottom", "top", "left", "right"];
  const dockPos = validPositions.includes(settings.dockPosition) ? settings.dockPosition : "bottom";
  document.documentElement.dataset.dockPos = dockPos;
  dock.classList.remove("dock-pos-bottom", "dock-pos-top", "dock-pos-left", "dock-pos-right");
  dock.classList.add(`dock-pos-${dockPos}`);
}

async function saveSettings() {
  applySettingsToPage();
  persistSettings(); // debounced write to chrome.storage.sync
  savedNote.classList.remove("hidden");
  clearTimeout(savedNoteTimer);
  savedNoteTimer = setTimeout(() => savedNote.classList.add("hidden"), 1200);
}

function syncSettingsControls() {
  bgColorLightInput.value = settings.bgColorLight;
  bgColorDarkInput.value = settings.bgColorDark;
  spacingInput.value = settings.spacing;
  tileWidthInput.value = settings.tileWidth;
  tileHeightInput.value = settings.tileHeight;
  titlePaddingInput.value = settings.titlePadding;
  pagePaddingInput.value = settings.pagePadding;
  tilesPerRowInput.value = settings.tilesPerRow;
  spacingValue.textContent = settings.spacing + "px";
  tileWidthValue.textContent = settings.tileWidth + "px";
  tileHeightValue.textContent = settings.tileHeight + "px";
  titlePaddingValue.textContent = settings.titlePadding + "px";
  pagePaddingValue.textContent = settings.pagePadding + "px";
  tilesPerRowValue.textContent = settings.tilesPerRow > 0 ? settings.tilesPerRow : "Auto";
  screenshotDelayInput.value = settings.screenshotDelay;
  screenshotDelayValue.textContent = (settings.screenshotDelay / 1000).toFixed(2).replace(/\.?0+$/, "") + "s";
  bingDailyToggle.checked = settings.bingDailyEnabled;
  lightThemeBtn.classList.toggle("active", settings.theme !== "dark");
  darkThemeBtn.classList.toggle("active", settings.theme === "dark");

  const dockPos = settings.dockPosition || "bottom";
  dockPosBottomBtn.classList.toggle("active", dockPos === "bottom");
  dockPosTopBtn.classList.toggle("active", dockPos === "top");
  dockPosLeftBtn.classList.toggle("active", dockPos === "left");
  dockPosRightBtn.classList.toggle("active", dockPos === "right");

  [...imageGrid.querySelectorAll("img")].forEach((img) => {
    img.classList.toggle("selected", img.dataset.full === settings.bgImage);
  });
}

// Settings and tiles are written to chrome.storage.sync, so this fires both
// for our own writes and for changes that arrive from another signed-in
// device — re-render either way so multiple open new tab pages stay in sync.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;

  if (changes.settings) {
    settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
    applySettingsToPage();
    syncSettingsControls();
  }

  if (changes.tiles) {
    tiles = changes.tiles.newValue || DEFAULT_TILES;
    render();
  }

  if (changes.dockItems) {
    dockItems = changes.dockItems.newValue || [];
    renderDock();
  }
});

function openSettings() {
  settingsPanel.classList.add("open");
  settingsBackdrop.classList.remove("hidden");
}

function closeSettings() {
  settingsPanel.classList.remove("open");
  settingsBackdrop.classList.add("hidden");
  persistSettings.flush(); // don't leave unsaved changes sitting in the debounce window
}

optionsBtn.addEventListener("click", openSettings);
closeSettingsBtn.addEventListener("click", closeSettings);
settingsBackdrop.addEventListener("click", closeSettings);

lightThemeBtn.addEventListener("click", async () => {
  settings.theme = "light";
  await saveSettings();
  syncSettingsControls();
});

darkThemeBtn.addEventListener("click", async () => {
  settings.theme = "dark";
  await saveSettings();
  syncSettingsControls();
});

function setDockPosition(pos) {
  return async () => {
    settings.dockPosition = pos;
    await saveSettings();
    syncSettingsControls();
  };
}

dockPosBottomBtn.addEventListener("click", setDockPosition("bottom"));
dockPosTopBtn.addEventListener("click", setDockPosition("top"));
dockPosLeftBtn.addEventListener("click", setDockPosition("left"));
dockPosRightBtn.addEventListener("click", setDockPosition("right"));

bgColorLightInput.addEventListener("input", async () => {
  settings.bgColorLight = bgColorLightInput.value;
  await saveSettings();
});

bgColorDarkInput.addEventListener("input", async () => {
  settings.bgColorDark = bgColorDarkInput.value;
  await saveSettings();
});

spacingInput.addEventListener("input", async () => {
  settings.spacing = Number(spacingInput.value);
  spacingValue.textContent = settings.spacing + "px";
  await saveSettings();
});

tileWidthInput.addEventListener("input", async () => {
  settings.tileWidth = Number(tileWidthInput.value);
  tileWidthValue.textContent = settings.tileWidth + "px";
  await saveSettings();
});

tileHeightInput.addEventListener("input", async () => {
  settings.tileHeight = Number(tileHeightInput.value);
  tileHeightValue.textContent = settings.tileHeight + "px";
  await saveSettings();
});

titlePaddingInput.addEventListener("input", async () => {
  settings.titlePadding = Number(titlePaddingInput.value);
  titlePaddingValue.textContent = settings.titlePadding + "px";
  await saveSettings();
});

pagePaddingInput.addEventListener("input", async () => {
  settings.pagePadding = Number(pagePaddingInput.value);
  pagePaddingValue.textContent = settings.pagePadding + "px";
  await saveSettings();
});

tilesPerRowInput.addEventListener("input", async () => {
  settings.tilesPerRow = Number(tilesPerRowInput.value);
  tilesPerRowValue.textContent = settings.tilesPerRow > 0 ? settings.tilesPerRow : "Auto";
  await saveSettings();
});

screenshotDelayInput.addEventListener("input", async () => {
  settings.screenshotDelay = Number(screenshotDelayInput.value);
  screenshotDelayValue.textContent = (settings.screenshotDelay / 1000).toFixed(2).replace(/\.?0+$/, "") + "s";
  await saveSettings();
});

clearImageBtn.addEventListener("click", async () => {
  settings.bgImage = "";
  await saveSettings();
  syncSettingsControls();
});

resetBtn.addEventListener("click", async () => {
  settings = { ...DEFAULT_SETTINGS };
  await saveSettings();
  syncSettingsControls();
});

function renderImageResults(items) {
  imageGrid.innerHTML = "";
  for (const item of items) {
    const img = document.createElement("img");
    img.src = item.thumb;
    img.dataset.full = item.full;
    img.title = item.title || "";
    img.addEventListener("click", async () => {
      settings.bgImage = img.dataset.full;
      await saveSettings();
      syncSettingsControls();
    });
    imageGrid.appendChild(img);
  }
  syncSettingsControls();
}

function showImageGridNote(text) {
  imageGrid.innerHTML = "";
  const note = document.createElement("div");
  note.className = "image-grid-note";
  note.textContent = text; // textContent, never HTML — text may include user-typed search terms
  imageGrid.appendChild(note);
}

async function getPexelsKey() {
  const data = await chrome.storage.local.get("pexelsApiKey");
  return data.pexelsApiKey || "";
}

loadBingBtn.addEventListener("click", async () => {
  loadBingBtn.disabled = true;
  loadBingBtn.textContent = "Loading…";
  try {
    const res = await fetch("https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=en-US");
    const data = await res.json();
    const items = (data.images || []).map((img) => ({
      thumb: `https://www.bing.com${img.url}&w=200&h=120`,
      full: `https://www.bing.com${img.url}&w=1920&h=1080`,
      title: img.copyright || "Bing photo of the day"
    }));
    if (!items.length) throw new Error("No images returned");
    renderImageResults(items);
  } catch (err) {
    imageGrid.textContent = "Could not load Bing images. Check your connection.";
  } finally {
    loadBingBtn.disabled = false;
    loadBingBtn.textContent = "Bing photo of the day";
  }
});

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

bingDailyToggle.addEventListener("change", async () => {
  settings.bingDailyEnabled = bingDailyToggle.checked;
  if (settings.bingDailyEnabled) {
    try {
      settings.bgImage = await fetchTodaysBingImage();
      settings.bingLastDate = todayKey();
    } catch (err) {
      // Keep the toggle on; the background alarm will retry later.
    }
  }
  await saveSettings();
});

async function runImageSearch() {
  const query = imageSearchInput.value.trim();
  if (!query) return;

  const key = await getPexelsKey();
  if (!key) {
    pexelsKeyRow.classList.remove("hidden");
    pexelsKeyInput.focus();
    return;
  }

  imageSearchBtn.disabled = true;
  imageSearchBtn.textContent = "Searching…";
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=20`,
      { headers: { Authorization: key } }
    );
    if (!res.ok) throw new Error("Search request failed (check your API key)");
    const data = await res.json();
    const items = (data.photos || []).map((p) => ({
      thumb: p.src.small,
      full: p.src.large2x || p.src.original,
      title: `Photo by ${p.photographer}`
    }));
    if (!items.length) {
      showImageGridNote(`No results for "${query}".`);
      return;
    }
    renderImageResults(items);
  } catch (err) {
    showImageGridNote(err.message);
  } finally {
    imageSearchBtn.disabled = false;
    imageSearchBtn.textContent = "Search";
  }
}

imageSearchBtn.addEventListener("click", runImageSearch);
imageSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runImageSearch();
});

savePexelsKeyBtn.addEventListener("click", async () => {
  const key = pexelsKeyInput.value.trim();
  if (!key) return;
  await chrome.storage.local.set({ pexelsApiKey: key });
  pexelsKeyRow.classList.add("hidden");
  runImageSearch();
});

exportBtn.addEventListener("click", () => {
  // tiles/settings are kept in memory in sync with storage, so just use them directly.
  const payload = {
    type: "start-page-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    tiles,
    dockItems,
    settings
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `start-page-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

importBtn.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  importFile.value = "";
  if (!file) return;

  try {
    const text = await file.text();
    const payload = JSON.parse(text);

    if (!Array.isArray(payload.tiles)) {
      throw new Error("File does not contain a valid tiles list.");
    }

    const seenIds = new Set();
    const cleanTiles = [];
    for (const t of payload.tiles) {
      const name = String(t && t.name || "").trim().slice(0, 200);
      const url = normalizeUrl(String(t && t.url || "").trim());
      if (!name || !url) continue; // skip entries with an unsafe/empty URL
      let id = String(t && t.id || "").trim() || uid();
      if (seenIds.has(id)) id = uid();
      seenIds.add(id);
      cleanTiles.push({ id, name, url });
    }
    if (!cleanTiles.length) {
      throw new Error("No valid tiles found in this file.");
    }

    const cleanDockItems = [];
    if (Array.isArray(payload.dockItems)) {
      const seenDockIds = new Set();
      for (const d of payload.dockItems) {
        const url = normalizeUrl(String(d && d.url || "").trim());
        if (!url) continue;
        let id = String(d && d.id || "").trim() || uid();
        if (seenDockIds.has(id)) id = uid();
        seenDockIds.add(id);
        cleanDockItems.push({ id, url });
      }
    }

    const importedSettings = { ...DEFAULT_SETTINGS, ...(payload.settings || {}) };
    importedSettings.theme = importedSettings.theme === "dark" ? "dark" : "light";
    if (!["bottom", "top", "left", "right"].includes(importedSettings.dockPosition)) {
      importedSettings.dockPosition = DEFAULT_SETTINGS.dockPosition;
    }
    if (importedSettings.bgImage && !isHttpUrl(importedSettings.bgImage)) {
      importedSettings.bgImage = "";
    }
    if (!/^#[0-9a-f]{3,8}$/i.test(importedSettings.bgColorLight || "")) {
      importedSettings.bgColorLight = DEFAULT_SETTINGS.bgColorLight;
    }
    if (!/^#[0-9a-f]{3,8}$/i.test(importedSettings.bgColorDark || "")) {
      importedSettings.bgColorDark = DEFAULT_SETTINGS.bgColorDark;
    }
    importedSettings.spacing = clampNumber(importedSettings.spacing, 0, 60, DEFAULT_SETTINGS.spacing);
    importedSettings.tileWidth = clampNumber(importedSettings.tileWidth, 120, 400, DEFAULT_SETTINGS.tileWidth);
    importedSettings.tileHeight = clampNumber(importedSettings.tileHeight, 80, 300, DEFAULT_SETTINGS.tileHeight);
    importedSettings.titlePadding = clampNumber(importedSettings.titlePadding, 0, 30, DEFAULT_SETTINGS.titlePadding);
    importedSettings.pagePadding = clampNumber(importedSettings.pagePadding, 0, 120, DEFAULT_SETTINGS.pagePadding);
    importedSettings.tilesPerRow = clampNumber(importedSettings.tilesPerRow, 0, 10, DEFAULT_SETTINGS.tilesPerRow);
    importedSettings.screenshotDelay = clampNumber(importedSettings.screenshotDelay, 0, 8000, DEFAULT_SETTINGS.screenshotDelay);

    tiles = cleanTiles;
    dockItems = cleanDockItems;
    settings = importedSettings;
    await persistTiles();
    await persistDockItems();
    await persistSettings.flush();
    // Imported tiles may point at different URLs than any cached thumbnails, so drop the cache.
    await chrome.storage.local.remove("thumbs");

    applySettingsToPage();
    syncSettingsControls();
    render();
    renderDock();
    alert("Import complete.");
  } catch (err) {
    alert("Could not import this file: " + err.message);
  }
});

function render() {
  grid.innerHTML = "";
  pendingCaptureObserver.disconnect(); // drop any observers left over from the previous render

  for (const tile of tiles) {
    const el = document.createElement("div");
    el.className = "tile";
    el.dataset.id = tile.id;
    el.draggable = true;

    const thumb = document.createElement("div");
    thumb.className = "thumb";
    thumb.textContent = "Loading…";

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = tile.name;

    const editBtn = document.createElement("div");
    editBtn.className = "edit-btn";
    editBtn.textContent = "✎";
    editBtn.title = "Edit";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openModal(tile);
    });

    const refreshBtn = document.createElement("div");
    refreshBtn.className = "edit-btn refresh-btn";
    refreshBtn.textContent = "⟳";
    refreshBtn.title = "Refresh thumbnail";
    refreshBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      thumb.textContent = "Loading…";
      refreshThumbnail(tile, thumb);
    });

    el.appendChild(thumb);
    el.appendChild(label);
    el.appendChild(editBtn);
    el.appendChild(refreshBtn);

    el.addEventListener("click", () => {
      if (Date.now() - lastDropAt < 300) return; // ignore the click that follows a drag-drop
      window.location.href = tile.url;
    });

    // Middle click -> open in a new background tab (like a normal link).
    el.addEventListener("auxclick", (e) => {
      if (e.button === 1) {
        e.preventDefault();
        chrome.tabs.create({ url: tile.url, active: false });
      }
    });

    // Prevent the default middle-click autoscroll cursor from appearing.
    el.addEventListener("mousedown", (e) => {
      if (e.button === 1) e.preventDefault();
    });

    el.addEventListener("dragstart", (e) => {
      draggedId = tile.id;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", tile.id);
      requestAnimationFrame(() => el.classList.add("dragging"));
    });

    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      [...grid.querySelectorAll(".drag-over")].forEach((n) => n.classList.remove("drag-over"));
      draggedId = null;
    });

    el.addEventListener("dragover", (e) => {
      if (!draggedId || draggedId === tile.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      el.classList.add("drag-over");
    });

    el.addEventListener("dragleave", () => {
      el.classList.remove("drag-over");
    });

    el.addEventListener("drop", async (e) => {
      e.preventDefault();
      el.classList.remove("drag-over");
      if (!draggedId || draggedId === tile.id) return;
      lastDropAt = Date.now();
      await reorderTiles(draggedId, tile.id);
    });

    grid.appendChild(el);

    loadThumbnail(tile, thumb);
  }

  const addTile = document.createElement("div");
  addTile.className = "tile add-tile";
  addTile.textContent = "+";
  addTile.addEventListener("click", () => {
    if (Date.now() - lastDropAt < 300) return;
    openModal(null);
  });

  addTile.addEventListener("dragover", (e) => {
    if (!draggedId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    addTile.classList.add("drag-over");
  });

  addTile.addEventListener("dragleave", () => {
    addTile.classList.remove("drag-over");
  });

  addTile.addEventListener("drop", async (e) => {
    e.preventDefault();
    addTile.classList.remove("drag-over");
    if (!draggedId) return;
    lastDropAt = Date.now();
    await reorderTiles(draggedId, null); // null target -> move to the end
  });

  grid.appendChild(addTile);
}

// Moves the item with id `fromId` to sit next to the item with id `toId`.
// Direction matters: if `toId` was originally ahead of `fromId` (dragging
// forward), the item lands *after* the target; otherwise it lands *before*
// it. Without this, dragging an item onto its immediate right-hand neighbor
// is a no-op (remove + reinsert "before" the target puts it right back where
// it started), which makes forward drags look broken while backward drags
// work fine.
function reorderArrayItem(array, fromId, toId) {
  const originalFromIndex = array.findIndex((x) => x.id === fromId);
  if (originalFromIndex === -1) return;

  if (toId === null) {
    const [moved] = array.splice(originalFromIndex, 1);
    array.push(moved);
    return;
  }

  const originalToIndex = array.findIndex((x) => x.id === toId);
  if (originalToIndex === -1) return;

  const movingForward = originalFromIndex < originalToIndex;
  const [moved] = array.splice(originalFromIndex, 1);
  let insertIndex = array.findIndex((x) => x.id === toId);
  if (insertIndex === -1) insertIndex = array.length;
  else if (movingForward) insertIndex += 1;
  array.splice(insertIndex, 0, moved);
}

async function reorderTiles(fromId, toId) {
  reorderArrayItem(tiles, fromId, toId);
  await saveTiles();
  render();
}

// --- Bottom dock: a row of plain favicon-only shortcuts, like a taskbar. ---

function faviconUrl(pageUrl) {
  return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(pageUrl)}`;
}

function renderDock() {
  dock.innerHTML = "";

  for (const item of dockItems) {
    const icon = document.createElement("div");
    icon.className = "dock-icon";
    icon.dataset.id = item.id;
    icon.draggable = true;
    icon.title = item.url;

    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = faviconUrl(item.url);
    img.alt = "";
    icon.appendChild(img);

    icon.addEventListener("click", () => {
      if (Date.now() - lastDropAt < 300) return;
      window.location.href = item.url;
    });

    icon.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openDockContextMenu(e.clientX, e.clientY, item.id);
    });

    icon.addEventListener("auxclick", (e) => {
      if (e.button === 1) {
        e.preventDefault();
        chrome.tabs.create({ url: item.url, active: false });
      }
    });

    icon.addEventListener("mousedown", (e) => {
      if (e.button === 1) e.preventDefault();
    });

    icon.addEventListener("dragstart", (e) => {
      draggedDockId = item.id;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", item.id);
      requestAnimationFrame(() => icon.classList.add("dragging"));
    });

    icon.addEventListener("dragend", () => {
      icon.classList.remove("dragging");
      [...dock.querySelectorAll(".drag-over")].forEach((n) => n.classList.remove("drag-over"));
      draggedDockId = null;
    });

    icon.addEventListener("dragover", (e) => {
      if (!draggedDockId || draggedDockId === item.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      icon.classList.add("drag-over");
    });

    icon.addEventListener("dragleave", () => {
      icon.classList.remove("drag-over");
    });

    icon.addEventListener("drop", async (e) => {
      e.preventDefault();
      icon.classList.remove("drag-over");
      if (!draggedDockId || draggedDockId === item.id) return;
      lastDropAt = Date.now();
      await reorderDockItems(draggedDockId, item.id);
    });

    dock.appendChild(icon);
  }

  const addBtn = document.createElement("div");
  addBtn.className = "dock-add";
  addBtn.textContent = "+";
  addBtn.title = "Add to dock";
  addBtn.addEventListener("click", () => {
    if (Date.now() - lastDropAt < 300) return;
    openDockModal(null);
  });

  addBtn.addEventListener("dragover", (e) => {
    if (!draggedDockId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    addBtn.classList.add("drag-over");
  });

  addBtn.addEventListener("dragleave", () => {
    addBtn.classList.remove("drag-over");
  });

  addBtn.addEventListener("drop", async (e) => {
    e.preventDefault();
    addBtn.classList.remove("drag-over");
    if (!draggedDockId) return;
    lastDropAt = Date.now();
    await reorderDockItems(draggedDockId, null);
  });

  dock.appendChild(addBtn);
}

async function reorderDockItems(fromId, toId) {
  reorderArrayItem(dockItems, fromId, toId);
  await persistDockItems();
  renderDock();
}

function openDockModal(item) {
  editingDockId = item ? item.id : null;
  dockModalTitle.textContent = item ? "Edit dock icon" : "Add to dock";
  dockUrlInput.value = item ? item.url : "";
  dockDeleteBtn.classList.toggle("hidden", !item);
  dockOverlay.classList.remove("hidden");
  dockUrlInput.focus();
}

function closeDockModal() {
  dockOverlay.classList.add("hidden");
  editingDockId = null;
}

dockSaveBtn.addEventListener("click", async () => {
  const url = normalizeUrl(dockUrlInput.value.trim());
  if (!url) return;

  if (editingDockId) {
    const item = dockItems.find((d) => d.id === editingDockId);
    if (item) item.url = url;
  } else {
    dockItems.push({ id: uid(), url });
  }

  await persistDockItems();
  closeDockModal();
  renderDock();
});

dockDeleteBtn.addEventListener("click", async () => {
  dockItems = dockItems.filter((d) => d.id !== editingDockId);
  await persistDockItems();
  closeDockModal();
  renderDock();
});

dockCancelBtn.addEventListener("click", closeDockModal);
dockOverlay.addEventListener("click", (e) => {
  if (e.target === dockOverlay) closeDockModal();
});
dockUrlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") dockSaveBtn.click();
});

// --- Dock right-click context menu ---

function openDockContextMenu(x, y, dockId) {
  contextMenuDockId = dockId;
  // Render off-screen first so we can measure it, then clamp into the viewport
  // — right-clicking an icon near a screen edge (especially with the dock
  // moved to top/left/right) could otherwise place the menu partly off-screen.
  dockContextMenu.style.left = "-9999px";
  dockContextMenu.style.top = "-9999px";
  dockContextMenu.classList.remove("hidden");

  const rect = dockContextMenu.getBoundingClientRect();
  const clampedX = Math.min(x, window.innerWidth - rect.width - 8);
  const clampedY = Math.min(y, window.innerHeight - rect.height - 8);
  dockContextMenu.style.left = Math.max(8, clampedX) + "px";
  dockContextMenu.style.top = Math.max(8, clampedY) + "px";
}

function closeDockContextMenu() {
  dockContextMenu.classList.add("hidden");
  contextMenuDockId = null;
}

dockContextEditBtn.addEventListener("click", () => {
  const item = dockItems.find((d) => d.id === contextMenuDockId);
  closeDockContextMenu();
  if (item) openDockModal(item);
});

document.addEventListener("click", (e) => {
  if (!dockContextMenu.contains(e.target)) closeDockContextMenu();
});
document.addEventListener("scroll", closeDockContextMenu, true);
window.addEventListener("blur", closeDockContextMenu);

// Capturing a fresh thumbnail is expensive (opens a real, if hidden, browser
// window and waits for the page to render) — defer it until the tile is
// actually scrolled into view instead of firing it for every tile on load.
// Already-cached thumbnails skip this entirely since just painting an <img>
// from a stored data URL is cheap.
const pendingCaptureObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      pendingCaptureObserver.unobserve(entry.target);
      const tile = tiles.find((t) => t.id === entry.target.dataset.tileId);
      if (tile) refreshThumbnail(tile, entry.target);
    }
  },
  { rootMargin: "300px" }
);

async function loadThumbnail(tile, thumbEl) {
  const cached = await getThumb(tile.id);
  if (cached) {
    setThumbImage(thumbEl, cached.dataUrl);
    return;
  }
  // No thumbnail saved yet (new tile) — capture it once it's visible.
  thumbEl.dataset.tileId = tile.id;
  pendingCaptureObserver.observe(thumbEl);
}

function setThumbImage(thumbEl, dataUrl) {
  thumbEl.textContent = "";
  thumbEl.innerHTML = "";
  const img = document.createElement("img");
  img.src = dataUrl;
  thumbEl.appendChild(img);
}

// Background captures can take a while (page load + up to 8s configurable
// delay), and the background service worker can in rare cases be suspended
// or restarted mid-capture, which silently closes the message channel with
// no response and no error. Without a safety net, the tile is stuck showing
// "Loading…" forever with no way to tell anything went wrong. This timeout
// guarantees the UI always settles to something the user can act on (retry
// via the refresh button) instead of hanging indefinitely.
const CAPTURE_RESPONSE_TIMEOUT_MS = 45000;

function refreshThumbnail(tile, thumbEl) {
  let settled = false;

  const giveUp = () => {
    if (settled) return;
    settled = true;
    if (!thumbEl.querySelector("img")) thumbEl.textContent = "No preview";
  };
  const timeoutId = setTimeout(giveUp, CAPTURE_RESPONSE_TIMEOUT_MS);

  chrome.runtime.sendMessage({ type: "capture", url: tile.url, delayMs: settings.screenshotDelay }, async (resp) => {
    if (settled) return; // the timeout already gave up on this request
    settled = true;
    clearTimeout(timeoutId);

    if (chrome.runtime.lastError) {
      console.error("[thumbnail] sendMessage error:", chrome.runtime.lastError);
      if (!thumbEl.querySelector("img")) thumbEl.textContent = "No preview";
      return;
    }
    if (resp && resp.ok) {
      await setThumb(tile.id, resp.dataUrl);
      // Only update visible tile if it's still in the DOM for this id.
      const currentEl = grid.querySelector(`.tile[data-id="${tile.id}"] .thumb`);
      if (currentEl) setThumbImage(currentEl, resp.dataUrl);
    } else {
      console.error("[thumbnail] capture error for", tile.url, resp && resp.error);
      if (!thumbEl.querySelector("img")) thumbEl.textContent = "No preview";
    }
  });
}

async function openModal(tile) {
  editingId = tile ? tile.id : null;
  pendingThumbDataUrl = null;
  pendingThumbRemoved = false;
  modalTitle.textContent = tile ? "Edit Tile" : "Add Tile";
  nameInput.value = tile ? tile.name : "";
  urlInput.value = tile ? tile.url : "";
  deleteBtn.classList.toggle("hidden", !tile);

  const cached = tile ? await getThumb(tile.id) : null;
  setThumbPreview(cached ? cached.dataUrl : "");

  overlay.classList.remove("hidden");
  nameInput.focus();
}

function closeModal() {
  overlay.classList.add("hidden");
  editingId = null;
  pendingThumbDataUrl = null;
  pendingThumbRemoved = false;
}

function setThumbPreview(dataUrl) {
  thumbPreview.innerHTML = "";
  if (dataUrl) {
    const img = document.createElement("img");
    img.src = dataUrl;
    thumbPreview.appendChild(img);
    removeThumbBtn.classList.remove("hidden");
  } else {
    thumbPreview.textContent = "No image";
    removeThumbBtn.classList.add("hidden");
  }
}

const MAX_THUMB_DIMENSION = 960;

function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

async function resizeImageDataUrl(dataUrl) {
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = dataUrl;
  });

  const scale = Math.min(1, MAX_THUMB_DIMENSION / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  // WebP gives noticeably smaller files than JPEG at the same visual quality.
  return canvas.toDataURL("image/webp", 0.85);
}

uploadThumbBtn.addEventListener("click", () => thumbFileInput.click());

thumbFileInput.addEventListener("change", async () => {
  const file = thumbFileInput.files[0];
  thumbFileInput.value = "";
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("Please choose an image file.");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    alert("Image is too large (max 10MB).");
    return;
  }

  try {
    const rawDataUrl = await readImageFileAsDataUrl(file);
    const resized = await resizeImageDataUrl(rawDataUrl);
    pendingThumbDataUrl = resized;
    pendingThumbRemoved = false;
    setThumbPreview(resized);
  } catch (err) {
    alert("Could not load that image: " + err.message);
  }
});

removeThumbBtn.addEventListener("click", () => {
  pendingThumbDataUrl = null;
  pendingThumbRemoved = true;
  setThumbPreview("");
});

function normalizeUrl(value) {
  if (!/^https?:\/\//i.test(value)) {
    value = "https://" + value;
  }
  return isHttpUrl(value) ? value : "";
}

// Only allow http(s) URLs anywhere a URL is stored or navigated to, so an
// imported backup (or any other untrusted data) can't smuggle in a
// javascript:/data: URI that runs when a tile is clicked.
function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function removeThumbFromStorage(id) {
  return withThumbsLock(async () => {
    const data = await chrome.storage.local.get("thumbs");
    const thumbs = data.thumbs || {};
    delete thumbs[id];
    await chrome.storage.local.set({ thumbs });
  });
}

saveBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  const url = normalizeUrl(urlInput.value.trim());
  if (!name || !url) return;

  const uploadedThumb = pendingThumbDataUrl;
  const thumbRemoved = pendingThumbRemoved;

  if (editingId) {
    const tile = tiles.find((t) => t.id === editingId);
    if (!tile) {
      // The tile was removed elsewhere (e.g. another synced device) while this modal was open.
      closeModal();
      render();
      return;
    }
    const urlChanged = tile.url !== url;
    tile.name = name;
    tile.url = url;
    await saveTiles();

    if (uploadedThumb) {
      await setThumb(tile.id, uploadedThumb);
    } else if (thumbRemoved || urlChanged) {
      await removeThumbFromStorage(tile.id);
    }
  } else {
    const newTile = { id: uid(), name, url };
    tiles.push(newTile);
    await saveTiles();

    if (uploadedThumb) {
      await setThumb(newTile.id, uploadedThumb);
    }
  }

  closeModal();
  render();
});

cancelBtn.addEventListener("click", closeModal);
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeModal();
});

deleteBtn.addEventListener("click", async () => {
  tiles = tiles.filter((t) => t.id !== editingId);
  await saveTiles();
  closeModal();
  render();
});

(async function init() {
  await loadSettings();
  applySettingsToPage();
  syncSettingsControls();
  await loadTiles();
  render();
  await loadDockItems();
  renderDock();
})();
