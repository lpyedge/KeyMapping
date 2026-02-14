
const statusEl = document.getElementById("status");
const deviceInfoEl = document.getElementById("deviceInfo");
const ruleListEl = document.getElementById("ruleList");
const keyListEl = document.getElementById("keyList");

const btnReloadEl = document.getElementById("btnReload");
const btnGlobalSaveEl = document.getElementById("btnGlobalSave");
const btnApplySettingsEl = document.getElementById("btnApplySettings");
const btnAddNewEl = document.getElementById("btnAddNew");

const keyNameInputEl = document.getElementById("keyNameInput");
const keyCodeInputEl = document.getElementById("keyCodeInput");
const btnCaptureNewKeyEl = document.getElementById("btnCaptureNewKey");
const btnAddKeyEl = document.getElementById("btnAddKey");

const doubleIntervalEl = document.getElementById("doubleInterval");
const longPressMinEl = document.getElementById("longPressMin");
const shortPressMinEl = document.getElementById("shortPressMin");
const combinationTimeoutEl = document.getElementById("combinationTimeout");
const ruleTimeoutEl = document.getElementById("ruleTimeout");

const modalEditor = document.getElementById("modalEditor");
const form = document.getElementById("ruleForm");
const formTitle = document.getElementById("formTitle");
const formErrorEl = document.getElementById("formError");
const btnSubmitEl = document.getElementById("btnSubmit");
const btnCancelEl = document.getElementById("btnCancel");

const ruleDescriptionEl = document.getElementById("ruleDescription");
const ruleEnabledEl = document.getElementById("ruleEnabled");
const keySelectEl = document.getElementById("keySelect");
const keyCodeCustomEl = document.getElementById("keyCodeCustom");
const behaviorEl = document.getElementById("behavior");
const comboKeySelectEl = document.getElementById("comboKeySelect");
const labelComboKeyEl = document.getElementById("labelComboKey");
const btnLearnMainEl = document.getElementById("btnLearnMain");
const btnLearnComboEl = document.getElementById("btnLearnCombo");

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

const wizardModalEl = document.getElementById("wizardModal");
const wizardMessageEl = document.getElementById("wizardMessage");
const wizardCountdownEl = document.getElementById("wizardCountdown");
const btnWizardCancelEl = document.getElementById("btnWizardCancel");

const COMBO_BEHAVIORS = new Set(["COMBO_CLICK", "COMBO_SHORT_PRESS", "COMBO_LONG_PRESS"]);
const ALL_BEHAVIORS = new Set(["CLICK", "SHORT_PRESS", "LONG_PRESS", "DOUBLE_CLICK", "COMBO_CLICK", "COMBO_SHORT_PRESS", "COMBO_LONG_PRESS"]);
const EDITABLE_ACTION_TYPES = new Set(["builtin_command", "launch_app", "run_shell", "send_key", "launch_intent"]);
const PROTECTED_KEY_NAMES = new Set(["POWER", "VOL_UP", "VOL_DOWN"]);

const BUILTIN_LABELS = {
  mute_toggle: "静音切换",
  open_voice_assistant: "打开语音助手",
  open_camera: "打开相机",
  toggle_flashlight: "切换手电筒",
  toggle_do_not_disturb: "切换勿扰模式"
};

const FALLBACK_KEY_OPTIONS = [
  { label: "POWER", code: 116 },
  { label: "VOL_UP", code: 115 },
  { label: "VOL_DOWN", code: 114 },
  { label: "HOME", code: 102 },
  { label: "MENU", code: 139 }
];

let config = null;
let editingIndex = null;
let editorLocked = false;
let installedApps = [];
let learnPollInterval = null;

const Api = {
  async getConfig() {
    const res = await fetch("/api/config");
    if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
    return await res.json();
  },
  async saveConfig(payload) {
    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
  },
  async getApps() {
    const res = await fetch("/api/apps");
    if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
    return await res.json();
  },
  async startLearning() {
    const res = await fetch("/api/system/learn-start", { method: "POST" });
    if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
  },
  async getLearnResult() {
    const res = await fetch("/api/system/learn-result");
    if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
    return await res.json();
  }
};

