// 僅用於 APK 的內嵌 WebView 環境

// DOM refs
const statusEl = document.getElementById("status");
const rulesPathEl = document.getElementById("rulesPath");
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

// 統一 Bridge 適配器
const UnifiedBridge = {
  async load() {
    // 1. APK WebView 环境
    if (window.PowerKeyRulesAndroid && typeof window.PowerKeyRulesAndroid.loadRulesJson === "function") {
      return window.PowerKeyRulesAndroid.loadRulesJson();
    }
    throw new Error("无可用 Bridge：仅支持 APK 内嵌 WebView 环境");
  },

  async save(content) {
    if (window.PowerKeyRulesAndroid && typeof window.PowerKeyRulesAndroid.saveRulesJson === "function") {
      const success = window.PowerKeyRulesAndroid.saveRulesJson(content);
      if (!success) throw new Error("保存失败 (APK Bridge)");
      return;
    }
    throw new Error("无可用 Bridge：仅支持 APK 内嵌 WebView 环境");
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

  try {
    const response = await fetch("default-rules.json", { cache: "no-store" });
    if (response.ok) {
      return JSON.parse(await response.text());
    }
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
    render();
    setStatus("已读取当前配置");
  } catch (err) {
    console.error(err);
    config = await fetchDefaultConfig();
    render();
    setStatus(`读取失败，已载入默认模板 (${err.message || "未知错误"})`);
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
  if (!["DOWN", "UP", "LONG_PRESS", "LONG_PRESS_RELEASE", "DOUBLE_PRESS", "COMBO_DOWN", "COMBO_LONG_PRESS"].includes(behavior)) return null;
  const durationMs = Number(r.durationMs) || 0;
  const comboKeyCode = Number(r.comboKeyCode) || 0;
  const action = r.action || {};
  const type = String(action.type || "");

  // 基础规则对象
  const baseRule = { keyCode, behavior, durationMs, comboKeyCode };

  if (type === "run_shell") {
    if (!action.command) return null;
    return { ...baseRule, action: { type: "run_shell", command: String(action.command) } };
  }
  if (type === "send_key") {
    const sendKey = Number(action.keyCode);
    if (!Number.isInteger(sendKey) || sendKey < 0) return null;
    return { ...baseRule, action: { type: "send_key", keyCode: sendKey } };
  }
  if (type === "launch_intent") {
    const intent = action.intent || {};
    if (typeof intent !== "object" || intent == null) return null;
    return { ...baseRule, action: { type: "launch_intent", intent } };
  }
  return null;
}

function render() {
  renderConfigFields();
  renderKeyOptions();
  renderComboKeyOptions();
  renderRules();
  resetForm();
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
  // 组合键不包含"其它/自定义"选项
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

    // 构建标题
    let title = `按键 ${rule.keyCode}`;
    if (rule.comboKeyCode > 0) {
      title += ` + ${rule.comboKeyCode}`;
    }
    title += ` · ${labelBehavior(rule.behavior)}`;

    // 构建元信息
    let meta = "";
    if (["LONG_PRESS", "LONG_PRESS_RELEASE", "COMBO_LONG_PRESS"].includes(rule.behavior)) {
      meta += `长按 ≥ ${rule.durationMs}ms · `;
    }
    meta += renderAction(rule.action);

    item.innerHTML = `
      <div class="rule-main">
        <div class="rule-title">${title}</div>
        <div class="rule-meta">${meta}</div>
      </div>
      <div class="rule-actions">
        <button data-edit="${index}">编辑</button>
        <button data-delete="${index}" class="danger">删除</button>
      </div>
    `;
    ruleListEl.appendChild(item);
  });
}

function renderAction(action) {
  if (!action) return "";
  if (action.type === "run_shell") {
    return `命令：<code>${escapeHtml(action.command || "")}</code>`;
  }
  if (action.type === "send_key") {
    return `发送按键：<code>keyevent ${escapeHtml(action.keyCode)}</code>`;
  }
  if (action.type === "launch_intent") {
    const i = action.intent || {};
    const brief = i.action || i.className || i.package || "(intent)";
    return `启动 Intent：<code>${escapeHtml(brief)}</code>`;
  }
  return `动作：<code>${escapeHtml(JSON.stringify(action))}</code>`;
}

