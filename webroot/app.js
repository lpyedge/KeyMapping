// SVG Icons
const ICON_EDIT = `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M20.71,7.04C21.1,6.65 21.1,6.02 20.71,5.63L18.37,3.29C17.97,2.9 17.34,2.9 16.94,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z"/></svg>`;
const ICON_DELETE = `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19V4M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>`;

// DOM refs
const statusEl = document.getElementById("status");
const deviceInfoEl = document.getElementById("deviceInfo");
const ruleListEl = document.getElementById("ruleList");
const form = document.getElementById("ruleForm");
const formTitle = document.getElementById("formTitle");

const keySelectEl = document.getElementById("keySelect");
const keyCodeCustomEl = document.getElementById("keyCodeCustom");
const behaviorEl = document.getElementById("behavior");
const comboKeySelectEl = document.getElementById("comboKeySelect");
const labelComboKeyEl = document.getElementById("labelComboKey");

const actionTypeEl = document.getElementById("actionType");
const builtinCommandEl = document.getElementById("builtinCommand");
const launchAppPackageEl = document.getElementById("launchAppPackage");
const launchAppActivityEl = document.getElementById("launchAppActivity");
const appKeywordEl = document.getElementById("appKeyword");
const appResultsEl = document.getElementById("appResults");
const btnSearchAppsEl = document.getElementById("btnSearchApps");
const commandEl = document.getElementById("command");
const sendKeyCodeEl = document.getElementById("sendKeyCode");
const intentActionEl = document.getElementById("intentAction");
const intentPackageEl = document.getElementById("intentPackage");
const intentClassEl = document.getElementById("intentClass");
const intentDataEl = document.getElementById("intentData");
const intentCategoryEl = document.getElementById("intentCategory");
const intentExtrasEl = document.getElementById("intentExtras");

const fieldBuiltinEl = document.getElementById("fieldBuiltin");
const fieldLaunchAppEl = document.getElementById("fieldLaunchApp");
const fieldShellEl = document.getElementById("fieldShell");
const fieldSendKeyEl = document.getElementById("fieldSendKey");
const fieldIntentEl = document.getElementById("fieldIntent");

const formErrorEl = document.getElementById("formError");

const doubleIntervalEl = document.getElementById("doubleInterval");
const longPressMinEl = document.getElementById("longPressMin");
const shortPressMinEl = document.getElementById("shortPressMin");

const modalSettings = document.getElementById("modalSettings");
const modalEditor = document.getElementById("modalEditor");
const wizardCountdownEl = document.getElementById("wizardCountdown");

const keySetupModalEl = document.getElementById("keySetupModal");
const keySetupProgressEl = document.getElementById("keySetupProgress");
const keySetupPromptEl = document.getElementById("keySetupPrompt");
const keySetupCountdownEl = document.getElementById("keySetupCountdown");
const btnKeySetupStartEl = document.getElementById("btnKeySetupStart");
const btnKeySetupRetryEl = document.getElementById("btnKeySetupRetry");
const btnKeySetupSkipEl = document.getElementById("btnKeySetupSkip");
const btnKeySetupCloseEl = document.getElementById("btnKeySetupClose");
const btnKeySetupCloseXEl = document.getElementById("btnKeySetupCloseX");

const FALLBACK_KEY_OPTIONS = [
  { label: "POWER", code: 116 },
  { label: "VOL_UP", code: 115 },
  { label: "VOL_DOWN", code: 114 },
  { label: "HOME", code: 102 },
  { label: "MENU", code: 139 }
];
const KEY_SETUP_SEQUENCE = ["POWER", "VOL_UP", "VOL_DOWN", "HOME", "MENU"];

const COMBO_BEHAVIORS = new Set(["COMBO_CLICK", "COMBO_SHORT_PRESS", "COMBO_LONG_PRESS"]);
const ALL_BEHAVIORS = new Set([
  "CLICK",
  "SHORT_PRESS",
  "LONG_PRESS",
  "DOUBLE_CLICK",
  "COMBO_CLICK",
  "COMBO_SHORT_PRESS",
  "COMBO_LONG_PRESS"
]);

const BUILTIN_LABELS = {
  mute_toggle: "静音切换",
  open_voice_assistant: "打开语音助手",
  open_camera: "打开相机",
  toggle_flashlight: "切换手电筒",
  toggle_do_not_disturb: "切换勿扰模式"
};

