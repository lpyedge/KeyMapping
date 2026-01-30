// SVG Icons
const ICON_EDIT = `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M20.71,7.04C21.1,6.65 21.1,6.02 20.71,5.63L18.37,3.29C17.97,2.9 17.34,2.9 16.94,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z"/></svg>`;
const ICON_DELETE = `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19V4M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>`;

// DOM refs
const statusEl = document.getElementById("status");
const ruleListEl = document.getElementById("ruleList");
const form = document.getElementById("ruleForm");
const formTitle = document.getElementById("formTitle");
const keySelectEl = document.getElementById("keySelect");
const keyCodeCustomEl = document.getElementById("keyCodeCustom");
const behaviorEl = document.getElementById("behavior");
const durationEl = document.getElementById("durationMs");
const actionTypeEl = document.getElementById("actionType");
const commandEl = document.getElementById("command");
const sendKeyCodeEl = document.getElementById("sendKeyCode");
const intentJsonEl = document.getElementById("intentJson");
const fieldShellEl = document.getElementById("fieldShell");
const fieldSendKeyEl = document.getElementById("fieldSendKey");
const fieldIntentEl = document.getElementById("fieldIntent");
const formErrorEl = document.getElementById("formError");
const doubleIntervalEl = document.getElementById("doubleInterval");
const longPressMinEl = document.getElementById("longPressMin");
const comboKeySelectEl = document.getElementById("comboKeySelect");
const labelComboKeyEl = document.getElementById("labelComboKey");

// Modals
const modalSettings = document.getElementById("modalSettings");
const modalEditor = document.getElementById("modalEditor");

const KEY_OPTIONS = [
  { label: "电源键 (POWER)", code: 26 },
  { label: "音量加 (VOLUME_UP)", code: 24 },
  { label: "音量减 (VOLUME_DOWN)", code: 25 },
  { label: "相机键 (CAMERA)", code: 27 },
  { label: "助手键 (ASSIST)", code: 219 },
  { label: "耳机按键 (HEADSET_HOOK)", code: 79 },
  { label: "播放/暂停 (MEDIA_PLAY_PAUSE)", code: 85 },
  { label: "上一曲 (MEDIA_PREVIOUS)", code: 88 },
  { label: "下一曲 (MEDIA_NEXT)", code: 87 },
  { label: "接听电话 (CALL)", code: 5 },
  { label: "挂断电话 (ENDCALL)", code: 6 },
  { label: "其它 / 自定义", code: "custom" },
];

let config = null;
let editingIndex = null;

function setStatus(message) {
  statusEl.textContent = message;
}

// Modal helper
function showModal(modal) {
  modal.classList.add("show");
}
function hideModal(modal) {
  modal.classList.remove("show");
}

// 統一 Bridge 適配器
const UnifiedBridge = {
  async load() {
    if (window.PowerKeyRulesAndroid && typeof window.PowerKeyRulesAndroid.loadRulesJson === "function") {
      return window.PowerKeyRulesAndroid.loadRulesJson();
    }
    throw new Error("无可用 Bridge：仅支持 APK 内嵌 WebView 环境");
  },
  async save(content) {
    if (window.PowerKeyRulesAndroid && typeof window.PowerKeyRulesAndroid.saveRulesJson === "function") {
      const success = window.PowerKeyRulesAndroid.saveRulesJson(content);
      if (!success) throw new Error("保存失败");
      return;
    }
    throw new Error("无可用 Bridge");
  },
  async loadDefault() {
    if (window.PowerKeyRulesAndroid && typeof window.PowerKeyRulesAndroid.loadDefaultRulesJson === "function") {
      return window.PowerKeyRulesAndroid.loadDefaultRulesJson();
    }
    return null;
  }
};

async function fetchDefaultConfig() {
  try {
    const json = await UnifiedBridge.loadDefault();
    if (json) return JSON.parse(json);
  } catch (_) { }
  return {
    version: 1,
    doublePressIntervalMs: 300,
    longPressMinMs: 500,
    rules: [],
  };
}

async function loadRules() {
  try {
    setStatus("正在读取规则...");
    const json = await UnifiedBridge.load();
    const parsed = JSON.parse(json || "{}");
    config = normalizeConfig(parsed);

    // 如果讀取的規則為空，則嘗試載入默認模板
    if (config.rules.length === 0) {
      const defaultConfig = await fetchDefaultConfig();
      if (defaultConfig && defaultConfig.rules.length > 0) {
        config.rules = defaultConfig.rules;
        setStatus("已载入默认模板（初始规则）");
      } else {
        setStatus("已读取空配置");
      }
    } else {
      setStatus("已读取当前配置");
    }
    render();
  } catch (err) {
    console.error(err);
    config = await fetchDefaultConfig();
    render();
    setStatus(`读取失败，已载入默认模板 (${err.message})`);
  }
}