function setStatus(message) { statusEl.textContent = message; }
function showModal(modal) { modal.classList.add("show"); }
function hideModal(modal) { modal.classList.remove("show"); }
function deepClone(v) { return JSON.parse(JSON.stringify(v)); }

function defaultConfig() {
  return {
    version: 1,
    deviceName: "",
    hardwareMap: { 116: "POWER", 115: "VOL_UP", 114: "VOL_DOWN", 102: "HOME", 139: "MENU" },
    doublePressIntervalMs: 300,
    longPressMinMs: 800,
    shortPressMinMs: 300,
    combinationTimeoutMs: 200,
    ruleTimeoutMs: 5000,
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
  const raw = deepClone(action);
  const type = String(action.type || "").trim();
  if (!type) return null;

  if (type === "run_shell") return { supported: true, value: { type, command: String(action.command || "") }, raw };
  if (type === "send_key") {
    const keyCode = toNonNegativeInt(action.keyCode);
    return keyCode === null ? null : { supported: true, value: { type, keyCode }, raw };
  }
  if (type === "builtin_command") {
    const command = String(action.command || "").trim();
    return BUILTIN_LABELS[command] ? { supported: true, value: { type, command }, raw } : null;
  }
  if (type === "launch_app") {
    const packageName = String(action.package || "").trim();
    if (!packageName) return null;
    const activity = String(action.activity || "").trim();
    return { supported: true, value: { type, package: packageName, activity: activity || undefined }, raw };
  }
  if (type === "launch_intent") {
    const i = action.intent && typeof action.intent === "object" ? action.intent : {};
    const extras = {};
    if (i.extras && typeof i.extras === "object") {
      for (const [k, v] of Object.entries(i.extras)) {
        const key = String(k || "").trim();
        if (key) extras[key] = String(v ?? "");
      }
    }
    return {
      supported: true,
      value: {
        type,
        intent: {
          action: i.action ? String(i.action) : "",
          package: i.package ? String(i.package) : "",
          className: i.className ? String(i.className) : "",
          data: i.data ? String(i.data) : "",
          category: Array.isArray(i.category) ? i.category.map((x) => String(x).trim()).filter(Boolean) : [],
          extras
        }
      },
      raw
    };
  }

  return { supported: false, value: raw, raw };
}

function normalizeRule(rule) {
  if (!rule || typeof rule !== "object") return null;
  const behavior = String(rule.behavior || "").toUpperCase();
  if (!ALL_BEHAVIORS.has(behavior)) return null;

  const actionInfo = normalizeAction(rule.action);
  if (!actionInfo) return null;

  let keyCode = toNonNegativeInt(rule.keyCode);
  let comboKeyCode = toNonNegativeInt(rule.comboKeyCode) ?? 0;
  if (keyCode === null) return null;

  if (COMBO_BEHAVIORS.has(behavior)) {
    if (comboKeyCode <= 0 || comboKeyCode === keyCode) return null;
  } else comboKeyCode = 0;

  const trigger = comboKeyCode > 0 ? `${keyCode}+${comboKeyCode}` : `${keyCode}`;
  if (typeof rule.trigger === "string" && rule.trigger.trim() && rule.trigger.trim() !== trigger) return null;

  return {
    id: typeof rule.id === "string" ? rule.id : null,
    description: typeof rule.description === "string" ? rule.description : "",
    enabled: rule.enabled !== false,
    behavior,
    trigger,
    keyCode,
    comboKeyCode,
    action: actionInfo.value,
    uiUnsupportedAction: !actionInfo.supported,
    rawAction: actionInfo.raw
  };
}

function normalizeConfig(input) {
  const base = defaultConfig();
  const hardwareMap = normalizeHardwareMap(input?.hardwareMap);
  return {
    version: toPositiveInt(input?.version, 1),
    deviceName: String(input?.deviceName || "").trim(),
    hardwareMap: Object.keys(hardwareMap).length ? hardwareMap : base.hardwareMap,
    doublePressIntervalMs: toPositiveInt(input?.doublePressIntervalMs, base.doublePressIntervalMs),
    longPressMinMs: toPositiveInt(input?.longPressMinMs, base.longPressMinMs),
    shortPressMinMs: toPositiveInt(input?.shortPressMinMs, base.shortPressMinMs),
    combinationTimeoutMs: toPositiveInt(input?.combinationTimeoutMs, base.combinationTimeoutMs),
    ruleTimeoutMs: toPositiveInt(input?.ruleTimeoutMs, base.ruleTimeoutMs),
    rules: Array.isArray(input?.rules) ? input.rules.map(normalizeRule).filter(Boolean) : []
  };
}
function serializeRuleAction(rule) {
  const source = rule.uiUnsupportedAction ? rule.rawAction : rule.action;
  return deepClone(source);
}

function buildSavePayload() {
  return {
    version: config.version,
    deviceName: config.deviceName,
    hardwareMap: config.hardwareMap,
    doublePressIntervalMs: config.doublePressIntervalMs,
    longPressMinMs: config.longPressMinMs,
    shortPressMinMs: config.shortPressMinMs,
    combinationTimeoutMs: config.combinationTimeoutMs,
    ruleTimeoutMs: config.ruleTimeoutMs,
    rules: config.rules.map((rule) => ({
      id: rule.id || undefined,
      trigger: rule.trigger,
      keyCode: rule.keyCode,
      comboKeyCode: COMBO_BEHAVIORS.has(rule.behavior) ? rule.comboKeyCode : undefined,
      behavior: rule.behavior,
      action: serializeRuleAction(rule),
      enabled: rule.enabled,
      description: rule.description
    }))
  };
}

function getHardwareEntries() {
  return Object.entries(config.hardwareMap || {})
    .map(([code, name]) => ({ code: Number(code), name: String(name || "") }))
    .filter((x) => Number.isInteger(x.code) && x.code >= 0 && x.name)
    .sort((a, b) => a.code - b.code);
}

function getKeyOptions() {
  const entries = getHardwareEntries().map((x) => ({ code: x.code, label: `${x.name} (${x.code})` }));
  return entries.length ? entries : FALLBACK_KEY_OPTIONS.map((x) => ({ code: x.code, label: `${x.label} (${x.code})` }));
}

function renderKeyOptions() {
  const options = getKeyOptions();
  keySelectEl.innerHTML = "";
  comboKeySelectEl.innerHTML = "";

  for (const opt of options) {
    const o1 = document.createElement("option");
    o1.value = String(opt.code);
    o1.textContent = opt.label;
    keySelectEl.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = String(opt.code);
    o2.textContent = opt.label;
    comboKeySelectEl.appendChild(o2);
  }

  const custom = document.createElement("option");
  custom.value = "custom";
  custom.textContent = "Custom";
  keySelectEl.appendChild(custom);
}

function renderGlobalSettings() {
  doubleIntervalEl.value = config.doublePressIntervalMs;
  longPressMinEl.value = config.longPressMinMs;
  shortPressMinEl.value = config.shortPressMinMs;
  combinationTimeoutEl.value = config.combinationTimeoutMs;
  ruleTimeoutEl.value = config.ruleTimeoutMs;
}

function renderDeviceInfo() {
  const count = Object.keys(config.hardwareMap || {}).length;
  deviceInfoEl.textContent = config.deviceName
    ? `Device: ${config.deviceName} | Physical keys: ${count}`
    : `Physical keys loaded: ${count}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderKeyList() {
  const entries = getHardwareEntries();
  keyListEl.innerHTML = "";
  if (!entries.length) {
    keyListEl.innerHTML = '<tr><td colspan="4" class="muted">暂无物理按键映射。</td></tr>';
    return;
  }

  for (const entry of entries) {
    const protectedKey = PROTECTED_KEY_NAMES.has(entry.name);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code>${escapeHtml(entry.name)}</code></td>
      <td><code>${entry.code}</code></td>
      <td><span class="badge ${protectedKey ? "badge-protected" : "badge-custom"}">${protectedKey ? "系统保留" : "自定义"}</span></td>
      <td>
        <div class="rule-actions">
          <button class="btn-secondary" data-key-action="learn" data-code="${entry.code}">识别</button>
          <button class="btn-secondary" data-key-action="rename" data-code="${entry.code}">重命名</button>
          <button class="btn-danger" data-key-action="delete" data-code="${entry.code}" ${protectedKey ? "disabled" : ""}>删除</button>
        </div>
      </td>
    `;
    keyListEl.appendChild(tr);
  }
}

