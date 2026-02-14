<script>
  import plusIcon from '@/lib/icons/plus.svg';
  import trashIcon from '@/lib/icons/trash.svg';
  import learnIcon from '@/lib/icons/learn.svg';
  import editIcon from '@/lib/icons/edit.svg';

  export let hardwareEntries = [];
  export let onAddKey;     // (name, code)
  export let onDeleteKey;  // (entry)
  export let onRenameKey;  // (entry)
  export let onLearnNew;   // () -> returns Promise<code>
  export let onLearnFor;   // (entry) -> void (updates internal)

  const PROTECTED_KEY_NAMES = new Set(['POWER', 'VOL_UP', 'VOL_DOWN']);

  let keyNameInput = '';
  let keyCodeInput = '';
  let isLearning = false;

  async function handleLearnNew() {
    isLearning = true;
    try {
      const code = await onLearnNew();
      if (code !== null) keyCodeInput = String(code);
    } catch (e) {
      alert(e.message);
    } finally {
      isLearning = false;
    }
  }

  function handleAdd() {
     const name = keyNameInput.trim();
     const code = Number(keyCodeInput);
     if(!name) return alert('Name required');
     if(!Number.isInteger(code) || code < 0) return alert('Invalid code');
     onAddKey(name, code);
     keyNameInput = '';
     keyCodeInput = '';
  }
</script>

<section class="panel mt-4">
  <h2 class="text-lg font-semibold">2. 按键设置 (Key Setup)</h2>
  <p class="hint mt-1">
    管理物理按键映射。支持蓝牙/USB设备按键记忆。
    <br/>
    Reserved: <code>POWER</code>, <code>VOL_UP</code>, <code>VOL_DOWN</code>.
  </p>

  <!-- Add New Key Form -->
  <div class="mt-3 grid gap-3 md:grid-cols-[1.2fr_1fr_auto] items-end">
    <label class="text-sm text-slate-300 w-full">
      逻辑名称 (Logic Name)
      <input class="input mt-1 w-full" bind:value={keyNameInput} placeholder="e.g. BT_MOUSE_LEFT" />
    </label>
    <label class="text-sm text-slate-300 w-full">
      Key Code
      <div class="mt-1 flex gap-2">
        <input class="input flex-1" bind:value={keyCodeInput} type="number" placeholder="123" />
        <button class="btn-secondary whitespace-nowrap" on:click|preventDefault={handleLearnNew} disabled={isLearning}>
          <img src={learnIcon} alt="" class="h-4 w-4" />
          {isLearning ? '...' : '识别'}
        </button>
      </div>
    </label>
    <div>
      <button class="btn-primary w-full md:w-auto" on:click={handleAdd}>
        <img src={plusIcon} alt="" class="h-4 w-4" /> 新增按键
      </button>
    </div>
  </div>

  <!-- Key List -->
  <div class="mt-4 overflow-x-auto rounded border border-slate-700">
    <table class="min-w-[620px] w-full text-sm">
      <thead class="bg-slate-800">
        <tr class="text-left text-slate-300">
          <th class="py-2 px-3">名称</th>
          <th class="py-2 px-3">keyCode</th>
          <th class="py-2 px-3">类型</th>
          <th class="py-2 px-3">操作</th>
        </tr>
      </thead>
      <tbody>
        {#if hardwareEntries.length === 0}
          <tr><td colspan="4" class="py-4 text-center text-slate-400">暂无物理按键映射。</td></tr>
        {:else}
          {#each hardwareEntries as entry}
            <tr class="border-t border-slate-700 hover:bg-slate-800/50">
              <td class="py-2 px-3 font-mono text-amber-200">{entry.name}</td>
              <td class="py-2 px-3 font-mono">{entry.code}</td>
              <td class="py-2 px-3">
                {#if PROTECTED_KEY_NAMES.has(entry.name)}
                  <span class="badge bg-sky-500/10 text-sky-300 border-sky-500/20">系统保留</span>
                {:else}
                  <span class="badge bg-slate-700 text-slate-300 border-slate-600">自定义</span>
                {/if}
              </td>
              <td class="py-2 px-3">
                <div class="flex gap-2">
                  <button class="text-slate-400 hover:text-white" title="重新识别" on:click={() => onLearnFor(entry)}>
                    <img src={learnIcon} alt="Learn" class="h-4 w-4" />
                  </button>
                  <button class="text-slate-400 hover:text-white" title="重命名" on:click={() => onRenameKey(entry)}>
                    <img src={editIcon} alt="Rename" class="h-4 w-4" />
                  </button>
                  <button class="text-red-400 hover:text-red-300 disabled:opacity-30" 
                          title="删除" 
                          disabled={PROTECTED_KEY_NAMES.has(entry.name)}
                          on:click={() => onDeleteKey(entry)}>
                    <img src={trashIcon} alt="Delete" class="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</section>
