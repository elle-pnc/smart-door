const STORAGE_KEY = "smartDoorConfig";
const HISTORY_KEY = "smartDoorHistory";
const TIMEZONE = "Asia/Singapore";
const HISTORY_LIMIT = 200;
const DEFAULT_PAGE_SIZE = 20;
const WARNING_THRESHOLDS = {
  openWarningMs: 15 * 60 * 1000,
  openCriticalMs: 30 * 60 * 1000,
  rapidWindowMs: 60 * 1000,
  rapidCycles: 3,
  noUpdateWarningMs: 6 * 60 * 60 * 1000,
  noUpdateCriticalMs: 12 * 60 * 60 * 1000,
};
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC72Hp0K5wrdw4J9NXX0qvFSJxLL3dYvCw",
  authDomain: "smart-door-3dd88.firebaseapp.com",
  projectId: "smart-door-3dd88",
  storageBucket: "smart-door-3dd88.firebasestorage.app",
  messagingSenderId: "883800691472",
  appId: "1:883800691472:web:dfa7dc0624cb32adfb8b95",
  measurementId: "G-4PNGXDZQ5G",
  databaseURL: "https://smart-door-3dd88-default-rtdb.asia-southeast1.firebasedatabase.app",
};

const DEFAULT_CONFIG = {
  host: "7be06ef8e93a46229e1aac740a263c7d.s1.eu.hivemq.cloud",
  port: "8884",
  topic: "smartdoor/status",
  username: "eru_SD",
  password: "Admin123",
};

let client = null;
let history = [];
let historyIndex = new Map();
let historySort = "desc";
let historyPage = 1;
let historyPageSize = DEFAULT_PAGE_SIZE;
let lastStatus = history[0]?.status || null;
let lastStatusAt = history[0]?.timestamp || null;
let lastMessageAt = history[0]?.timestamp || null;
let usingFirebase = false;
let historyRef = null;

const elements = {
  connectionDot: document.getElementById("connectionDot"),
  connectionText: document.getElementById("connectionText"),
  connectionStatus: document.getElementById("connectionStatus"),
  doorStatus: document.getElementById("doorStatus"),
  lastUpdate: document.getElementById("lastUpdate"),
  opensToday: document.getElementById("opensToday"),
  historyList: document.getElementById("historyList"),
  warningList: document.getElementById("warningList"),
  warningSummary: document.getElementById("warningSummary"),
  lastMessageTime: document.getElementById("lastMessageTime"),
  historySort: document.getElementById("historySort"),
  historyPageSize: document.getElementById("historyPageSize"),
  historyPrevBtn: document.getElementById("historyPrevBtn"),
  historyNextBtn: document.getElementById("historyNextBtn"),
  historyPageInfo: document.getElementById("historyPageInfo"),
  hostInput: document.getElementById("hostInput"),
  portInput: document.getElementById("portInput"),
  topicInput: document.getElementById("topicInput"),
  usernameInput: document.getElementById("usernameInput"),
  passwordInput: document.getElementById("passwordInput"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  openSettingsBtn: document.getElementById("openSettingsBtn"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),
  settingsModal: document.getElementById("settingsModal"),
  warningModal: document.getElementById("warningModal"),
  warningDetails: document.getElementById("warningDetails"),
  closeWarningBtn: document.getElementById("closeWarningBtn"),
};

const config = loadConfig();
hydrateInputs(config);
initFirebase();
initializeHistory();
syncConnectionButtons();
autoConnect();
updateWarnings();
setInterval(updateWarnings, 30000);
startClock();

elements.historySort.addEventListener("change", () => {
  historySort = elements.historySort.value;
  historyPage = 1;
  renderHistory();
});

elements.historyPageSize.addEventListener("change", () => {
  historyPageSize = Number(elements.historyPageSize.value);
  historyPage = 1;
  renderHistory();
});

elements.historyPrevBtn.addEventListener("click", () => {
  historyPage = Math.max(1, historyPage - 1);
  renderHistory();
});

elements.historyNextBtn.addEventListener("click", () => {
  historyPage += 1;
  renderHistory();
});

elements.historyList.addEventListener("click", (event) => {
  const warningButton = event.target.closest(".warning-button");
  if (!warningButton) return;
  const entry = historyIndex.get(warningButton.dataset.key);
  if (entry) {
    showWarningDetails(entry);
  }
});

elements.connectBtn.addEventListener("click", () => connect());
elements.disconnectBtn.addEventListener("click", () => disconnect());

elements.openSettingsBtn.addEventListener("click", () => openSettings());
elements.closeSettingsBtn.addEventListener("click", () => closeSettings());
elements.settingsModal.addEventListener("click", (event) => {
  if (event.target === elements.settingsModal) {
    closeSettings();
  }
});

elements.warningModal.addEventListener("click", (event) => {
  if (event.target === elements.warningModal) {
    closeWarningDetails();
  }
});

elements.closeWarningBtn.addEventListener("click", () => closeWarningDetails());

function startClock() {
  const clock = document.getElementById("clockDisplay");
  if (!clock) return;
  let lastMinute = null;

  const update = () => {
    const now = new Date();
    const formatted = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: TIMEZONE,
    }).format(now);
    clock.textContent = formatted.replace(" ", "");
    const minute = now.getMinutes();
    if (minute !== lastMinute) {
      clock.classList.remove("tick");
      clock.classList.add("tick");
      lastMinute = minute;
    }
  };

  const scheduleNextMinute = () => {
    update();
    const now = new Date();
    const delay = (60 - now.getSeconds()) * 1000 + 50;
    setTimeout(scheduleNextMinute, delay);
  };

  scheduleNextMinute();
}