function labelBehavior(behavior) {
  return {
    CLICK: "单击",
    SHORT_PRESS: "短按",
    LONG_PRESS: "长按",
    DOUBLE_CLICK: "双击",
    COMBO_CLICK: "组合单击",
    COMBO_SHORT_PRESS: "组合短按",
    COMBO_LONG_PRESS: "组合长按"
  }[behavior] || behavior;
}

function renderAction(action, unsupported) {
  if (unsupported) return `复杂行为(<code>${escapeHtml(action?.type || "unknown")}</code>)，当前 UI 只读保护`;
  if (!action) return "";
  if (action.type === "builtin_command") return `系统命令: <code>${escapeHtml(BUILTIN_LABELS[action.command] || action.command)}</code>`;
  if (action.type === "launch_app") return `启动应用: <code>${escapeHtml(action.package)}</code>${action.activity ? ` / ${escapeHtml(action.activity)}` : ""}`;
  if (action.type === "run_shell") return `命令: <code>${escapeHtml(action.command || "")}</code>`;
  if (action.type === "send_key") return `发送按键: <code>${escapeHtml(action.keyCode)}</code>`;
  if (action.type === "launch_intent") return "Intent 启动";
  return `行为: <code>${escapeHtml(action.type || "unknown")}</code>`;
}

