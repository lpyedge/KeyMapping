<script>
  import plusIcon from '@/lib/icons/plus.svg';
  import trashIcon from '@/lib/icons/trash.svg';
  import editIcon from '@/lib/icons/edit.svg';

  export let rules = [];
  export let keyOptions = [];
  export let comboOptions = [];
  export let installedApps = [];
  export let onSaveRule;   // (rule, index|null)
  export let onDeleteRule; // (index)
  export let onSearchApps; // (keyword) -> Promise

  let isEditorOpen = false;
  let editingIndex = null;
  let editorLocked = false;
  let formError = '';

  // Form State
  let ruleDescription = '';
  let ruleEnabled = 'true';
  
  // Condition State
  let conditionType = 'key_event';
  let keySelect = '116';
  let keyCodeCustom = '';
  let behavior = 'CLICK';
  let comboKeySelect = '116';

  // Action State (for the "current" action being edited)
  let actionType = 'builtin_command';
  let builtinCommand = 'open_voice_assistant';
  let launchAppPackage = '';
  let launchAppActivity = '';
  let command = '';
  let sendKeyCode = '';
  // Intent fields
  let intentAction = '';
  let intentPackage = '';
  let intentClass = '';
  let intentData = '';
  let intentCategory = '';
  let intentExtras = '';
  // Volume/Brightness
  let volumeDirection = 'up';
  let brightnessDirection = 'up';

  // App Search
  let appKeyword = '';
  let appResults = [];

  const ALL_BEHAVIORS = new Set(['CLICK', 'SHORT_PRESS', 'LONG_PRESS', 'DOUBLE_CLICK', 'COMBO_CLICK', 'COMBO_SHORT_PRESS', 'COMBO_LONG_PRESS']);
  const COMBO_BEHAVIORS = new Set(['COMBO_CLICK', 'COMBO_SHORT_PRESS', 'COMBO_LONG_PRESS']);
  const BUILTIN_LABELS = {
    mute_toggle: '静音切换',
    open_voice_assistant: '打开语音助手',
    open_camera: '打开相机',
    toggle_flashlight: '切换手电筒',
    toggle_do_not_disturb: '切换勿扰模式'
  };

  function resetForm() {
    editingIndex = null;
    editorLocked = false;
    formError = '';
    ruleDescription = '';
    ruleEnabled = 'true';
    conditionType = 'key_event';
    keySelect = keyOptions.length ? String(keyOptions[0].code) : '116';
    keyCodeCustom = '';
    behavior = 'CLICK';
    comboKeySelect = comboOptions.length ? String(comboOptions[0].code) : '116';
    
    actionType = 'builtin_command';
    builtinCommand = 'open_voice_assistant';
    launchAppPackage = '';
    launchAppActivity = '';
    command = '';
    sendKeyCode = '';
    intentAction = '';
    intentPackage = '';
    intentClass = '';
    intentData = '';
    intentCategory = '';
    intentExtras = '';
    volumeDirection = 'up';
    brightnessDirection = 'up';
  }

  export function openCreate() {
    resetForm();
    isEditorOpen = true;
  }

  export function openEdit(index) {
    const rule = rules[index];
    resetForm();
    editingIndex = index;
    
    ruleDescription = rule.description || '';
    ruleEnabled = rule.enabled === false ? 'false' : 'true';

    // Load condition (V1: first condition = key_event)
    if (rule.conditions && rule.conditions.length > 0) {
      const cond = rule.conditions[0];
      conditionType = cond.type || 'key_event';
      behavior = cond.behavior || 'CLICK';
      
      if (cond.keyCode != null) {
        if (keyOptions.some(k => k.code === cond.keyCode)) {
          keySelect = String(cond.keyCode);
        } else {
          keySelect = 'custom';
          keyCodeCustom = String(cond.keyCode);
        }
      }
      comboKeySelect = String(cond.comboKeyCode || comboOptions[0]?.code || 116);
    }

    // Load action (first action from the list)
    if (rule.actions && rule.actions.length > 0) {
      const action = rule.actions[0];
      actionType = action.type || 'builtin_command';

      if (actionType === 'builtin_command') builtinCommand = action.command || 'open_voice_assistant';
      else if (actionType === 'launch_app') {
        launchAppPackage = action.package || '';
        launchAppActivity = action.activity || '';
      }
      else if (actionType === 'run_shell') command = action.command || '';
      else if (actionType === 'send_key') sendKeyCode = String(action.keyCode || '');
      else if (actionType === 'volume_control') volumeDirection = action.direction || 'up';
      else if (actionType === 'brightness_control') brightnessDirection = action.direction || 'up';
      else if (actionType === 'launch_intent') {
        const i = action.intent || {};
        intentAction = i.action || '';
        intentPackage = i.package || '';
        intentClass = i.className || '';
        intentData = i.data || '';
        intentCategory = (i.category || []).join(',');
        intentExtras = i.extras ? Object.entries(i.extras).map(([k,v]) => `${k}=${v}`).join('\n') : '';
      }
      
      // If multiple actions or unsupported type, lock editor
      if (rule.actions.length > 1) editorLocked = true;
    }

    isEditorOpen = true;
  }

  /** Helper to get a display label for a condition */
  function conditionLabel(cond) {
    if (!cond) return '?';
    if (cond.type === 'key_event') {
      const keyName = keyOptions.find(k => k.code === cond.keyCode)?.label || cond.keyCode;
      let label = `${keyName} (${cond.behavior})`;
      if (cond.comboKeyCode) {
        const comboName = keyOptions.find(k => k.code === cond.comboKeyCode)?.label || cond.comboKeyCode;
        label = `${keyName} + ${comboName} (${cond.behavior})`;
      }
      return label;
    }
    return cond.type;
  }

  /** Helper to get a display label for an action */
  function actionLabel(action) {
    if (!action) return '?';
    return action.type;
  }

  async function handleAppSearch() {
    appResults = await onSearchApps(appKeyword);
  }

  function buildAction() {
    if (actionType === 'builtin_command') return { type: 'builtin_command', command: builtinCommand };
    if (actionType === 'launch_app') return { type: 'launch_app', package: launchAppPackage, activity: launchAppActivity || undefined };
    if (actionType === 'run_shell') return { type: 'run_shell', command: command };
    if (actionType === 'send_key') return { type: 'send_key', keyCode: Number(sendKeyCode) };
    if (actionType === 'volume_control') return { type: 'volume_control', direction: volumeDirection };
    if (actionType === 'brightness_control') return { type: 'brightness_control', direction: brightnessDirection };
    if (actionType === 'toggle_screen') return { type: 'toggle_screen' };
    if (actionType === 'intercept') return { type: 'intercept' };
    // M-5: Complete intent assembly
    if (actionType === 'launch_intent') {
      const extras = {};
      if (intentExtras.trim()) {
        for (const line of intentExtras.split('\n')) {
          const eq = line.indexOf('=');
          if (eq > 0) extras[line.substring(0, eq).trim()] = line.substring(eq + 1).trim();
        }
      }
      const cats = intentCategory.split(',').map(s => s.trim()).filter(Boolean);
      return {
        type: 'launch_intent',
        intent: {
          action: intentAction || undefined,
          package: intentPackage || undefined,
          className: intentClass || undefined,
          data: intentData || undefined,
          category: cats.length ? cats : [],
          extras: Object.keys(extras).length ? extras : {}
        }
      };
    }
    return { type: actionType };
  }

  function submit() {
    if (editorLocked) return;
    
    const keyCode = keySelect === 'custom' ? Number(keyCodeCustom) : Number(keySelect);
    let ckc = null;
    if (COMBO_BEHAVIORS.has(behavior)) {
      ckc = Number(comboKeySelect);
    }

    const condition = {
      type: 'key_event',
      keyCode: keyCode,
      comboKeyCode: ckc,
      behavior: behavior
    };

    const action = buildAction();

    const rule = {
      id: editingIndex !== null ? rules[editingIndex].id : null,
      description: ruleDescription,
      enabled: ruleEnabled === 'true',
      conditionLogic: 'and',
      conditions: [condition],
      actions: [action]
    };
    
    onSaveRule(rule, editingIndex);
    isEditorOpen = false;
  }