elements.clearHistoryBtn.addEventListener("click", () => {
  history = [];
  historyIndex = new Map();
  historyPage = 1;
  if (usingFirebase && historyRef) {
    historyRef.remove();
  } else {
    saveHistory(history);
  }
  renderHistory();
  renderStats();
  applyLastKnownStatus();
});

function loadConfig() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    const stored = JSON.parse(raw);
    const merged = { ...DEFAULT_CONFIG, ...stored };
    Object.keys(DEFAULT_CONFIG).forEach((key) => {
      if (!merged[key]) {
        merged[key] = DEFAULT_CONFIG[key];
      }
    });
    return merged;
  } catch (error) {
    return { ...DEFAULT_CONFIG };
  }
}

function initFirebase() {
  if (!window.firebase) return;
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    historyRef = firebase.database().ref("history");
    usingFirebase = true;
  } catch (error) {
    console.error(error);
    usingFirebase = false;
  }
}

function initializeHistory() {
  if (usingFirebase && historyRef) {
    history = [];
    historyIndex = new Map();
    historyRef
      .orderByChild("timestamp")
      .limitToLast(HISTORY_LIMIT)
      .on("child_added", (snapshot) => {
        const entry = snapshot.val();
        if (!entry) return;
        upsertHistoryEntry({ ...entry, key: snapshot.key });
      });
    historyRef.on("child_changed", (snapshot) => {
      const entry = snapshot.val();
      if (!entry) return;
      upsertHistoryEntry({ ...entry, key: snapshot.key });
    });
  } else {
    history = loadHistory();
    historyIndex = new Map(history.map((entry) => [entry.key, entry]));
    renderHistory();
    renderStats();
    applyLastKnownStatus();
  }
}

function saveConfig(nextConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextConfig));
}

function hydrateInputs(currentConfig) {
  elements.hostInput.value = currentConfig.host;
  elements.portInput.value = currentConfig.port;
  elements.topicInput.value = currentConfig.topic;
  elements.usernameInput.value = currentConfig.username;
  elements.passwordInput.value = currentConfig.password;
}

function readInputs() {
  return {
    host: elements.hostInput.value.trim(),
    port: elements.portInput.value.trim(),
    topic: elements.topicInput.value.trim(),
    username: elements.usernameInput.value.trim(),
    password: elements.passwordInput.value,
  };
}

function connect() {
  if (client) return;
  const nextConfig = readInputs();
  saveConfig(nextConfig);

  if (!nextConfig.host || !nextConfig.port || !nextConfig.topic) {
    setConnectionState("error", "Missing host, port, or topic");
    return;
  }

  const url = `wss://${nextConfig.host}:${nextConfig.port}/mqtt`;
  const clientId = `smart-door-web-${Math.random().toString(16).slice(2, 10)}`;

  setConnectionState("connecting", "Connecting...");
  syncConnectionButtons();

  client = mqtt.connect(url, {
    clientId,
    username: nextConfig.username || undefined,
    password: nextConfig.password || undefined,
    clean: true,
    reconnectPeriod: 3000,
  });

  client.on("connect", () => {
    setConnectionState("connected", "Connected");
    syncConnectionButtons();
    applyLastKnownStatus();
    client.subscribe(nextConfig.topic, (err) => {
      if (err) {
        setConnectionState("error", "Subscribe failed");
      }
    });
  });

  client.on("reconnect", () => {
    setConnectionState("connecting", "Reconnecting...");
  });

  client.on("error", (error) => {
    setConnectionState("error", "Connection error");
    syncConnectionButtons();
    console.error(error);
  });

  client.on("close", () => {
    setConnectionState("disconnected", "Disconnected");
    syncConnectionButtons();
  });

  client.on("message", (topic, message) => {
    const payload = message.toString().trim().toLowerCase();
    if (!payload) return;
    if (payload.includes("open")) {
      updateStatus("Open");
    } else if (payload.includes("close")) {
      updateStatus("Closed");
    } else {
      updateStatus(payload);
    }
  });
}