function renderRules() {
  ruleListEl.innerHTML = "";
  if (!config.rules.length) {
    ruleListEl.classList.add("empty");
    ruleListEl.innerHTML = '<p class="muted">暂无规则，点击“新增规则”开始。</p>';
    return;
  }

  ruleListEl.classList.remove("empty");
  config.rules.forEach((rule, index) => {
    const item = document.createElement("div");
    item.className = "rule-item";

    const title = `条件: 按键 ${rule.keyCode}${rule.comboKeyCode > 0 ? ` + ${rule.comboKeyCode}` : ""} | ${labelBehavior(rule.behavior)}`;
    const tags = [];
    if (!rule.enabled) tags.push('<span class="badge badge-custom">已停用</span>');
    if (rule.uiUnsupportedAction) tags.push('<span class="badge badge-protected">复杂行为只读</span>');

    item.innerHTML = `
      <div>
        <div class="rule-title">${title}</div>
        <div class="rule-meta">
          ${rule.description ? `<div>说明: ${escapeHtml(rule.description)}</div>` : ""}
          <div>行为: ${renderAction(rule.action, rule.uiUnsupportedAction)}</div>
          ${tags.length ? `<div style="margin-top:6px;">${tags.join(" ")}</div>` : ""}
        </div>
      </div>
      <div class="rule-actions">
        <button class="btn-secondary" data-edit="${index}">编辑</button>
        <button class="btn-danger" data-delete="${index}">删除</button>
      </div>
    `;
    ruleListEl.appendChild(item);
  });
}

function renderAll() {
  renderGlobalSettings();
  renderDeviceInfo();
  renderKeyList();
  renderKeyOptions();
  renderRules();
}

function clearLearnPoll() {
  if (learnPollInterval) {
    clearInterval(learnPollInterval);
    learnPollInterval = null;
  }
}

function formatRemain(ms) {
  return `${Math.max(0, Math.ceil(Number(ms || 0) / 1000))}s`;
}

async function startLearnFlow({ onCaptured }) {
  showModal(wizardModalEl);
  wizardMessageEl.textContent = "请按下目标物理按键...";
  wizardCountdownEl.textContent = "";
  await Api.startLearning();
  clearLearnPoll();

  const pollOnce = async () => {
    const data = await Api.getLearnResult();
    if (data.status === "learning") {
      wizardCountdownEl.textContent = `剩余 ${formatRemain(data.remainingMs)}`;
      return false;
    }
    if (data.status === "captured") {
      const code = Number(data.keyCode);
      wizardMessageEl.textContent = `已识别: ${code}`;
      wizardCountdownEl.textContent = "";
      if (typeof onCaptured === "function") onCaptured(code);
      clearLearnPoll();
      setTimeout(() => hideModal(wizardModalEl), 600);
      return true;
    }
    if (data.status === "timeout") {
      wizardMessageEl.textContent = "学习超时，请重试";
      wizardCountdownEl.textContent = "";
      clearLearnPoll();
      return true;
    }
    return false;
  };

  const done = await pollOnce();
  if (!done) {
    learnPollInterval = setInterval(async () => {
      try { await pollOnce(); }
      catch (e) {
        wizardMessageEl.textContent = `学习失败: ${e.message || e}`;
        clearLearnPoll();
      }
    }, 450);
  }
}