let config = null;
let editingIndex = null;
let installedApps = [];

function setStatus(message) {
  statusEl.textContent = message;
}

function showModal(modal) {
  modal.classList.add("show");
}

function hideModal(modal) {
  modal.classList.remove("show");
}

const Api = {
  async getConfig() {
    const res = await fetch("/api/config");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },
  async saveConfig(payload) {
    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || `HTTP ${res.status}`);
    }
  },
  async getApps() {
    const res = await fetch("/api/apps");
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || `HTTP ${res.status}`);
    }
    return await res.json();
  },
  async startLearning() {
    const res = await fetch("/api/system/learn-start", { method: "POST" });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || `HTTP ${res.status}`);
    }
  },
  async getLearnResult() {
    const res = await fetch("/api/system/learn-result");
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || `HTTP ${res.status}`);
    }
    return await res.json();
  }
};

function defaultConfig() {
  return {
    version: 1,
    deviceName: "",
    hardwareMap: {
      116: "POWER",
      115: "VOL_UP",
      114: "VOL_DOWN",
      102: "HOME",
      139: "MENU"
    },
    doublePressIntervalMs: 300,
    longPressMinMs: 800,
    shortPressMinMs: 300,
    rules: []
  };
}

function toPositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function toNonNegativeInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function normalizeHardwareMap(input) {
  const map = {};
  if (!input || typeof input !== "object") return map;

  for (const [k, v] of Object.entries(input)) {
    const code = Number(k);
    const name = String(v || "").trim();
    if (!Number.isInteger(code) || code < 0 || !name) continue;
    map[code] = name;
  }

  return map;
}

function normalizeAction(action) {
  if (!action || typeof action !== "object") return null;

  const type = String(action.type || "").trim();
  if (type === "run_shell") {
    return { type, command: String(action.command || "") };
  }
  if (type === "send_key") {
    const keyCode = toNonNegativeInt(action.keyCode);
    if (keyCode === null) return null;
    return { type, keyCode };
  }
  if (type === "builtin_command") {
    const command = String(action.command || "").trim();
    if (!BUILTIN_LABELS[command]) return null;
    return { type, command };
  }
  if (type === "launch_app") {
    const packageName = String(action.package || "").trim();
    if (!packageName) return null;
    const activity = String(action.activity || "").trim();
    return { type, package: packageName, activity: activity || undefined };
  }
  if (type === "launch_intent") {
    const i = action.intent && typeof action.intent === "object" ? action.intent : {};
    const extras = {};
    if (i.extras && typeof i.extras === "object") {
      for (const [k, v] of Object.entries(i.extras)) {
        const key = String(k || "").trim();
        if (!key) continue;
        extras[key] = String(v ?? "");
      }
    }

    return {
      type,
      intent: {
        action: i.action ? String(i.action) : "",
        package: i.package ? String(i.package) : "",
        className: i.className ? String(i.className) : "",
        data: i.data ? String(i.data) : "",
        category: Array.isArray(i.category) ? i.category.map((x) => String(x).trim()).filter(Boolean) : [],
        extras
      }
    };
  }

  return null;
}

function normalizeRule(rule) {
  if (!rule || typeof rule !== "object") return null;

  const behavior = String(rule.behavior || "").toUpperCase();
  if (!ALL_BEHAVIORS.has(behavior)) return null;

  const action = normalizeAction(rule.action);
  if (!action) return null;

  let keyCode = toNonNegativeInt(rule.keyCode);
  let comboKeyCode = toNonNegativeInt(rule.comboKeyCode) ?? 0;

  if (keyCode === null) return null;

  if (COMBO_BEHAVIORS.has(behavior)) {
    if (comboKeyCode <= 0 || comboKeyCode === keyCode) return null;
  } else {
    comboKeyCode = 0;
  }

  const trigger = comboKeyCode > 0 ? `${keyCode}+${comboKeyCode}` : `${keyCode}`;
  if (typeof rule.trigger === "string" && rule.trigger.trim() && rule.trigger.trim() !== trigger) {
    return null;
  }

  return {
    id: typeof rule.id === "string" ? rule.id : null,
    description: typeof rule.description === "string" ? rule.description : "",
    enabled: rule.enabled !== false,
    behavior,
    trigger,
    keyCode,
    comboKeyCode,
    action
  };
}

