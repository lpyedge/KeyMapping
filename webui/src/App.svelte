<script>
  import { onMount } from 'svelte';
  import reloadIcon from '@/lib/icons/reload.svg';
  import saveIcon from '@/lib/icons/save.svg';

  import GlobalSettings from '@/components/GlobalSettings.svelte';
  import KeySetup from '@/components/KeySetup.svelte';
  import RuleEditor from '@/components/RuleEditor.svelte';

  let status = 'Ready.';
  let config = defaultConfig();
  let installedApps = [];
  
  // Computed Props for Components
  $: hardwareEntries = getHardwareEntries(config.hardwareMap);
  $: keyOptions = getKeyOptions(hardwareEntries);
  $: comboOptions = keyOptions; // Simplification

  // API
  const Api = {
    async getConfig() {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },
    async saveConfig(payload) {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
    },
    async getApps() {
      const res = await fetch('/api/apps');
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },
    async startLearning() {
      const res = await fetch('/api/system/learn-start', { method: 'POST' });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
    },
    async getLearnResult() {
      const res = await fetch('/api/system/learn-result');
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    }
  };

  onMount(loadConfig);

  function defaultConfig() {
    return {
      version: 1,
      deviceName: '',
      hardwareMap: { 116: 'POWER', 115: 'VOL_UP', 114: 'VOL_DOWN', 102: 'HOME', 139: 'MENU' },
      doublePressIntervalMs: 300, longPressMinMs: 800, shortPressMinMs: 300, combinationTimeoutMs: 200, ruleTimeoutMs: 5000,
      rules: []
    };
  }

  // --- Data Logic (KeySetup) ---

  function getHardwareEntries(map) {
    return Object.entries(map || {})
      .map(([code, name]) => ({ code: Number(code), name: String(name || '') }))
      .filter((x) => Number.isInteger(x.code) && x.code >= 0 && x.name)
      .sort((a, b) => a.code - b.code);
  }

  function getKeyOptions(entries) {
    // Fallback options
    const fallback = [
       { label: 'POWER', code: 116 }, { label: 'VOL_UP', code: 115 }, { label: 'VOL_DOWN', code: 114 }
    ];
    if (entries.length) return entries.map((x) => ({ code: x.code, label: `${x.name} (${x.code})` }));
    return fallback;
  }

  function replaceHardwareMap(nextMap) {
    config = { ...config, hardwareMap: nextMap };
  }

  function handleAddKey(name, code) {
    if (Object.values(config.hardwareMap).includes(name)) return alert(`Name ${name} exists`);
    if (config.hardwareMap[code] !== undefined) return alert(`Code ${code} already mapped to ${config.hardwareMap[code]}`);
    replaceHardwareMap({ ...config.hardwareMap, [code]: name });
    status = `Added key ${name}`;
  }

  function handleDeleteKey(entry) {
    const map = { ...config.hardwareMap };
    delete map[entry.code];
    replaceHardwareMap(map);
    status = `Deleted key ${entry.name}`;
  }

  function handleRenameKey(entry) {
    const next = prompt('New name:', entry.name);
    if(next && next.trim()) {
       replaceHardwareMap({ ...config.hardwareMap, [entry.code]: next.trim() });
    }
  }

  // --- Learning Logic ---
  
  async function performLearn() {
    await Api.startLearning();
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const interval = setInterval(async () => {
            try {
                const res = await Api.getLearnResult();
                if(res.status === 'captured') {
                    clearInterval(interval);
                    resolve(Number(res.keyCode));
                } else if (res.status === 'timeout') {
                    clearInterval(interval);
                    reject(new Error('Timeout'));
                }
                if(attempts++ > 60) { clearInterval(interval); reject(new Error('Global Timeout')); }
            } catch(e) {
                clearInterval(interval);
                reject(e);
            }
        }, 500);
    });
  }

  async function handleLearnNew() { return performLearn(); }
  
  async function handleLearnForEntry(entry) {
      if(!confirm(`Learn new code for ${entry.name}?`)) return;
      try {
          const code = await performLearn();
          const map = { ...config.hardwareMap };
          delete map[entry.code];
          map[code] = entry.name;
          replaceHardwareMap(map);
          status = `Updated ${entry.name} to code ${code}`;
      } catch(e) {
          alert(e.message);
      }
  }

  // --- Global Settings Logic ---

  function handleApplyGlobal(settings) {
    config = { ...config, ...settings };
    status = 'Global settings applied (unsaved)';
  }

  // --- Rules Logic ---

  function handleSaveRule(rule, index) {
      const rules = [...config.rules];
      if (index === null) rules.push(rule);
      else rules[index] = rule;
      config = { ...config, rules };
      status = 'Rule updated (unsaved)';
  }

  function handleDeleteRule(index) {
      const rules = [...config.rules];
      rules.splice(index, 1);
      config = { ...config, rules };
      status = 'Rule deleted (unsaved)';
  }

  async function handleSearchApps(kw) {
      if(!installedApps.length) {
          const res = await Api.getApps();
          installedApps = res.apps || [];
      }
      kw = kw.toLowerCase();
      return installedApps.filter(a => 
         (a.package||'').toLowerCase().includes(kw) || (a.name||'').toLowerCase().includes(kw)
      );
  }

  // --- Persistence ---

  // Helper config normalization
  function toPositiveInt(value, fallback) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : fallback;
  }
  function normalizeConfig(input) {
      const base = defaultConfig();
      // Only minimal normalization here, let backend handle strict schema
      return {
          ...base,
          ...input,
          hardwareMap: input.hardwareMap || base.hardwareMap,
          rules: input.rules || []
      };
  }

  let globalSettingsRef;

  async function loadConfig() {
    try {
      const data = await Api.getConfig();
      config = normalizeConfig(data || {});
      if (globalSettingsRef) globalSettingsRef.loadFromConfig(config);
      status = 'Config loaded';
    } catch (e) {
      status = 'Load failed: ' + e.message;
    }
  }

  // O-6: Build explicit DTO payload aligned with new backend schema
  function buildSavePayload() {
    return {
      version: 1,
      deviceName: config.deviceName || '',
      hardwareMap: config.hardwareMap || {},
      doublePressIntervalMs: config.doublePressIntervalMs,
      longPressMinMs: config.longPressMinMs,
      shortPressMinMs: config.shortPressMinMs,
      combinationTimeoutMs: config.combinationTimeoutMs,
      ruleTimeoutMs: config.ruleTimeoutMs,
      rules: (config.rules || []).map(r => ({
        id: r.id || null,
        enabled: r.enabled !== false,
        description: r.description || '',
        conditionLogic: r.conditionLogic || 'and',
        conditions: r.conditions || [],
        actions: r.actions || []
      }))
    };
  }

  async function saveToDisk() {
    try {
      await Api.saveConfig(buildSavePayload());
      status = 'Saved to YAML';
    } catch (e) {
      status = 'Save failed: ' + e.message;
    }
  }
