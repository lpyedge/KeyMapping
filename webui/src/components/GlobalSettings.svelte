<script>
  import { onMount } from 'svelte';

  export let config;
  export let onApply;

  let doubleInterval = 300;
  let shortPressMin = 300;
  let longPressMin = 800;
  let combinationTimeout = 200;
  let ruleTimeout = 5000;

  // Load values from config once on mount (avoids reactive overwrite during editing)
  export function loadFromConfig(cfg) {
    if (!cfg) return;
    doubleInterval = cfg.doublePressIntervalMs;
    shortPressMin = cfg.shortPressMinMs;
    longPressMin = cfg.longPressMinMs;
    combinationTimeout = cfg.combinationTimeoutMs;
    ruleTimeout = cfg.ruleTimeoutMs;
  }

  onMount(() => loadFromConfig(config));

  function apply() {
    onApply({
      doublePressIntervalMs: Number(doubleInterval),
      shortPressMinMs: Number(shortPressMin),
      longPressMinMs: Number(longPressMin),
      combinationTimeoutMs: Number(combinationTimeout),
      ruleTimeoutMs: Number(ruleTimeout)
    });
  }
</script>

<section class="panel">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h2 class="text-lg font-semibold">1. 全局设置 (Global Settings)</h2>
    <button class="btn-secondary" on:click={apply}>应用到当前会话 (Apply)</button>
  </div>
  <p class="hint mt-1">时间阈值用于规则识别。点击“应用”仅在内存生效，点击顶部“保存到 YAML”才会持久化。</p>
  <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
    <label class="text-sm text-slate-300">
      双击间隔 (ms)
      <input class="input mt-1" type="number" bind:value={doubleInterval} />
    </label>
    <label class="text-sm text-slate-300">
      短按阈值 (ms)
      <input class="input mt-1" type="number" bind:value={shortPressMin} />
    </label>
    <label class="text-sm text-slate-300">
      长按阈值 (ms)
      <input class="input mt-1" type="number" bind:value={longPressMin} />
    </label>
    <label class="text-sm text-slate-300">
      组合时窗 (ms)
      <input class="input mt-1" type="number" bind:value={combinationTimeout} />
    </label>
    <label class="text-sm text-slate-300">
      规则超时 (ms)
      <input class="input mt-1" type="number" bind:value={ruleTimeout} />
    </label>
  </div>
</section>