function normalizeConfig(input) {
  const base = defaultConfig();
  const hardwareMap = normalizeHardwareMap(input?.hardwareMap);

  return {
    version: toPositiveInt(input?.version, 1),
    deviceName: String(input?.deviceName || "").trim(),
    hardwareMap: Object.keys(hardwareMap).length > 0 ? hardwareMap : base.hardwareMap,
    doublePressIntervalMs: toPositiveInt(input?.doublePressIntervalMs, base.doublePressIntervalMs),
    longPressMinMs: toPositiveInt(input?.longPressMinMs, base.longPressMinMs),
    shortPressMinMs: toPositiveInt(input?.shortPressMinMs, base.shortPressMinMs),
    rules: Array.isArray(input?.rules) ? input.rules.map(normalizeRule).filter(Boolean) : []
  };
}

function getKeyOptions() {
  const entries = Object.entries(config.hardwareMap || {})
    .map(([code, name]) => ({ code: Number(code), label: String(name || "").trim() }))
    .filter((x) => Number.isInteger(x.code) && x.code >= 0 && x.label)
    .sort((a, b) => a.code - b.code);

  const merged = entries.length > 0
    ? entries
    : FALLBACK_KEY_OPTIONS.map((x) => ({ code: x.code, label: x.label }));

  return merged.map((x) => ({ code: x.code, label: `${x.label} (${x.code})` }));
}

function renderKeyOptions() {
  const options = getKeyOptions();
  keySelectEl.innerHTML = "";

  for (const opt of options) {
    const option = document.createElement("option");
    option.value = String(opt.code);
    option.textContent = opt.label;
    keySelectEl.appendChild(option);
  }

  const custom = document.createElement("option");
  custom.value = "custom";
  custom.textContent = "Custom";
  keySelectEl.appendChild(custom);
}

function renderComboKeyOptions() {
  const options = getKeyOptions();
  comboKeySelectEl.innerHTML = "";

  for (const opt of options) {
    const option = document.createElement("option");
    option.value = String(opt.code);
    option.textContent = opt.label;
    comboKeySelectEl.appendChild(option);
  }
}

function renderConfigFields() {
  doubleIntervalEl.value = config.doublePressIntervalMs;
  longPressMinEl.value = config.longPressMinMs;
  shortPressMinEl.value = config.shortPressMinMs;
}

function renderDeviceInfo() {
  const keyCount = Object.keys(config.hardwareMap || {}).length;
  if (config.deviceName) {
    deviceInfoEl.textContent = `Device: ${config.deviceName} | Physical keys: ${keyCount}`;
  } else {
    deviceInfoEl.textContent = `Physical keys loaded: ${keyCount}`;
  }
}