function disconnect() {
  if (client) {
    client.end(true);
    client = null;
  }
  setConnectionState("disconnected", "Disconnected");
  syncConnectionButtons();
}

function syncConnectionButtons() {
  const connected = Boolean(client);
  elements.connectBtn.disabled = connected;
  elements.disconnectBtn.disabled = !connected;
}

function autoConnect() {
  if (!config.host || !config.port || !config.topic) return;
  connect();
}

function openSettings() {
  elements.settingsModal.classList.add("open");
  elements.settingsModal.setAttribute("aria-hidden", "false");
}

function closeSettings() {
  elements.settingsModal.classList.remove("open");
  elements.settingsModal.setAttribute("aria-hidden", "true");
}

function showWarningDetails(entry) {
  elements.warningDetails.innerHTML = "";

  if (!entry.warnings || !entry.warnings.length) {
    elements.warningDetails.textContent = "No warning details available.";
  } else {
    entry.warnings.forEach((warning) => {
      const detail = document.createElement("div");
      detail.className = "warning-detail";
      detail.textContent = warning.message;
      elements.warningDetails.appendChild(detail);
    });
  }

  elements.warningModal.classList.add("open");
  elements.warningModal.setAttribute("aria-hidden", "false");
}

function closeWarningDetails() {
  elements.warningModal.classList.remove("open");
  elements.warningModal.setAttribute("aria-hidden", "true");
}

function setConnectionState(state, text) {
  elements.connectionText.textContent = text;
  elements.connectionDot.classList.remove("connected", "error");
  elements.connectionStatus.classList.remove("connected", "disconnected");

  if (state === "connected") {
    elements.connectionDot.classList.add("connected");
    elements.connectionStatus.classList.add("connected");
  } else if (state === "error") {
    elements.connectionDot.classList.add("error");
    elements.connectionStatus.classList.add("disconnected");
  } else if (state === "disconnected") {
    setDisconnectedStatus();
    elements.connectionStatus.classList.add("disconnected");
  }
}

function setDisconnectedStatus() {
  elements.doorStatus.textContent = "Unknown";
  elements.lastUpdate.textContent = "Last update: --";
}

function applyLastKnownStatus() {
  if (!history.length) {
    if (client) {
      elements.doorStatus.textContent = "Waiting for data";
      elements.lastUpdate.textContent = "Last update: --";
    }
    return;
  }

  const last = history[0];
  elements.doorStatus.textContent = last.status;
  elements.lastUpdate.textContent = `Last update: ${formatTime(last.timestamp)}`;
}

function updateStatus(status) {
  const timestamp = Date.now();
  const normalized = status.toLowerCase();

  if (lastStatus && lastStatus.toLowerCase() === normalized) {
    lastMessageAt = timestamp;
    elements.lastUpdate.textContent = `Last update: ${formatTime(timestamp)}`;
    updateWarnings();
    return;
  }

  elements.doorStatus.textContent = status;
  elements.lastUpdate.textContent = `Last update: ${formatTime(timestamp)}`;
  triggerPulse(elements.doorStatus);

  lastMessageAt = timestamp;

  const warnings = [];
  if (
    lastStatus &&
    lastStatus.toLowerCase() === "open" &&
    normalized === "closed" &&
    lastStatusAt
  ) {
    const openDuration = timestamp - lastStatusAt;
    if (openDuration >= WARNING_THRESHOLDS.openCriticalMs) {
      warnings.push({
        type: "open_duration",
        level: "critical",
        message: `Door open for ${formatDuration(openDuration)}.`,
        durationMs: openDuration,
      });
    } else if (openDuration >= WARNING_THRESHOLDS.openWarningMs) {
      warnings.push({
        type: "open_duration",
        level: "warning",
        message: `Door open for ${formatDuration(openDuration)}.`,
        durationMs: openDuration,
      });
    }
  }

  lastStatus = status;
  lastStatusAt = timestamp;

  pushHistoryEntry({
    status,
    timestamp,
    warnings,
  });

  updateWarnings();
}