function closeLearnModal() {
  clearLearnPoll();
  hideModal(wizardModalEl);
}

function bindLearnedHardwareKey(name, code) {
  const normalizedName = String(name || "").trim();
  const numericCode = Number(code);
  if (!normalizedName || !Number.isInteger(numericCode) || numericCode < 0) return false;

  for (const [k, v] of Object.entries(config.hardwareMap || {})) {
    if (v === normalizedName && Number(k) !== numericCode) delete config.hardwareMap[k];
  }
  config.hardwareMap[numericCode] = normalizedName;
  return true;
}

function addCustomKey(name, code) {
  const normalizedName = String(name || "").trim();
  const numericCode = toNonNegativeInt(code);
  if (!normalizedName) return setStatus("新增失败: 名称不能为空");
  if (numericCode === null) return setStatus("新增失败: keyCode 无效");
  if (Object.values(config.hardwareMap).includes(normalizedName)) return setStatus(`新增失败: 名称 ${normalizedName} 已存在`);

  bindLearnedHardwareKey(normalizedName, numericCode);
  renderAll();
  setStatus(`已新增按键 ${normalizedName} = ${numericCode}`);
}
function renameCustomKey(code) {
  const numericCode = Number(code);
  const oldName = config.hardwareMap[numericCode];
  if (!oldName) return;
  if (PROTECTED_KEY_NAMES.has(oldName)) return setStatus(`${oldName} 为系统保留键，不允许重命名`);

  const next = prompt("请输入新名称", oldName);
  if (next === null) return;
  const normalized = next.trim();
  if (!normalized) return setStatus("重命名失败: 名称不能为空");
  if (Object.values(config.hardwareMap).includes(normalized) && normalized !== oldName) return setStatus(`重命名失败: 名称 ${normalized} 已存在`);

  config.hardwareMap[numericCode] = normalized;
  renderAll();
  setStatus(`按键已重命名: ${oldName} -> ${normalized}`);
}

function deleteCustomKey(code) {
  const numericCode = Number(code);
  const name = config.hardwareMap[numericCode];
  if (!name) return;
  if (PROTECTED_KEY_NAMES.has(name)) return setStatus(`${name} 为系统保留键，不允许删除`);
  if (!confirm(`确认删除按键 ${name} (${numericCode}) ?`)) return;

  delete config.hardwareMap[numericCode];
  renderAll();
  setStatus(`已删除按键 ${name} (${numericCode})`);
}

function toggleCustomKey() { keyCodeCustomEl.classList.toggle("hidden", keySelectEl.value !== "custom"); }
function toggleBehaviorFields() { labelComboKeyEl.classList.toggle("hidden", !COMBO_BEHAVIORS.has(behaviorEl.value)); }
function toggleActionFields() {
  const type = actionTypeEl.value;
  fieldBuiltinEl.classList.toggle("hidden", type !== "builtin_command");
  fieldLaunchAppEl.classList.toggle("hidden", type !== "launch_app");
  fieldShellEl.classList.toggle("hidden", type !== "run_shell");
  fieldSendKeyEl.classList.toggle("hidden", type !== "send_key");
  fieldIntentEl.classList.toggle("hidden", type !== "launch_intent");
}

function setEditorDisabled(disabled) {
  for (const el of form.querySelectorAll("input,select,textarea,button")) {
    if (el.id === "btnCancel") continue;
    el.disabled = disabled;
  }
  btnSubmitEl.disabled = disabled;
}