function labelBehavior(behavior) {
  const map = {
    CLICK: "单击",
    SHORT_PRESS: "短按",
    LONG_PRESS: "长按",
    DOUBLE_CLICK: "双击",
    COMBO_CLICK: "组合单击",
    COMBO_SHORT_PRESS: "组合短按",
    COMBO_LONG_PRESS: "组合长按"
  };
  return map[behavior] || behavior;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderAction(action) {
  if (!action) return "";
  if (action.type === "builtin_command") return `系统命令: <code>${escapeHtml(BUILTIN_LABELS[action.command] || action.command)}</code>`;
  if (action.type === "launch_app") return `启动应用: <code>${escapeHtml(action.package)}</code>${action.activity ? ` / ${escapeHtml(action.activity)}` : ""}`;
  if (action.type === "run_shell") return `命令: <code>${escapeHtml(action.command || "")}</code>`;
  if (action.type === "send_key") return `发送按键: <code>${escapeHtml(action.keyCode)}</code>`;
  if (action.type === "launch_intent") {
    const i = action.intent || {};
    const brief = i.action || i.className || i.package || "(intent)";
    const cat = Array.isArray(i.category) ? i.category.join(",") : "";
    return `Intent: <code>${escapeHtml(brief)}</code>${cat ? ` | C:${escapeHtml(cat)}` : ""}`;
  }
  return `动作: <code>${escapeHtml(JSON.stringify(action))}</code>`;
}

function renderRules() {
  ruleListEl.innerHTML = "";

  if (!config.rules.length) {
    ruleListEl.classList.add("empty");
    ruleListEl.innerHTML = '<p class="muted">暂无规则，点击“添加规则”开始。</p>';
    return;
  }

  ruleListEl.classList.remove("empty");

  config.rules.forEach((rule, index) => {
    const item = document.createElement("div");
    item.className = "rule-item";

    let title = `按键 ${rule.keyCode}`;
    if (rule.comboKeyCode > 0) title += ` + ${rule.comboKeyCode}`;
    title += ` | ${labelBehavior(rule.behavior)}`;

    const enabledLabel = rule.enabled ? "" : "[DISABLED] ";
    const meta = `${enabledLabel}${renderAction(rule.action)}`;

    item.innerHTML = `
      <div class="rule-main">
        <div class="rule-title">${title}</div>
        <div class="rule-meta">${meta}</div>
      </div>
      <div class="rule-actions">
        <button class="btn-icon btn-small-icon" data-edit="${index}" title="编辑">${ICON_EDIT}</button>
        <button class="btn-icon btn-small-icon danger" data-delete="${index}" title="删除">${ICON_DELETE}</button>
      </div>
    `;

    ruleListEl.appendChild(item);
  });
}

function renderAll() {
  renderKeyOptions();
  renderComboKeyOptions();
  renderConfigFields();
  renderDeviceInfo();
  renderRules();
}

function toggleCustomKey() {
  const isCustom = keySelectEl.value === "custom";
  keyCodeCustomEl.classList.toggle("hidden", !isCustom);
}

function toggleBehaviorFields() {
  const isCombo = COMBO_BEHAVIORS.has(behaviorEl.value);
  labelComboKeyEl.classList.toggle("hidden", !isCombo);
}

function toggleActionFields() {
  const type = actionTypeEl.value;
  fieldBuiltinEl.classList.toggle("hidden", type !== "builtin_command");
  fieldLaunchAppEl.classList.toggle("hidden", type !== "launch_app");
  fieldShellEl.classList.toggle("hidden", type !== "run_shell");
  fieldSendKeyEl.classList.toggle("hidden", type !== "send_key");
  fieldIntentEl.classList.toggle("hidden", type !== "launch_intent");
}

function resetForm() {
  editingIndex = null;
  formTitle.textContent = "添加规则";

  const options = getKeyOptions();
  const firstCode = options.length > 0 ? String(options[0].code) : "116";

  keySelectEl.value = firstCode;
  comboKeySelectEl.value = firstCode;
  keyCodeCustomEl.value = "";
  behaviorEl.value = "CLICK";

  actionTypeEl.value = "builtin_command";
  builtinCommandEl.value = "open_voice_assistant";
  launchAppPackageEl.value = "";
  launchAppActivityEl.value = "";
  appKeywordEl.value = "";
  appResultsEl.innerHTML = "";
  commandEl.value = "";
  sendKeyCodeEl.value = "";
  intentActionEl.value = "";
  intentPackageEl.value = "";
  intentClassEl.value = "";
  intentDataEl.value = "";
  intentCategoryEl.value = "";
  intentExtrasEl.value = "";

  formErrorEl.textContent = "";

  toggleCustomKey();
  toggleBehaviorFields();
  toggleActionFields();
}

function fillForm(rule, index) {
  editingIndex = index;
  formTitle.textContent = "编辑规则";

  const options = getKeyOptions();
  const found = options.find((x) => x.code === rule.keyCode);

  if (found) {
    keySelectEl.value = String(found.code);
    keyCodeCustomEl.value = "";
  } else {
    keySelectEl.value = "custom";
    keyCodeCustomEl.value = String(rule.keyCode ?? "");
  }

  behaviorEl.value = rule.behavior;
  comboKeySelectEl.value = String(rule.comboKeyCode || (options[0]?.code || 116));

  const action = rule.action || {};
  actionTypeEl.value = action.type || "builtin_command";

  builtinCommandEl.value = action.command && BUILTIN_LABELS[action.command] ? action.command : "open_voice_assistant";
  launchAppPackageEl.value = action.package || "";
  launchAppActivityEl.value = action.activity || "";
  commandEl.value = action.type === "run_shell" ? (action.command || "") : "";
  sendKeyCodeEl.value = action.keyCode ?? "";

  if (action.type === "launch_intent") {
    const i = action.intent || {};
    intentActionEl.value = i.action || "";
    intentPackageEl.value = i.package || "";
    intentClassEl.value = i.className || "";
    intentDataEl.value = i.data || "";
    intentCategoryEl.value = Array.isArray(i.category) ? i.category.join(",") : "";
    intentExtrasEl.value = i.extras && typeof i.extras === "object"
      ? Object.entries(i.extras).map(([k, v]) => `${k}=${v}`).join("\n")
      : "";
  } else {
    intentActionEl.value = "";
    intentPackageEl.value = "";
    intentClassEl.value = "";
    intentDataEl.value = "";
    intentCategoryEl.value = "";
    intentExtrasEl.value = "";
  }

  formErrorEl.textContent = "";
  toggleCustomKey();
  toggleBehaviorFields();
  toggleActionFields();
}

function parseExtras(text, errors) {
  const map = {};
  if (!text) return map;

  const lines = String(text).split(/\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) {
      errors.push(`extras 格式错误: ${trimmed}`);
      continue;
    }

    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!key) {
      errors.push(`extras key 为空: ${trimmed}`);
      continue;
    }

    map[key] = value;
  }

  return map;
}