</script>

<section class="panel mt-4">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h2 class="text-lg font-semibold">3. 规则设置 (Rules)</h2>
    <button class="btn-primary" on:click={openCreate}><img src={plusIcon} alt="" class="h-4 w-4" />新增规则</button>
  </div>
  <p class="hint mt-1">
    条件(Condition) -> 行为(Action)。目前仅支持按键触发，未来将扩展更多条件。
  </p>

  <!-- Rule List -->
  <div class="mt-3 grid gap-2">
    {#each rules as rule, i}
      <div class="flex flex-col gap-2 rounded border border-slate-700 bg-slate-800/50 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex-1">
           <div class="flex items-center gap-2">
             {#if !rule.enabled}<span class="text-xs text-red-400 border border-red-400/30 px-1 rounded">DISABLED</span>{/if}
             <span class="font-bold text-amber-200">{conditionLabel(rule.conditions?.[0])}</span>
             <span class="text-slate-500">-></span>
             <span class="text-sky-200 text-sm font-mono">
               {#if rule.actions?.length > 1}
                 {rule.actions.length} actions
               {:else}
                 {actionLabel(rule.actions?.[0])}
               {/if}
             </span>
           </div>
           <p class="text-xs text-slate-500 mt-1">{rule.description || 'No description'}</p>
        </div>
        <div class="flex gap-2">
          <button class="btn-secondary text-xs" on:click={() => openEdit(i)}>编辑</button>
          <button class="btn-danger text-xs" on:click={() => onDeleteRule(i)}>删除</button>
        </div>
      </div>
    {/each}
  </div>

  <!-- Editor Modal -->
  {#if isEditorOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
      <div class="w-full max-w-2xl rounded-xl bg-slate-900 border border-slate-700 shadow-2xl p-6">
        <h3 class="text-xl font-bold mb-4">{editingIndex === null ? '新增规则' : '编辑规则'}</h3>
        
        {#if formError}
          <div class="mb-4 p-3 bg-red-900/30 border border-red-500/50 text-red-200 rounded text-sm">{formError}</div>
        {/if}

        {#if editorLocked}
          <div class="mb-4 p-3 bg-yellow-900/30 border border-yellow-500/50 text-yellow-200 rounded text-sm">
            此规则包含多个动作或不支持的类型，编辑已锁定。
          </div>
        {/if}

        <div class="grid gap-4">
          <!-- Metadata -->
          <div class="grid grid-cols-2 gap-4">
            <label class="text-sm text-slate-400">备注
              <input class="input mt-1 w-full" bind:value={ruleDescription} placeholder="规则说明..."/>
            </label>
            <label class="text-sm text-slate-400">状态
              <select class="input mt-1 w-full" bind:value={ruleEnabled}>
                <option value="true">启用</option>
                <option value="false">禁用</option>
              </select>
            </label>
          </div>

          <!-- Condition Section -->
          <div class="p-3 bg-slate-800/50 rounded border border-slate-700">
             <h4 class="text-sm font-bold text-amber-400 mb-2 uppercase tracking-wider">Condition (Trigger)</h4>
             <div class="grid gap-3">
               <label class="text-sm text-slate-300">类型: <span class="font-mono text-xs bg-slate-700 px-1 rounded">KEY_EVENT</span></label>
               
               <div class="grid grid-cols-2 gap-3">
                  <label class="text-sm text-slate-300">主按键 (Key)
                    <select class="input mt-1 w-full" bind:value={keySelect} disabled={editorLocked}>
                      {#each keyOptions as opt}
                        <option value={String(opt.code)}>{opt.label}</option>
                      {/each}
                      <option value="custom">手动输入...</option>
                    </select>
                  </label>
                  {#if keySelect === 'custom'}
                  <label class="text-sm text-slate-300">KeyCode
                    <input class="input mt-1 w-full" type="number" bind:value={keyCodeCustom} disabled={editorLocked} />
                  </label>
                  {/if}
               </div>

               <div class="grid grid-cols-2 gap-3">
                  <label class="text-sm text-slate-300">行为 (Behavior)
                     <select class="input mt-1 w-full" bind:value={behavior} disabled={editorLocked}>
                       {#each Array.from(ALL_BEHAVIORS) as b}
                         <option value={b}>{b}</option>
                       {/each}
                     </select>
                  </label>
                  {#if COMBO_BEHAVIORS.has(behavior)}
                    <label class="text-sm text-slate-300">组合键 (Combo Key)
                      <select class="input mt-1 w-full" bind:value={comboKeySelect} disabled={editorLocked}>
                        {#each comboOptions as opt}
                          <option value={String(opt.code)}>{opt.label}</option>
                        {/each}
                      </select>
                    </label>
                  {/if}
               </div>
             </div>
          </div>

          <!-- Action Section -->
          <div class="p-3 bg-slate-800/50 rounded border border-slate-700">
             <h4 class="text-sm font-bold text-sky-400 mb-2 uppercase tracking-wider">Action</h4>
             <label class="text-sm text-slate-300">类型
                <select class="input mt-1 w-full" bind:value={actionType} disabled={editorLocked}>
                   <option value="builtin_command">系统命令</option>
                   <option value="launch_app">启动应用</option>
                   <option value="run_shell">运行 Shell</option>
                   <option value="send_key">映射按键</option>
                   <option value="launch_intent">发送 Intent</option>
                   <option value="volume_control">音量控制</option>
                   <option value="brightness_control">亮度控制</option>
                   <option value="toggle_screen">切换屏幕</option>
                   <option value="intercept">拦截</option>
                </select>
             </label>
             
             <div class="mt-3">
                {#if actionType === 'builtin_command'}
                   <select class="input w-full" bind:value={builtinCommand} disabled={editorLocked}>
                      {#each Object.entries(BUILTIN_LABELS) as [k, v]}
                        <option value={k}>{v} ({k})</option>
                      {/each}
                   </select>
                {:else if actionType === 'launch_app'}
                   <input class="input w-full mb-2" bind:value={appKeyword} placeholder="搜索应用..." on:change={handleAppSearch} disabled={editorLocked} />
                   {#if appResults.length}<select class="input w-full mb-2" bind:value={launchAppPackage} on:change={() => launchAppActivity=''} disabled={editorLocked}><option value="">选择应用...</option>{#each appResults as app}<option value={app.package}>{app.name}</option>{/each}</select>{/if}
                   <input class="input w-full mb-2" bind:value={launchAppPackage} placeholder="Package Name" disabled={editorLocked} />
                   <input class="input w-full" bind:value={launchAppActivity} placeholder="Activity (Optional)" disabled={editorLocked} />
                {:else if actionType === 'run_shell'}
                   <textarea class="input w-full h-20" bind:value={command} placeholder="e.g. input keyevent 26" disabled={editorLocked}></textarea>
                {:else if actionType === 'send_key'}
                   <input class="input w-full" type="number" bind:value={sendKeyCode} placeholder="Target Key Code" disabled={editorLocked} />
                {:else if actionType === 'volume_control'}
                   <select class="input w-full" bind:value={volumeDirection} disabled={editorLocked}>
                     <option value="up">增大 (Up)</option>
                     <option value="down">减小 (Down)</option>
                   </select>
                {:else if actionType === 'brightness_control'}
                   <select class="input w-full" bind:value={brightnessDirection} disabled={editorLocked}>
                     <option value="up">增大 (Up)</option>
                     <option value="down">减小 (Down)</option>
                   </select>
                {:else if actionType === 'launch_intent'}
                   <div class="grid gap-2">
                     <input class="input w-full" bind:value={intentAction} placeholder="Intent Action (e.g. android.intent.action.VIEW)" disabled={editorLocked} />
                     <input class="input w-full" bind:value={intentPackage} placeholder="Package (optional)" disabled={editorLocked} />
                     <input class="input w-full" bind:value={intentClass} placeholder="Class Name (optional)" disabled={editorLocked} />
                     <input class="input w-full" bind:value={intentData} placeholder="Data URI (optional)" disabled={editorLocked} />
                     <input class="input w-full" bind:value={intentCategory} placeholder="Categories (comma-separated)" disabled={editorLocked} />
                     <textarea class="input w-full h-16" bind:value={intentExtras} placeholder="Extras (key=value per line)" disabled={editorLocked}></textarea>
                   </div>
                {/if}
             </div>
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-6">
          <button class="btn-secondary" on:click={() => isEditorOpen = false}>取消</button>
          <button class="btn-primary" on:click={submit} disabled={editorLocked}>确认</button>
        </div>
      </div>
    </div>
  {/if}
</section>