function normalizeConfig(input) {
  return {
    version: Number(input.version) || 1,
    doublePressIntervalMs: Number(input.doublePressIntervalMs) || 300,
    longPressMinMs: Number(input.longPressMinMs) || 500,
    rules: Array.isArray(input.rules) ? input.rules.map(normalizeRule).filter(Boolean) : [],
  };
}

function normalizeRule(r) {
  if (!r) return null;
  const keyCode = Number(r.keyCode);
  if (!Number.isInteger(keyCode) || keyCode < 0) return null;
  const behavior = String(r.behavior || "").toUpperCase();
  const durationMs = Number(r.durationMs) || 0;
  const comboKeyCode = Number(r.comboKeyCode) || 0;
  const action = r.action || {};
  return { keyCode, behavior, durationMs, comboKeyCode, action };
}

function render() {
  renderConfigFields();
  renderKeyOptions();
  renderComboKeyOptions();
  renderRules();
}

function renderKeyOptions() {
  keySelectEl.innerHTML = "";
  KEY_OPTIONS.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt.code;
    option.textContent = opt.label;
    keySelectEl.appendChild(option);
  });
}

function renderComboKeyOptions() {
  comboKeySelectEl.innerHTML = "";
  KEY_OPTIONS.filter(opt => opt.code !== "custom").forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt.code;
    option.textContent = opt.label;
    comboKeySelectEl.appendChild(option);
  });
}

function renderConfigFields() {
  if (!config) return;
  doubleIntervalEl.value = config.doublePressIntervalMs;
  longPressMinEl.value = config.longPressMinMs;
}