function validateRule(input) {
  const errors = [];
  const behavior = String(input.behavior || "").toUpperCase();
  if (!ALL_BEHAVIORS.has(behavior)) {
    errors.push("行为类型无效。");
  }

  const existing = input.existingRule || {};
  const isCombo = COMBO_BEHAVIORS.has(behavior);

  let keyCode = input.keySelect === "custom"
    ? toNonNegativeInt(input.keyCodeCustom)
    : toNonNegativeInt(input.keySelect);

  if (keyCode === null) {
    errors.push("按键代码无效。");
  }

  let comboKeyCode = 0;
  if (isCombo) {
    comboKeyCode = toNonNegativeInt(input.comboKeyCode) ?? 0;
    if (comboKeyCode <= 0) {
      errors.push("请选择组合键。");
    }
    if (keyCode !== null && comboKeyCode === keyCode) {
      errors.push("组合键不能与主键相同。");
    }
  }

  const trigger = keyCode === null
    ? ""
    : (comboKeyCode > 0 ? `${keyCode}+${comboKeyCode}` : `${keyCode}`);

  let action = { type: input.actionType };

  if (input.actionType === "builtin_command") {
    action.command = String(input.builtinCommand || "").trim();
    if (!BUILTIN_LABELS[action.command]) {
      errors.push("系统命令无效。");
    }
  } else if (input.actionType === "launch_app") {
    action.package = String(input.launchAppPackage || "").trim();
    action.activity = String(input.launchAppActivity || "").trim() || undefined;
    if (!action.package) errors.push("应用包名不能为空。");
  } else if (input.actionType === "run_shell") {
    action.command = String(input.command || "").trim();
    if (!action.command) errors.push("Shell 命令不能为空。");
  } else if (input.actionType === "send_key") {
    action.keyCode = toNonNegativeInt(input.sendKeyCode);
    if (action.keyCode === null) errors.push("发送键值无效。");
  } else if (input.actionType === "launch_intent") {
    const extras = parseExtras(input.intentExtras, errors);
    action.intent = {
      action: String(input.intentAction || "").trim() || undefined,
      package: String(input.intentPackage || "").trim() || undefined,
      className: String(input.intentClass || "").trim() || undefined,
      data: String(input.intentData || "").trim() || undefined,
      category: String(input.intentCategory || "").split(",").map((x) => x.trim()).filter(Boolean),
      extras: Object.keys(extras).length > 0 ? extras : undefined
    };
  } else {
    errors.push("动作类型无效。");
  }

  return {
    ok: errors.length === 0,
    errors,
    rule: {
      id: existing.id || null,
      description: existing.description || "",
      enabled: existing.enabled !== false,
      behavior,
      trigger,
      keyCode,
      comboKeyCode,
      action
    }
  };
}

function buildSavePayload() {
  return {
    version: config.version,
    deviceName: config.deviceName,
    hardwareMap: config.hardwareMap,
    doublePressIntervalMs: config.doublePressIntervalMs,
    longPressMinMs: config.longPressMinMs,
    shortPressMinMs: config.shortPressMinMs,
    rules: config.rules.map((rule) => ({
      id: rule.id || undefined,
      trigger: rule.trigger,
      keyCode: rule.keyCode,
      comboKeyCode: COMBO_BEHAVIORS.has(rule.behavior) ? rule.comboKeyCode : undefined,
      behavior: rule.behavior,
      action: rule.action,
      enabled: rule.enabled,
      description: rule.description
    }))
  };
}