</script>

<main class="mx-auto w-full max-w-7xl px-3 py-5 md:px-5">
  <section class="rounded-2xl border border-slate-700/70 bg-slate-900/80 p-4 shadow-2xl md:p-5">
    <!-- Header -->
    <header class="mb-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div>
        <p class="text-xs uppercase tracking-[0.22em] text-slate-400">Rust Keymapper</p>
        <h1 class="mt-1 text-3xl font-bold tracking-tight text-white">PowerKeyRules</h1>
        <p class="mt-2 text-sm text-slate-400">Device: {config.deviceName || '(Pending)'} | Status: <span class="text-amber-400">{status}</span></p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="btn-secondary" on:click={loadConfig}><img src={reloadIcon} alt="" class="h-4 w-4" /> Reload</button>
        <button class="btn-primary" on:click={saveToDisk}><img src={saveIcon} alt="" class="h-4 w-4" /> Save to YAML</button>
      </div>
    </header>

    <!-- Components -->
    <GlobalSettings 
       bind:this={globalSettingsRef}
       config={config} 
       onApply={handleApplyGlobal} 
    />

    <KeySetup 
       hardwareEntries={hardwareEntries}
       onAddKey={handleAddKey}
       onDeleteKey={handleDeleteKey}
       onRenameKey={handleRenameKey}
       onLearnNew={handleLearnNew}
       onLearnFor={handleLearnForEntry}
    />

    <RuleEditor 
       rules={config.rules}
       keyOptions={keyOptions}
       comboOptions={comboOptions}
       onSaveRule={handleSaveRule}
       onDeleteRule={handleDeleteRule}
       onSearchApps={handleSearchApps}
    />

  </section>
</main>