function labelBehavior(behavior) {
  switch (behavior) {
    case "DOWN":
      return "按下";
    case "UP":
      return "松开";
    case "LONG_PRESS":
      return "长按";
    case "LONG_PRESS_RELEASE":
      return "长按释放";
    case "DOUBLE_PRESS":
      return "双击";
    case "COMBO_DOWN":
      return "组合键按下";
    case "COMBO_LONG_PRESS":
      return "组合键长按";
    default:
      return behavior;
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[c] || c;
  });
}

function resetForm() {
  editingIndex = null;
  formTitle.textContent = "添加规则";
  keySelectEl.value = "custom";
  keyCodeCustomEl.value = "";
  toggleCustomKey();
  behaviorEl.value = "DOWN";
  durationEl.value = "";
  comboKeySelectEl.value = "24"; // 默认音量上
  toggleComboKeyField();
  actionTypeEl.value = "run_shell";
  commandEl.value = "";
  sendKeyCodeEl.value = "";
  intentJsonEl.value = "";
  toggleActionFields();
  formErrorEl.textContent = "";
  document.getElementById("btnSubmit").textContent = "保存规则";
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
  document.getElementById("btnSubmit").textContent = "更新规则";
}

function toggleActionFields() {
  const type = actionTypeEl.value;
  fieldShellEl.classList.toggle("hidden", type !== "run_shell");
  fieldSendKeyEl.classList.toggle("hidden", type !== "send_key");
  fieldIntentEl.classList.toggle("hidden", type !== "launch_intent");
}