async function loadRules() {
  try {
    setStatus("Loading config...");
    const data = await Api.getConfig();
    config = normalizeConfig(data || {});
    renderAll();
    setStatus(`Config loaded. Physical keys: ${Object.keys(config.hardwareMap || {}).length}`);
  } catch (err) {
    console.error(err);
    config = defaultConfig();
    renderAll();
    setStatus(`Load failed, fallback defaults used: ${err.message}`);
  }
}

async function saveToDisk() {
  if (!config) return;
  try {
    setStatus("Saving...");
    await Api.saveConfig(buildSavePayload());
    setStatus("Saved to YAML");
  } catch (err) {
    setStatus(`Save failed: ${err.message}`);
  }
}

async function searchApps() {
  try {
    setStatus("Loading apps...");
    if (installedApps.length === 0) {
      const data = await Api.getApps();
      installedApps = Array.isArray(data?.apps) ? data.apps : [];
    }

    const keyword = String(appKeywordEl.value || "").trim();
    const kw = keyword.toLocaleLowerCase();
    const apps = installedApps.filter((app) => {
      const pkg = String(app?.package || "").toLocaleLowerCase();
      const name = String(app?.name || "").toLocaleLowerCase();
      return !kw || pkg.includes(kw) || name.includes(kw);
    });

    appResultsEl.innerHTML = "";
    for (const app of apps) {
      const pkg = String(app.package || "").trim();
      const name = String(app.name || "").trim() || pkg;
      if (!pkg) continue;
      const option = document.createElement("option");
      option.value = pkg;
      option.textContent = `${name} (${pkg})`;
      appResultsEl.appendChild(option);
    }

    setStatus(`Found ${appResultsEl.options.length} apps`);
  } catch (err) {
    setStatus(`App search failed: ${err.message}`);
  }
}

function useSelectedApp() {
  const value = appResultsEl.value;
  if (value) {
    launchAppPackageEl.value = value;
  }
}

// Events
document.getElementById("btnSettings").onclick = () => showModal(modalSettings);
document.getElementById("btnKeySetup").onclick = openKeySetupWizard;
document.getElementById("btnAddNew").onclick = () => {
  resetForm();
  showModal(modalEditor);
};
document.getElementById("btnGlobalSave").onclick = saveToDisk;
document.querySelectorAll(".btn-close").forEach((b) => {
  b.onclick = () => {
    const modal = b.closest(".modal");
    if (!modal) return;
    if (modal.id === "keySetupModal") {
      closeKeySetupWizard();
      return;
    }
    hideModal(modal);
  };
});
document.getElementById("btnCancel").onclick = () => hideModal(modalEditor);

document.getElementById("btnApplySettings").onclick = () => {
  config.doublePressIntervalMs = toPositiveInt(doubleIntervalEl.value, config.doublePressIntervalMs);
  config.longPressMinMs = toPositiveInt(longPressMinEl.value, config.longPressMinMs);
  config.shortPressMinMs = toPositiveInt(shortPressMinEl.value, config.shortPressMinMs);
  hideModal(modalSettings);
  setStatus("Global settings updated (not saved yet)");
};

ruleListEl.onclick = (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const editIdx = btn.dataset.edit;
  const delIdx = btn.dataset.delete;

  if (editIdx !== undefined) {
    fillForm(config.rules[Number(editIdx)], Number(editIdx));
    showModal(modalEditor);
  } else if (delIdx !== undefined) {
    if (confirm("确认删除此规则？")) {
      config.rules.splice(Number(delIdx), 1);
      renderRules();
    }
  }
};

form.onsubmit = (e) => {
  e.preventDefault();

  const res = validateRule({
    keySelect: keySelectEl.value,
    keyCodeCustom: keyCodeCustomEl.value,
    behavior: behaviorEl.value,
    comboKeyCode: comboKeySelectEl.value,
    actionType: actionTypeEl.value,
    builtinCommand: builtinCommandEl.value,
    launchAppPackage: launchAppPackageEl.value,
    launchAppActivity: launchAppActivityEl.value,
    command: commandEl.value,
    sendKeyCode: sendKeyCodeEl.value,
    intentAction: intentActionEl.value,
    intentPackage: intentPackageEl.value,
    intentClass: intentClassEl.value,
    intentData: intentDataEl.value,
    intentCategory: intentCategoryEl.value,
    intentExtras: intentExtrasEl.value,
    existingRule: editingIndex === null ? null : config.rules[editingIndex]
  });

  if (!res.ok) {
    formErrorEl.textContent = res.errors.join(" ");
    return;
  }

  if (editingIndex === null) {
    config.rules.push(res.rule);
  } else {
    config.rules[editingIndex] = res.rule;
  }

  hideModal(modalEditor);
  renderRules();
};

