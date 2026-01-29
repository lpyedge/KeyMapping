// 僅用於非-Android WebView 環境（Magisk/KSU WebUI）
const DEFAULT_RULES_PATH = "/data/adb/modules/PowerKeyRules/rules.json";
const bridge = window.PowerKeyRulesBridge;

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

async function fetchDefaultConfig() {
  // Android WebView: ask native side for defaults first
  try {
    if (window.PowerKeyRulesAndroid && typeof window.PowerKeyRulesAndroid.loadDefaultRulesJson === "function") {
      const json = window.PowerKeyRulesAndroid.loadDefaultRulesJson();
      if (json) return JSON.parse(json);
    }
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
  if (!bridge) {
    config = await fetchDefaultConfig();
    render();
    setStatus("未检测到 WebUI bridge，仅载入默认模板。");
    return;
  }

  try {
    setStatus("正在读取规则...");
    const json = await bridge.readFile("");  // Android bridge 忽略路徑參數
    const parsed = JSON.parse(json || "{}");
    config = normalizeConfig(parsed);
    render();
    setStatus("已读取当前配置");
  } catch (err) {
    config = await fetchDefaultConfig();
    render();
    setStatus(`读取失败，已载入默认模板：${err.message}`);
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
  if (!["DOWN", "UP", "LONG_PRESS", "DOUBLE_PRESS"].includes(behavior)) return null;
  const durationMs = Number(r.durationMs) || 0;
  const action = r.action || {};
  const type = String(action.type || "");
  if (type === "run_shell") {
    if (!action.command) return null;
    return { keyCode, behavior, durationMs, action: { type: "run_shell", command: String(action.command) } };
  }
  if (type === "send_key") {
    const sendKey = Number(action.keyCode);
    if (!Number.isInteger(sendKey) || sendKey < 0) return null;
    return { keyCode, behavior, durationMs, action: { type: "send_key", keyCode: sendKey } };
  }
  if (type === "launch_intent") {
    const intent = action.intent || {};
    if (typeof intent !== "object" || intent == null) return null;
    return { keyCode, behavior, durationMs, action: { type: "launch_intent", intent } };
  }
  return null;
}

function render() {
  renderConfigFields();
  renderKeyOptions();
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
    item.innerHTML = `
      <div class="rule-main">
        <div class="rule-title">按键 ${rule.keyCode} · ${labelBehavior(rule.behavior)}</div>
        <div class="rule-meta">
          ${rule.behavior === "LONG_PRESS" ? `长按 ≥ ${rule.durationMs}ms · ` : ""}
          ${renderAction(rule.action)}
        </div>
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
    case "DOUBLE_PRESS":
      return "双击";
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
  if (!["DOWN", "UP", "LONG_PRESS", "DOUBLE_PRESS"].includes(behavior)) {
    errors.push("请选择有效的触发行为。");
  }

  let durationMs = Number(input.durationMs || 0);
  if (behavior === "LONG_PRESS") {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      errors.push("长按阈值必须大于 0。");
    }
  } else {
    durationMs = 0;
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

  return {
    ok: errors.length === 0,
    errors,
    rule: errors.length
      ? null
      : {
        keyCode,
        behavior,
        durationMs,
        action,
      },
  };
}

async function saveToDisk() {
  if (!config) return;
  config.doublePressIntervalMs = Number(doubleIntervalEl.value) || 300;
  config.longPressMinMs = Number(longPressMinEl.value) || 500;

  const payload = JSON.stringify(config, null, 2);

  if (!bridge) {
    setStatus("未检测到 WebUI bridge，无法写入。");
    return;
  }

  try {
    setStatus("正在保存...");
    await bridge.writeFile("", payload);  // Android bridge 忽略路徑參數
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
  const { ok, errors, rule } = validateRule({
    keySelect: keySelectEl.value,
    keyCodeCustom: keyCodeCustomEl.value,
    behavior: behaviorEl.value,
    durationMs: durationEl.value,
    actionType: actionTypeEl.value,
    command: commandEl.value,
    sendKeyCode: sendKeyCodeEl.value,
    intentJson: intentJsonEl.value,
  });
  if (!ok) {
    formErrorEl.textContent = errors.join(" ");
    return;
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

function toggleCustomKey() {
  const isCustom = keySelectEl.value === "custom";
  keyCodeCustomEl.classList.toggle("hidden", !isCustom);
  keyCodeCustomEl.required = isCustom;
}

// ======= 動作測試功能 =======
const testModal = document.getElementById("testModal");
const testResultEl = document.getElementById("testResult");
const btnTest = document.getElementById("btnTest");
const btnCloseModal = document.getElementById("btnCloseModal");

function showModal(result) {
  testResultEl.textContent = result;
  testModal.classList.remove("hidden");
}

function hideModal() {
  testModal.classList.add("hidden");
}

/**
 * 構建當前表單中的動作對象（用於測試）
 * @returns {object|null} 動作對象，如果無效則返回 null
 */
function buildCurrentAction() {
  const actionType = actionTypeEl.value;

  if (actionType === "run_shell") {
    const command = commandEl.value.trim();
    if (!command) {
      formErrorEl.textContent = "请输入 Shell 命令后再测试";
      return null;
    }
    return { type: "run_shell", command };
  }

  if (actionType === "send_key") {
    const keyCode = Number(sendKeyCodeEl.value);
    if (!Number.isInteger(keyCode) || keyCode < 0) {
      formErrorEl.textContent = "请输入有效的 keyCode 后再测试";
      return null;
    }
    return { type: "send_key", keyCode };
  }

  if (actionType === "launch_intent") {
    const raw = intentJsonEl.value.trim();
    if (!raw) {
      formErrorEl.textContent = "请输入 Intent JSON 后再测试";
      return null;
    }
    try {
      const intent = JSON.parse(raw);
      if (typeof intent !== "object" || intent === null) {
        formErrorEl.textContent = "Intent JSON 必须是对象";
        return null;
      }
      return { type: "launch_intent", intent };
    } catch (e) {
      formErrorEl.textContent = "Intent JSON 格式不正确";
      return null;
    }
  }

  formErrorEl.textContent = "未知的动作类型";
  return null;
}

btnTest.addEventListener("click", async () => {
  formErrorEl.textContent = "";
  const action = buildCurrentAction();
  if (!action) return;

  setStatus("正在测试动作...");
  try {
    const result = await window.PowerKeyRulesBridge.testAction(JSON.stringify(action));
    showModal(result);
    setStatus("测试完成");
  } catch (err) {
    showModal(`❌ 测试失败：${err.message}`);
    setStatus(`测试失败：${err.message}`);
  }
});

btnCloseModal.addEventListener("click", hideModal);

// 點擊模態背景關閉
testModal.querySelector(".modal-backdrop").addEventListener("click", hideModal);

// ESC 鍵關閉模態
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !testModal.classList.contains("hidden")) {
    hideModal();
  }
});

