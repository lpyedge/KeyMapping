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

  window.PowerKeyRulesBridge = {
    exec,
    readFile,
    writeFile,
    shellEscape,
  };
})();