function triggerPulse(target) {
  target.classList.remove("pulse");
  void target.offsetWidth;
  target.classList.add("pulse");
}

function renderHistory() {
  elements.historyList.innerHTML = "";

  if (!history.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No events yet.";
    elements.historyList.appendChild(empty);
    elements.historyPageInfo.textContent = "Page 1 of 1";
    elements.historyPrevBtn.disabled = true;
    elements.historyNextBtn.disabled = true;
    return;
  }

  const sortedHistory =
    historySort === "asc" ? [...history].reverse() : [...history];
  const totalPages = Math.max(
    1,
    Math.ceil(sortedHistory.length / historyPageSize)
  );
  historyPage = Math.min(historyPage, totalPages);

  const startIndex = (historyPage - 1) * historyPageSize;
  const pageItems = sortedHistory.slice(
    startIndex,
    startIndex + historyPageSize
  );

  pageItems.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "history-item";

    const left = document.createElement("div");
    left.className = "history-left";

    const status = document.createElement("span");
    status.className = "status";
    status.textContent = entry.status;
    left.appendChild(status);

    if (entry.warnings && entry.warnings.length) {
      const warningBtn = document.createElement("button");
      warningBtn.className = "warning-button";
      warningBtn.setAttribute("type", "button");
      warningBtn.setAttribute("title", "View warning");
      warningBtn.dataset.key = entry.key;
      warningBtn.textContent = "!";
      left.appendChild(warningBtn);
    }

    const time = document.createElement("span");
    time.textContent = formatTime(entry.timestamp);

    item.appendChild(left);
    item.appendChild(time);
    elements.historyList.appendChild(item);
  });

  elements.historyPageInfo.textContent = `Page ${historyPage} of ${totalPages}`;
  elements.historyPrevBtn.disabled = historyPage <= 1;
  elements.historyNextBtn.disabled = historyPage >= totalPages;
}

function renderStats() {
  const todayKey = formatDateKey(Date.now());
  const openCount = history.filter(
    (entry) =>
      entry.status.toLowerCase().includes("open") &&
      formatDateKey(entry.timestamp) === todayKey
  ).length;
  elements.opensToday.textContent = String(openCount);
}

function pushHistoryEntry(entry) {
  if (usingFirebase && historyRef) {
    const ref = historyRef.push();
    const withKey = { ...entry, key: ref.key };
    ref.set(withKey);
    upsertHistoryEntry(withKey);
    return;
  }

  const localEntry = {
    ...entry,
    key: makeLocalKey(),
  };
  upsertHistoryEntry(localEntry);
  saveHistory(history);
}

function upsertHistoryEntry(entry) {
  if (historyIndex.has(entry.key)) {
    const existing = historyIndex.get(entry.key);
    Object.assign(existing, entry);
  } else {
    history.push(entry);
    historyIndex.set(entry.key, entry);
  }

  history.sort((a, b) => b.timestamp - a.timestamp);
  history = history.slice(0, HISTORY_LIMIT);
  if (historySort === "desc") {
    historyPage = 1;
  }

  refreshDerivedState();
  renderHistory();
  renderStats();
  applyLastKnownStatus();
}

function refreshDerivedState() {
  if (!history.length) {
    lastStatus = null;
    lastStatusAt = null;
    lastMessageAt = null;
    return;
  }
  const latest = history[0];
  lastStatus = latest.status;
  lastStatusAt = latest.timestamp;
  lastMessageAt = latest.timestamp;
}