function resetForm() {
  editingIndex = null;
  editorLocked = false;
  setEditorDisabled(false);
  formTitle.textContent = "新增规则";

  const firstCode = getKeyOptions()[0]?.code ?? 116;
  ruleDescriptionEl.value = "";
  ruleEnabledEl.value = "true";
  keySelectEl.value = String(firstCode);
  comboKeySelectEl.value = String(firstCode);
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
  editorLocked = !!rule.uiUnsupportedAction;
  setEditorDisabled(false);
  formTitle.textContent = "编辑规则";

  const found = getKeyOptions().find((x) => x.code === rule.keyCode);
  if (found) {
    keySelectEl.value = String(found.code);
    keyCodeCustomEl.value = "";
  } else {
    keySelectEl.value = "custom";
    keyCodeCustomEl.value = String(rule.keyCode ?? "");
  }

  ruleDescriptionEl.value = rule.description || "";
  ruleEnabledEl.value = rule.enabled === false ? "false" : "true";
  behaviorEl.value = rule.behavior;
  comboKeySelectEl.value = String(rule.comboKeyCode || getKeyOptions()[0]?.code || 116);

  if (rule.uiUnsupportedAction) {
    formErrorEl.textContent = "该规则使用复杂行为，当前 UI 只读保护，禁止提交以避免误覆盖。";
    setEditorDisabled(true);
    btnCancelEl.disabled = false;
    return;
  }

  const action = rule.action || {};
  actionTypeEl.value = EDITABLE_ACTION_TYPES.has(action.type) ? action.type : "builtin_command";
  builtinCommandEl.value = BUILTIN_LABELS[action.command] ? action.command : "open_voice_assistant";
  launchAppPackageEl.value = action.package || "";
  launchAppActivityEl.value = action.activity || "";
  commandEl.value = action.type === "run_shell" ? action.command || "" : "";
  sendKeyCodeEl.value = action.keyCode ?? "";

  if (action.type === "launch_intent") {
    const i = action.intent || {};
    intentActionEl.value = i.action || "";
    intentPackageEl.value = i.package || "";
    intentClassEl.value = i.className || "";
    intentDataEl.value = i.data || "";
    intentCategoryEl.value = Array.isArray(i.category) ? i.category.join(",") : "";
    intentExtrasEl.value = i.extras && typeof i.extras === "object" ? Object.entries(i.extras).map(([k, v]) => `${k}=${v}`).join("\n") : "";
  }

  formErrorEl.textContent = "";
  toggleCustomKey();
  toggleBehaviorFields();
  toggleActionFields();
}

function parseExtras(text, errors) {
  const map = {};
  for (const line of String(text || "").split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) { errors.push(`extras 格式错误: ${trimmed}`); continue; }
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!key) { errors.push(`extras key 为空: ${trimmed}`); continue; }
    map[key] = value;
  }
  return map;
}

function validateRule(input) {
  const errors = [];
  const behavior = String(input.behavior || "").toUpperCase();
  if (!ALL_BEHAVIORS.has(behavior)) errors.push("行为类型无效。");

  const keyCode = input.keySelect === "custom" ? toNonNegativeInt(input.keyCodeCustom) : toNonNegativeInt(input.keySelect);
  if (keyCode === null) errors.push("主按键代码无效。");

  let comboKeyCode = 0;
  if (COMBO_BEHAVIORS.has(behavior)) {
    comboKeyCode = toNonNegativeInt(input.comboKeyCode) ?? 0;
    if (comboKeyCode <= 0) errors.push("组合键无效。");
    if (keyCode !== null && comboKeyCode === keyCode) errors.push("组合键不能与主键相同。");
  }

  const trigger = keyCode === null ? "" : (comboKeyCode > 0 ? `${keyCode}+${comboKeyCode}` : `${keyCode}`);
  const actionType = String(input.actionType || "");
  const action = { type: actionType };
  if (!EDITABLE_ACTION_TYPES.has(actionType)) errors.push("行为类型不支持。");

  if (actionType === "builtin_command") {
    action.command = String(input.builtinCommand || "").trim();
    if (!BUILTIN_LABELS[action.command]) errors.push("系统命令无效。");
  } else if (actionType === "launch_app") {
    action.package = String(input.launchAppPackage || "").trim();
    action.activity = String(input.launchAppActivity || "").trim() || undefined;
    if (!action.package) errors.push("应用包名不能为空。");
  } else if (actionType === "run_shell") {
    action.command = String(input.command || "").trim();
    if (!action.command) errors.push("Shell 命令不能为空。");
  } else if (actionType === "send_key") {
    action.keyCode = toNonNegativeInt(input.sendKeyCode);
    if (action.keyCode === null) errors.push("发送键值无效。");
  } else if (actionType === "launch_intent") {
    const extras = parseExtras(input.intentExtras, errors);
    action.intent = {
      action: String(input.intentAction || "").trim() || undefined,
      package: String(input.intentPackage || "").trim() || undefined,
      className: String(input.intentClass || "").trim() || undefined,
      data: String(input.intentData || "").trim() || undefined,
      category: String(input.intentCategory || "").split(",").map((x) => x.trim()).filter(Boolean),
      extras: Object.keys(extras).length ? extras : undefined
    };
  }

  return {
    ok: errors.length === 0,
    errors,
    rule: {
      id: input.existing?.id || null,
      description: String(input.description || "").trim(),
      enabled: input.enabled === true,
      behavior,
      trigger,
      keyCode,
      comboKeyCode,
      action,
      uiUnsupportedAction: false,
      rawAction: deepClone(action)
    }
  };
}