function validateRule(input) {
  const errors = [];
  const warnings = [];  // 新增警告列表
  let keyCode;
  if (input.keySelect === "custom") {
    keyCode = Number(input.keyCodeCustom);
    if (!Number.isInteger(keyCode) || keyCode < 0) {
      errors.push("自定义按键代码必须是非负整数。");
    }
  } else {
    keyCode = Number(input.keySelect);
    if (!Number.isInteger(keyCode) || keyCode < 0) {
      errors.push("请选择有效的物理按键。");
    }
  }

  const behavior = input.behavior;
  if (!["DOWN", "UP", "LONG_PRESS", "LONG_PRESS_RELEASE", "DOUBLE_PRESS", "COMBO_DOWN", "COMBO_LONG_PRESS"].includes(behavior)) {
    errors.push("请选择有效的触发行为。");
  }

  // Bug 5 修復：阻止電源鍵 DOWN 規則
  // README 規定：電源鍵的 DOWN 事件永不攔截，確保設備能正常喚醒
  if (keyCode === 26 && behavior === "DOWN") {
    errors.push("电源键的 DOWN 行为不允许配置，以确保设备能正常唤醒。");
  }

  let durationMs = Number(input.durationMs || 0);
  if (["LONG_PRESS", "LONG_PRESS_RELEASE", "COMBO_LONG_PRESS"].includes(behavior)) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      errors.push("长按阈值必须大于 0。");
    }
  } else {
    durationMs = 0;
  }

  let comboKeyCode = 0;
  if (["COMBO_DOWN", "COMBO_LONG_PRESS"].includes(behavior)) {
    comboKeyCode = Number(input.comboKeyCode);
    if (!Number.isInteger(comboKeyCode) || comboKeyCode < 0) {
      errors.push("组合键必须是有效的按键代码。");
    }
    if (comboKeyCode === keyCode) {
      errors.push("组合键不能与主按键相同。");
    }
  }

  const actionType = input.actionType;
  let action = null;
  if (actionType === "run_shell") {
    const command = (input.command || "").trim();
    if (!command) {
      errors.push("Shell 命令不能为空。");
    } else if (command.length > 256) {
      errors.push("命令过长（>256 字符）。");
    } else {
      action = { type: "run_shell", command };
    }
  } else if (actionType === "send_key") {
    const sendKeyCode = Number(input.sendKeyCode);
    if (!Number.isInteger(sendKeyCode) || sendKeyCode < 0) {
      errors.push("发送按键的 keyCode 必须是非负整数。");
    } else {
      action = { type: "send_key", keyCode: sendKeyCode };
    }
  } else if (actionType === "launch_intent") {
    const raw = (input.intentJson || "").trim();
    if (!raw) {
      errors.push("Intent JSON 不能为空。");
    } else {
      try {
        const intent = JSON.parse(raw);
        if (typeof intent !== "object" || intent == null) {
          errors.push("Intent JSON 必须是对象。");
        } else {
          action = { type: "launch_intent", intent };
        }
      } catch (e) {
        errors.push("Intent JSON 格式不正确。");
      }
    }
  } else {
    errors.push("请选择有效的动作类型。");
  }

  // 優化 4：規則衝突檢測
  // 檢查是否存在同一按鍵的 UP + DOUBLE_PRESS 衝突
  if (errors.length === 0 && config && config.rules) {
    const conflictBehaviors = ["UP", "DOUBLE_PRESS"];
    if (conflictBehaviors.includes(behavior)) {
      const otherBehavior = behavior === "UP" ? "DOUBLE_PRESS" : "UP";
      const hasConflict = config.rules.some((r, idx) => {
        // 編輯模式下排除自己
        if (editingIndex !== null && idx === editingIndex) return false;
        return r.keyCode === keyCode && r.behavior === otherBehavior;
      });
      if (hasConflict) {
        warnings.push(`⚠️ 同一按键同时配置 UP 和 DOUBLE_PRESS 可能导致双击时先触发单击。`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,  // 新增警告返回
    rule: errors.length
      ? null
      : {
        keyCode,
        behavior,
        durationMs,
        comboKeyCode,
        action,
      },
  };
}

async function saveToDisk() {
  if (!config) return;
  config.doublePressIntervalMs = Number(doubleIntervalEl.value) || 300;
  config.longPressMinMs = Number(longPressMinEl.value) || 500;

  const payload = JSON.stringify(config, null, 2);

  try {
    setStatus("正在保存...");
    await UnifiedBridge.save(payload);
    setStatus("已保存配置");
  } catch (err) {
    setStatus(`保存失败：${err.message}`);
  }
}

// Event bindings
document.getElementById("btnLoad").addEventListener("click", loadRules);
document.getElementById("btnReload").addEventListener("click", loadRules);
document.getElementById("btnSave").addEventListener("click", saveToDisk);
document.getElementById("btnDefault").addEventListener("click", async () => {
  config = await fetchDefaultConfig();
  render();
  setStatus("已载入默认模板。");
});
document.getElementById("btnAddNew").addEventListener("click", () => resetForm());
document.getElementById("btnCancel").addEventListener("click", () => resetForm());

ruleListEl.addEventListener("click", (e) => {
  const editIdx = e.target.getAttribute("data-edit");
  const delIdx = e.target.getAttribute("data-delete");
  if (editIdx !== null) {
    const idx = Number(editIdx);
    const rule = config.rules[idx];
    if (rule) fillForm(rule, idx);
  }
  if (delIdx !== null) {
    const idx = Number(delIdx);
    config.rules.splice(idx, 1);
    renderRules();
    resetForm();
  }
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  formErrorEl.textContent = "";
  const { ok, errors, warnings, rule } = validateRule({
    keySelect: keySelectEl.value,
    keyCodeCustom: keyCodeCustomEl.value,
    behavior: behaviorEl.value,
    durationMs: durationEl.value,
    comboKeyCode: comboKeySelectEl.value,
    actionType: actionTypeEl.value,
    command: commandEl.value,
    sendKeyCode: sendKeyCodeEl.value,
    intentJson: intentJsonEl.value,
  });
  if (!ok) {
    formErrorEl.textContent = errors.join(" ");
    return;
  }
  // 如果有警告，顯示但不阻止保存
  if (warnings && warnings.length > 0) {
    alert(warnings.join("\n"));
  }

  if (editingIndex === null) {
    config.rules.push(rule);
  } else {
    config.rules[editingIndex] = rule;
  }
  renderRules();
  resetForm();
});

// Init and load
loadRules();

keySelectEl.addEventListener("change", toggleCustomKey);
actionTypeEl.addEventListener("change", toggleActionFields);
behaviorEl.addEventListener("change", toggleComboKeyField);

function toggleCustomKey() {
  const isCustom = keySelectEl.value === "custom";
  keyCodeCustomEl.classList.toggle("hidden", !isCustom);
  keyCodeCustomEl.required = isCustom;
}

function toggleComboKeyField() {
  const behavior = behaviorEl.value;
  const needsCombo = ["COMBO_DOWN", "COMBO_LONG_PRESS"].includes(behavior);
  labelComboKeyEl.classList.toggle("hidden", !needsCombo);
  comboKeySelectEl.required = needsCombo;
}