btnSearchAppsEl.onclick = searchApps;
appResultsEl.onchange = useSelectedApp;
appResultsEl.ondblclick = useSelectedApp;

keySelectEl.onchange = toggleCustomKey;
behaviorEl.onchange = toggleBehaviorFields;
actionTypeEl.onchange = toggleActionFields;

loadRules();

let learnPollInterval = null;
let wizardType = null; // "main" or "combo"

const keySetupState = {
  active: false,
  keys: [...KEY_SETUP_SEQUENCE],
  index: 0
};

function clearLearnPoll() {
  if (learnPollInterval) {
    clearInterval(learnPollInterval);
    learnPollInterval = null;
  }
}

function formatRemain(remainingMs) {
  if (!Number.isFinite(Number(remainingMs))) return "";
  const sec = Math.max(0, Math.ceil(Number(remainingMs) / 1000));
  return `${sec}s`;
}

async function beginLearnPolling(onUpdate, onCaptured, onTimeout) {
  await Api.startLearning();
  clearLearnPoll();

  const pollOnce = async () => {
    const data = await Api.getLearnResult();
    if (typeof onUpdate === "function") onUpdate(data);

    if (data.status === "captured") {
      clearLearnPoll();
      if (typeof onCaptured === "function") onCaptured(data);
      return true;
    }
    if (data.status === "timeout") {
      clearLearnPoll();
      if (typeof onTimeout === "function") onTimeout(data);
      return true;
    }
    return false;
  };

  const done = await pollOnce();
  if (done) return;
  learnPollInterval = setInterval(async () => {
    try {
      await pollOnce();
    } catch (e) {
      console.error("learn poll error", e);
      clearLearnPoll();
    }
  }, 500);
}

// --- Single key learn button in rule editor ---

async function startKeyWizard(type) {
  wizardType = type;
  const modal = document.getElementById("wizardModal");
  const msg = document.getElementById("wizardMessage");

  modal.style.display = "flex";
  msg.textContent = "請按下實體按鍵...";
  wizardCountdownEl.textContent = "";

  try {
    await beginLearnPolling(
      (data) => {
        if (data.status === "learning") {
          wizardCountdownEl.textContent = `剩餘 ${formatRemain(data.remainingMs)}`;
        }
      },
      (data) => {
        const code = Number(data.keyCode);
        msg.textContent = `已擷取：${code}`;
        wizardCountdownEl.textContent = "";

        if (wizardType === "main") {
          applyLearnedKey(code, keySelectEl, keyCodeCustomEl);
        } else if (wizardType === "combo") {
          applyLearnedKeyToSelect(code, comboKeySelectEl);
        }

        setTimeout(() => {
          modal.style.display = "none";
        }, 900);
      },
      () => {
        msg.textContent = "逾時，未偵測到按鍵。";
        wizardCountdownEl.textContent = "";
        setTimeout(() => {
          modal.style.display = "none";
        }, 1400);
      }
    );
  } catch (e) {
    msg.textContent = `啟動學習失敗：${e.message || e}`;
    wizardCountdownEl.textContent = "";
  }
}

function applyLearnedKey(code, selectEl, customInputEl) {
  const sCode = String(code);
  let found = false;
  for (const opt of selectEl.options) {
    if (opt.value === sCode) {
      selectEl.value = sCode;
      found = true;
      break;
    }
  }

  if (found) {
    // Trigger change to hide custom input if needed
    selectEl.dispatchEvent(new Event('change'));
  } else {
    // Not found, switch to custom
    selectEl.value = 'custom';
    selectEl.dispatchEvent(new Event('change')); // Show custom input
    if (customInputEl) customInputEl.value = code;
  }
}

function applyLearnedKeyToSelect(code, selectEl) {
  const sCode = String(code);
  let found = false;
  for (const opt of selectEl.options) {
    if (opt.value === sCode) {
      selectEl.value = sCode;
      found = true;
      break;
    }
  }
  if (!found) {
    // Add temporary option?
    const opt = document.createElement('option');
    opt.value = sCode;
    opt.textContent = `Unknown (${code})`;
    selectEl.appendChild(opt);
    selectEl.value = sCode;
  }
}