function renderRules() {
  ruleListEl.innerHTML = "";
  if (!config || !config.rules.length) {
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
    title += ` · ${labelBehavior(rule.behavior)}`;

    let meta = "";
    if (["LONG_PRESS", "LONG_PRESS_RELEASE", "COMBO_LONG_PRESS"].includes(rule.behavior)) {
      meta += `長按 ≥ ${rule.durationMs}ms · `;
    }
    meta += renderAction(rule.action);

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

function renderAction(action) {
  if (!action) return "";
  if (action.type === "run_shell") return `命令：<code>${escapeHtml(action.command || "")}</code>`;
  if (action.type === "send_key") return `发送按键：<code>${escapeHtml(action.keyCode)}</code>`;
  if (action.type === "launch_intent") {
    const i = action.intent || {};
    const brief = i.action || i.className || i.package || "(intent)";
    return `启动 Intent：<code>${escapeHtml(brief)}</code>`;
  }
  return `动作：<code>${escapeHtml(JSON.stringify(action))}</code>`;
}

function labelBehavior(behavior) {
  const map = {
    "DOWN": "按下", "UP": "松開", "LONG_PRESS": "長按",
    "LONG_PRESS_RELEASE": "長按釋放", "DOUBLE_PRESS": "雙擊",
    "COMBO_DOWN": "組合鍵按下", "COMBO_LONG_PRESS": "組合鍵長按"
  };
  return map[behavior] || behavior;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function resetForm() {
  editingIndex = null;
  formTitle.textContent = "添加规则";
  keySelectEl.value = "26";
  keyCodeCustomEl.value = "";
  toggleCustomKey();
  behaviorEl.value = "UP"; // 默認 UP，避開 POWER DOWN 禁止項
  durationEl.value = "";
  comboKeySelectEl.value = "24";
  toggleComboKeyField();
  actionTypeEl.value = "run_shell";
  commandEl.value = "";
  sendKeyCodeEl.value = "";
  intentJsonEl.value = "";
  toggleActionFields();
  formErrorEl.textContent = "";
}

function fillForm(rule, index) {
  editingIndex = index;
  formTitle.textContent = "编辑规则";
  const found = KEY_OPTIONS.find((o) => o.code === rule.keyCode);
  if (found) {
    keySelectEl.value = String(found.code);
    keyCodeCustomEl.value = "";
  } else {
    keySelectEl.value = "custom";
    keyCodeCustomEl.value = rule.keyCode;
  }
  toggleCustomKey();
  behaviorEl.value = rule.behavior;
  durationEl.value = rule.durationMs || "";
  comboKeySelectEl.value = rule.comboKeyCode || "24";
  toggleComboKeyField();
  actionTypeEl.value = rule.action?.type || "run_shell";
  commandEl.value = rule.action?.command || "";
  sendKeyCodeEl.value = rule.action?.keyCode ?? "";
  intentJsonEl.value = rule.action?.intent ? JSON.stringify(rule.action.intent, null, 2) : "";
  toggleActionFields();
  formErrorEl.textContent = "";
}

function toggleActionFields() {
  const type = actionTypeEl.value;
  fieldShellEl.classList.toggle("hidden", type !== "run_shell");
  fieldSendKeyEl.classList.toggle("hidden", type !== "send_key");
  fieldIntentEl.classList.toggle("hidden", type !== "launch_intent");
}

function validateRule(input) {
  const errors = [];
  const warnings = [];
  let keyCode = input.keySelect === "custom" ? Number(input.keyCodeCustom) : Number(input.keySelect);

  if (isNaN(keyCode) || keyCode < 0) errors.push("按键代码无效。");
  if (keyCode === 26 && input.behavior === "DOWN") errors.push("不允许拦截电源键按下(DOWN)事件。");

  let durationMs = ["LONG_PRESS", "LONG_PRESS_RELEASE", "COMBO_LONG_PRESS"].includes(input.behavior) ? Number(input.durationMs) : 0;
  if (durationMs < 0) errors.push("閾值不能為負。");

  let comboKeyCode = ["COMBO_DOWN", "COMBO_LONG_PRESS"].includes(input.behavior) ? Number(input.comboKeyCode) : 0;
  if (comboKeyCode === keyCode && comboKeyCode !== 0) errors.push("組合鍵不能相同。");

  let action = { type: input.actionType };
  if (input.actionType === "run_shell") action.command = input.command.trim();
  else if (input.actionType === "send_key") action.keyCode = Number(input.sendKeyCode);
  else if (input.actionType === "launch_intent") {
    try { action.intent = JSON.parse(input.intentJson); } catch (e) { errors.push("Intent JSON 格式错误。"); }
  }

  return { ok: errors.length === 0, errors, rule: { keyCode, behavior: input.behavior, durationMs, comboKeyCode, action } };
}

async function saveToDisk() {
  if (!config) return;
  try {
    setStatus("正在保存...");
    await UnifiedBridge.save(JSON.stringify(config, null, 2));
    setStatus("已保存到系统");
  } catch (err) {
    setStatus(`保存失败: ${err.message}`);
  }
}

// Events
document.getElementById("btnSettings").onclick = () => showModal(modalSettings);
document.getElementById("btnAddNew").onclick = () => { resetForm(); showModal(modalEditor); };
document.getElementById("btnGlobalSave").onclick = saveToDisk;
document.querySelectorAll(".btn-close, .btn-secondary").forEach(b => b.onclick = () => { hideModal(modalSettings); hideModal(modalEditor); });

document.getElementById("btnApplySettings").onclick = () => {
  config.doublePressIntervalMs = Number(doubleIntervalEl.value);
  config.longPressMinMs = Number(longPressMinEl.value);
  hideModal(modalSettings);
  setStatus("本地配置已更新（未保存到磁碟）");
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
    if (confirm("确定删除此规则？")) {
      config.rules.splice(Number(delIdx), 1);
      renderRules();
    }
  }
};

form.onsubmit = (e) => {
  e.preventDefault();
  const res = validateRule({
    keySelect: keySelectEl.value, keyCodeCustom: keyCodeCustomEl.value,
    behavior: behaviorEl.value, durationMs: durationEl.value,
    comboKeyCode: comboKeySelectEl.value, actionType: actionTypeEl.value,
    command: commandEl.value, sendKeyCode: sendKeyCodeEl.value, intentJson: intentJsonEl.value
  });
  if (!res.ok) { formErrorEl.textContent = res.errors.join(" "); return; }
  if (editingIndex === null) config.rules.push(res.rule);
  else config.rules[editingIndex] = res.rule;
  hideModal(modalEditor);
  renderRules();
};

keySelectEl.onchange = toggleCustomKey;
actionTypeEl.onchange = toggleActionFields;
behaviorEl.onchange = toggleComboKeyField;

function toggleCustomKey() { keyCodeCustomEl.classList.toggle("hidden", keySelectEl.value !== "custom"); }
function toggleComboKeyField() { labelComboKeyEl.classList.toggle("hidden", !["COMBO_DOWN", "COMBO_LONG_PRESS"].includes(behaviorEl.value)); }

loadRules();