async function loadRules() {
  try {
    setStatus("加载配置中...");
    const data = await Api.getConfig();
    config = normalizeConfig(data || {});
    renderAll();
    const unsupported = config.rules.filter((r) => r.uiUnsupportedAction).length;
    setStatus(unsupported > 0 ? `配置已加载，发现 ${unsupported} 条复杂行为规则，已启用只读保护。` : "配置已加载");
  } catch (err) {
    console.error(err);
    config = defaultConfig();
    renderAll();
    setStatus(`加载失败，已回退默认配置: ${err.message}`);
  }
}

async function saveToDisk() {
  try {
    setStatus("保存中...");
    await Api.saveConfig(buildSavePayload());
    setStatus("已保存到 YAML");
  } catch (err) {
    setStatus(`保存失败: ${err.message}`);
  }
}

async function searchApps() {
  try {
    if (installedApps.length === 0) {
      const data = await Api.getApps();
      installedApps = Array.isArray(data?.apps) ? data.apps : [];
    }
    const keyword = String(appKeywordEl.value || "").trim().toLowerCase();
    const apps = installedApps.filter((app) => {
      const pkg = String(app?.package || "").toLowerCase();
      const name = String(app?.name || "").toLowerCase();
      return !keyword || pkg.includes(keyword) || name.includes(keyword);
    });

    appResultsEl.innerHTML = "";
    for (const app of apps) {
      const pkg = String(app.package || "").trim();
      if (!pkg) continue;
      const o = document.createElement("option");
      o.value = pkg;
      o.textContent = `${app.name || pkg} (${pkg})`;
      appResultsEl.appendChild(o);
    }
    setStatus(`应用检索完成: ${appResultsEl.options.length} 条`);
  } catch (err) {
    setStatus(`应用检索失败: ${err.message}`);
  }
}

function useSelectedApp() {
  if (appResultsEl.value) launchAppPackageEl.value = appResultsEl.value;
}

btnReloadEl.onclick = loadRules;
btnGlobalSaveEl.onclick = saveToDisk;
btnApplySettingsEl.onclick = () => {
  config.doublePressIntervalMs = toPositiveInt(doubleIntervalEl.value, config.doublePressIntervalMs);
  config.longPressMinMs = toPositiveInt(longPressMinEl.value, config.longPressMinMs);
  config.shortPressMinMs = toPositiveInt(shortPressMinEl.value, config.shortPressMinMs);
  config.combinationTimeoutMs = toPositiveInt(combinationTimeoutEl.value, config.combinationTimeoutMs);
  config.ruleTimeoutMs = toPositiveInt(ruleTimeoutEl.value, config.ruleTimeoutMs);
  renderGlobalSettings();
  setStatus("全局设置已应用（未保存）");
};

