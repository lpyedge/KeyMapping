(function () {
  function shellEscape(value) {
    return `'${String(value).replace(/'/g, "'\\''")}'`;
  }

  function decodeResult(result) {
    if (result == null) return "";
    if (typeof result === "string") return result;
    if (typeof result.stdout === "string") return result.stdout;
    if (typeof result.result === "string") return result.result;
    return JSON.stringify(result);
  }

  async function exec(command) {
    if (window.PowerKeyRulesAndroid && typeof window.PowerKeyRulesAndroid.loadRulesJson === "function") {
      throw new Error("Android WebView bridge does not support exec()")
    }
    if (window.kernelsu && typeof window.kernelsu.exec === "function") {
      return window.kernelsu.exec(command);
    }
    if (window.magisk && typeof window.magisk.exec === "function") {
      return window.magisk.exec(command);
    }
    if (window.__magisk && typeof window.__magisk.exec === "function") {
      return window.__magisk.exec(command);
    }
    throw new Error("No WebUI bridge detected");
  }

  async function readFile(path) {
    if (window.PowerKeyRulesAndroid && typeof window.PowerKeyRulesAndroid.loadRulesJson === "function") {
      return window.PowerKeyRulesAndroid.loadRulesJson();
    }
    const result = await exec(`cat ${shellEscape(path)}`);
    return decodeResult(result);
  }

  async function writeFile(path, content) {
    if (window.PowerKeyRulesAndroid && typeof window.PowerKeyRulesAndroid.saveRulesJson === "function") {
      const ok = window.PowerKeyRulesAndroid.saveRulesJson(String(content));
      if (!ok) throw new Error("Save failed");
      return;
    }
    const base64 = btoa(unescape(encodeURIComponent(content)));
    await exec(`echo ${shellEscape(base64)} | base64 -d > ${shellEscape(path)}`);
    await exec(`chmod 0644 ${shellEscape(path)}`);
  }

  /**
   * 測試動作執行
   * @param {string} actionJson - 動作的 JSON 字符串
   * @returns {Promise<string>} 執行結果訊息
   */
  async function testAction(actionJson) {
    // Android WebView: 使用 Native 橋接
    if (window.PowerKeyRulesAndroid && typeof window.PowerKeyRulesAndroid.testAction === "function") {
      return window.PowerKeyRulesAndroid.testAction(actionJson);
    }
    // Magisk/KernelSU 環境: 通過 shell 執行
    const action = JSON.parse(actionJson);
    if (action.type === "run_shell") {
      const result = await exec(action.command);
      return `✅ 執行完成\n輸出：${decodeResult(result)}`;
    }
    if (action.type === "send_key") {
      const result = await exec(`input keyevent ${action.keyCode}`);
      return `✅ 已發送 keyCode=${action.keyCode}`;
    }
    if (action.type === "launch_intent") {
      const intent = action.intent || {};
      let cmd = "am start";
      if (intent.action) cmd += ` -a ${shellEscape(intent.action)}`;
      if (intent.package && intent.className) {
        cmd += ` -n ${shellEscape(intent.package + "/" + intent.className)}`;
      } else if (intent.package) {
        cmd += ` -p ${shellEscape(intent.package)}`;
      }
      if (intent.data) cmd += ` -d ${shellEscape(intent.data)}`;
      await exec(cmd);
      return `✅ Intent 已啟動`;
    }
    throw new Error("未知的動作類型");
  }

  window.PowerKeyRulesBridge = {
    exec,
    readFile,
    writeFile,
    testAction,
    shellEscape,
  };
})();