function makeLocalKey() {
  return `local_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function updateWarnings() {
  const warnings = [];
  const now = Date.now();

  if (lastMessageAt) {
    elements.lastMessageTime.textContent = `Last MQTT message: ${formatTime(
      lastMessageAt
    )}`;
  } else {
    elements.lastMessageTime.textContent = "Last MQTT message: --";
  }

  if (!client) {
    renderWarnings(warnings, "Disconnected. Warnings paused.");
    return;
  }

  if (lastStatus && lastStatus.toLowerCase() === "open" && lastStatusAt) {
    const openDuration = now - lastStatusAt;
    const latestEntry = history[0];
    if (openDuration >= WARNING_THRESHOLDS.openCriticalMs) {
      warnings.push({
        level: "critical",
        text: `Door open for ${formatDuration(openDuration)}.`,
      });
      if (latestEntry && latestEntry.status.toLowerCase() === "open") {
        ensureEntryWarning(latestEntry, {
          type: "open_duration",
          level: "critical",
          message: `Door open for ${formatDuration(openDuration)}.`,
          durationMs: openDuration,
        });
      }
    } else if (openDuration >= WARNING_THRESHOLDS.openWarningMs) {
      warnings.push({
        level: "warning",
        text: `Door open for ${formatDuration(openDuration)}.`,
      });
      if (latestEntry && latestEntry.status.toLowerCase() === "open") {
        ensureEntryWarning(latestEntry, {
          type: "open_duration",
          level: "warning",
          message: `Door open for ${formatDuration(openDuration)}.`,
          durationMs: openDuration,
        });
      }
    }
  }

  const rapidCyclesCount = countRapidCycles(now);
  if (rapidCyclesCount >= WARNING_THRESHOLDS.rapidCycles) {
    warnings.push({
      level: "warning",
      text: `Rapid toggles detected: ${rapidCyclesCount} cycles in the last minute.`,
    });
  }

  if (lastMessageAt) {
    const silence = now - lastMessageAt;
    if (silence >= WARNING_THRESHOLDS.noUpdateCriticalMs) {
      warnings.push({
        level: "critical",
        text: `No updates for ${formatDuration(silence)}.`,
      });
    } else if (silence >= WARNING_THRESHOLDS.noUpdateWarningMs) {
      warnings.push({
        level: "warning",
        text: `No updates for ${formatDuration(silence)}.`,
      });
    }
  } else {
    warnings.push({
      level: "info",
      text: "Waiting for first MQTT update.",
    });
  }

  renderWarnings(warnings, warnings.length ? "Warnings active." : "All clear.");
}

function renderWarnings(warnings, summaryText) {
  elements.warningList.innerHTML = "";
  elements.warningSummary.textContent = summaryText;

  if (!warnings.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No warnings.";
    elements.warningList.appendChild(empty);
    return;
  }

  warnings.forEach((warning) => {
    const item = document.createElement("div");
    item.className = `warning-item ${warning.level}`;

    const tag = document.createElement("span");
    tag.className = "warning-tag";
    tag.textContent = warning.level;

    const text = document.createElement("span");
    text.textContent = warning.text;

    item.appendChild(text);
    item.appendChild(tag);
    elements.warningList.appendChild(item);
  });
}

function formatDuration(durationMs) {
  const minutes = Math.floor(durationMs / 60000);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining
    ? `${hours} hr ${remaining} min`
    : `${hours} hr`;
}

function countRapidCycles(now) {
  const windowStart = now - WARNING_THRESHOLDS.rapidWindowMs;
  const recent = history
    .filter((entry) => entry.timestamp >= windowStart)
    .sort((a, b) => a.timestamp - b.timestamp);

  let cycles = 0;
  let prevStatus = null;

  for (const entry of recent) {
    const current = entry.status.toLowerCase();
    if (prevStatus === "open" && current === "closed") {
      cycles += 1;
    }
    prevStatus = current;
  }

  return cycles;
}

function ensureEntryWarning(entry, warning) {
  const warnings = entry.warnings || [];
  const existing = warnings.find((item) => item.type === warning.type);
  if (
    existing &&
    existing.level === warning.level &&
    existing.message === warning.message
  ) {
    return;
  }
  const updated = warnings.filter((item) => item.type !== warning.type);
  updated.push(warning);
  updateHistoryEntryWarnings(entry.key, updated);
}

function updateHistoryEntryWarnings(entryKey, warnings) {
  const entry = historyIndex.get(entryKey);
  if (!entry) return;

  entry.warnings = warnings;
  if (usingFirebase && historyRef) {
    historyRef.child(entryKey).update({ warnings });
  } else {
    saveHistory(history);
  }
  renderHistory();
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
    hour12: true,
    timeZone: TIMEZONE,
  }).format(new Date(timestamp));
}

function formatDateKey(timestamp) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

function loadHistory() {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    const entries = JSON.parse(raw);
    return entries.map((entry) => ({
      key: entry.key || makeLocalKey(),
      status: entry.status,
      timestamp: entry.timestamp,
      warnings: entry.warnings || [],
    }));
  } catch (error) {
    return [];
  }
}

function saveHistory(entries) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
}