function cancelWizard() {
  clearLearnPoll();
  document.getElementById("wizardModal").style.display = "none";
  wizardCountdownEl.textContent = "";
}

// --- Key Setup Wizard ---

function resetKeySetupUi() {
  keySetupProgressEl.textContent = "按「開始設定」以逐步學習實體按鍵。";
  keySetupPromptEl.textContent = "尚未開始。";
  keySetupCountdownEl.textContent = "";
  btnKeySetupStartEl.classList.remove("hidden");
  btnKeySetupRetryEl.classList.add("hidden");
  btnKeySetupSkipEl.classList.add("hidden");
}

function openKeySetupWizard() {
  if (!config) {
    setStatus("Config not loaded yet.");
    return;
  }
  keySetupState.active = true;
  keySetupState.index = 0;
  keySetupState.keys = [...KEY_SETUP_SEQUENCE];
  resetKeySetupUi();
  showModal(keySetupModalEl);
}

function closeKeySetupWizard() {
  keySetupState.active = false;
  clearLearnPoll();
  hideModal(keySetupModalEl);
}

function bindLearnedHardwareKey(name, code) {
  const numericCode = Number(code);
  if (!Number.isInteger(numericCode) || numericCode < 0) return;

  // Keep one keycode per logical name to keep mapping deterministic.
  for (const [k, v] of Object.entries(config.hardwareMap)) {
    if (v === name && Number(k) !== numericCode) {
      delete config.hardwareMap[k];
    }
  }
  config.hardwareMap[numericCode] = name;
}

function renderKeySetupProgress() {
  keySetupProgressEl.textContent = `進度 ${keySetupState.index + 1}/${keySetupState.keys.length}`;
}

function finishKeySetup() {
  keySetupState.active = false;
  keySetupPromptEl.textContent = "設定完成，請按「保存规则」寫入 YAML。";
  keySetupCountdownEl.textContent = "";
  btnKeySetupStartEl.classList.add("hidden");
  btnKeySetupRetryEl.classList.add("hidden");
  btnKeySetupSkipEl.classList.add("hidden");
  renderAll();
  setStatus("Key setup finished. Remember to save config.");
}

async function runCurrentKeySetupStep() {
  if (!keySetupState.active) return;
  if (keySetupState.index >= keySetupState.keys.length) {
    finishKeySetup();
    return;
  }

  const currentName = keySetupState.keys[keySetupState.index];
  renderKeySetupProgress();
  keySetupPromptEl.textContent = `請按下 ${currentName}`;
  keySetupCountdownEl.textContent = "啟動中...";
  btnKeySetupStartEl.classList.add("hidden");
  btnKeySetupRetryEl.classList.add("hidden");
  btnKeySetupSkipEl.classList.add("hidden");

  try {
    await beginLearnPolling(
      (data) => {
        if (data.status === "learning") {
          keySetupCountdownEl.textContent = `剩餘 ${formatRemain(data.remainingMs)}`;
        }
      },
      (data) => {
        const code = Number(data.keyCode);
        bindLearnedHardwareKey(currentName, code);
        keySetupPromptEl.textContent = `${currentName} = ${code}`;
        keySetupCountdownEl.textContent = "";
        keySetupState.index += 1;
        setTimeout(() => {
          runCurrentKeySetupStep();
        }, 500);
      },
      () => {
        keySetupPromptEl.textContent = `${currentName} 學習逾時`;
        keySetupCountdownEl.textContent = "可選擇重試或略過。";
        btnKeySetupRetryEl.classList.remove("hidden");
        btnKeySetupSkipEl.classList.remove("hidden");
      }
    );
  } catch (e) {
    keySetupPromptEl.textContent = `啟動學習失敗：${e.message || e}`;
    keySetupCountdownEl.textContent = "";
    btnKeySetupRetryEl.classList.remove("hidden");
    btnKeySetupSkipEl.classList.remove("hidden");
  }
}

btnKeySetupStartEl.onclick = () => {
  runCurrentKeySetupStep();
};

btnKeySetupRetryEl.onclick = () => {
  runCurrentKeySetupStep();
};

btnKeySetupSkipEl.onclick = () => {
  keySetupState.index += 1;
  runCurrentKeySetupStep();
};

btnKeySetupCloseEl.onclick = () => {
  closeKeySetupWizard();
};

btnKeySetupCloseXEl.onclick = () => {
  closeKeySetupWizard();
};