btnCaptureNewKeyEl.onclick = async () => {
  try {
    await startLearnFlow({ onCaptured: (code) => { keyCodeInputEl.value = String(code); } });
  } catch (e) {
    setStatus(`学习失败: ${e.message || e}`);
  }
};
btnAddKeyEl.onclick = () => addCustomKey(keyNameInputEl.value, keyCodeInputEl.value);

keyListEl.onclick = async (e) => {
  const btn = e.target.closest("button[data-key-action]");
  if (!btn) return;
  const code = Number(btn.dataset.code);
  const name = config.hardwareMap[code];

  if (btn.dataset.keyAction === "learn") {
    try {
      await startLearnFlow({
        onCaptured: (captured) => {
          if (bindLearnedHardwareKey(name, captured)) {
            renderAll();
            setStatus(`按键 ${name} 已更新为 ${captured}`);
          }
        }
      });
    } catch (e2) { setStatus(`学习失败: ${e2.message || e2}`); }
  } else if (btn.dataset.keyAction === "rename") {
    renameCustomKey(code);
  } else if (btn.dataset.keyAction === "delete") {
    deleteCustomKey(code);
  }
};

btnAddNewEl.onclick = () => { resetForm(); showModal(modalEditor); };
btnCancelEl.onclick = () => hideModal(modalEditor);
btnWizardCancelEl.onclick = closeLearnModal;
for (const closeBtn of document.querySelectorAll(".btn-close")) closeBtn.onclick = () => hideModal(closeBtn.closest(".modal"));

btnLearnMainEl.onclick = async () => {
  try {
    await startLearnFlow({
      onCaptured: (code) => {
        const codeStr = String(code);
        let found = false;
        for (const opt of keySelectEl.options) {
          if (opt.value === codeStr) { keySelectEl.value = codeStr; found = true; break; }
        }
        if (!found) {
          keySelectEl.value = "custom";
          keyCodeCustomEl.value = codeStr;
          toggleCustomKey();
        }
      }
    });
  } catch (e) { setStatus(`学习失败: ${e.message || e}`); }
};

btnLearnComboEl.onclick = async () => {
  try {
    await startLearnFlow({
      onCaptured: (code) => {
        const codeStr = String(code);
        for (const opt of comboKeySelectEl.options) {
          if (opt.value === codeStr) { comboKeySelectEl.value = codeStr; return; }
        }
        const extra = document.createElement("option");
        extra.value = codeStr;
        extra.textContent = `Unknown (${codeStr})`;
        comboKeySelectEl.appendChild(extra);
        comboKeySelectEl.value = codeStr;
      }
    });
  } catch (e) { setStatus(`学习失败: ${e.message || e}`); }
};

ruleListEl.onclick = (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  if (btn.dataset.edit !== undefined) {
    const idx = Number(btn.dataset.edit);
    fillForm(config.rules[idx], idx);
    showModal(modalEditor);
  } else if (btn.dataset.delete !== undefined) {
    const idx = Number(btn.dataset.delete);
    if (confirm("确认删除此规则？")) {
      config.rules.splice(idx, 1);
      renderRules();
      setStatus("规则已删除（未保存）");
    }
  }
};

keySelectEl.onchange = toggleCustomKey;
behaviorEl.onchange = toggleBehaviorFields;
actionTypeEl.onchange = toggleActionFields;
btnSearchAppsEl.onclick = searchApps;
appResultsEl.onchange = useSelectedApp;
appResultsEl.ondblclick = useSelectedApp;

form.onsubmit = (e) => {
  e.preventDefault();
  if (editorLocked) {
    formErrorEl.textContent = "该规则为复杂行为，已禁止提交，避免误覆盖。";
    return;
  }

  const existing = editingIndex === null ? null : config.rules[editingIndex];
  const result = validateRule({
    existing,
    description: ruleDescriptionEl.value,
    enabled: ruleEnabledEl.value === "true",
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
    intentExtras: intentExtrasEl.value
  });

  if (!result.ok) {
    formErrorEl.textContent = result.errors.join(" ");
    return;
  }

  if (editingIndex === null) config.rules.push(result.rule);
  else config.rules[editingIndex] = result.rule;

  hideModal(modalEditor);
  renderRules();
  setStatus("规则已更新（未保存）");
};

loadRules();
