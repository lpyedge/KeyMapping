use crate::config::{Action, GlobalSettings, Rule, RuleType};
use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct KeyState {
    pub pressed_at: Instant,
    pub triggered_short_press: bool,
    pub triggered_long_press: bool,
}

#[derive(Debug)]
struct PendingClick {
    key_code: u16,
    action: Action,
    available_at: Instant,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ParsedRule {
    original: Rule,
    trigger_keys: Vec<u16>,
}

pub struct StateMachine {
    key_states: HashMap<u16, KeyState>,
    parsed_rules: Vec<ParsedRule>,
    pending_clicks: Vec<PendingClick>,

    // Configurable thresholds
    long_press_threshold: Duration,
    short_press_threshold: Duration,
    double_tap_interval: Duration,
    combination_timeout: Duration,

    // Tap history: KeyCode -> (Count, LastReleaseTime)
    tap_history: HashMap<u16, (u32, Instant)>,

    // Track triggered rules to prevent repeats for Hold/ComboHold
    triggered_rules: HashSet<String>,
}

impl StateMachine {
    pub fn new(
        rules: Vec<Rule>,
        hardware_map: HashMap<u16, String>,
        long_press_ms: u64,
        short_press_ms: u64,
        double_tap_ms: u64,
        combination_timeout_ms: u64,
    ) -> Self {
        let mut sm = Self {
            key_states: HashMap::new(),
            parsed_rules: Vec::new(),
            pending_clicks: Vec::new(),
            long_press_threshold: Duration::from_millis(long_press_ms),
            short_press_threshold: Duration::from_millis(short_press_ms),
            double_tap_interval: Duration::from_millis(double_tap_ms),
            combination_timeout: Duration::from_millis(combination_timeout_ms),
            tap_history: HashMap::new(),
            triggered_rules: HashSet::new(),
        };
        sm.update_rules(rules, hardware_map);
        sm
    }

    pub fn update_rules(&mut self, rules: Vec<Rule>, hardware_map: HashMap<u16, String>) {
        let name_to_code: HashMap<String, u16> =
            hardware_map.iter().map(|(k, v)| (v.clone(), *k)).collect();

        let new_rules: Vec<ParsedRule> = rules
            .into_iter()
            .map(|r| {
                let keys = parse_trigger(&r.trigger, &name_to_code, r.rule_type);
                ParsedRule {
                    original: r,
                    trigger_keys: keys,
                }
            })
            .collect();

        if new_rules != self.parsed_rules {
            self.parsed_rules = new_rules;
            self.triggered_rules.clear();
            self.pending_clicks.clear();
            self.tap_history.clear();
        }
    }

    pub fn update_settings(&mut self, settings: &GlobalSettings) {
        self.long_press_threshold = Duration::from_millis(settings.long_press_threshold_ms as u64);
        self.short_press_threshold = Duration::from_millis(settings.short_press_threshold_ms as u64);
        self.double_tap_interval = Duration::from_millis(settings.double_tap_interval_ms as u64);
        self.combination_timeout = Duration::from_millis(settings.combination_timeout_ms as u64);
    }

    pub fn handle_key(&mut self, key_code: u16, value: i32) -> Vec<Action> {
        let mut actions = Vec::new();
        let now = Instant::now();

        if value == 1 {
            // DOWN
            self.key_states.insert(
                key_code,
                KeyState {
                    pressed_at: now,
                    triggered_short_press: false,
                    triggered_long_press: false,
                },
            );
        } else if value == 0 {
            // UP
            if let Some(state) = self.key_states.remove(&key_code) {
                for pr in &self.parsed_rules {
                    if pr.trigger_keys.contains(&key_code) {
                        self.triggered_rules.remove(&pr.original.id);
                    }
                }

                let hold_duration = now.duration_since(state.pressed_at);
                let hold_handled = state.triggered_short_press || state.triggered_long_press;

                if !hold_handled && hold_duration < self.short_press_threshold {
                    let combo_clicks = self.check_combo_release(key_code, state.pressed_at, now);
                    if !combo_clicks.is_empty() {
                        actions.extend(combo_clicks);
                    } else {
                        self.handle_tap(key_code, now, &mut actions);
                    }
                }
            }
        }

        actions
    }

    fn handle_tap(&mut self, key_code: u16, now: Instant, actions: &mut Vec<Action>) {
        let (count, last_time) = self.tap_history.get(&key_code).cloned().unwrap_or((0, now));

        let new_count = if now.duration_since(last_time) < self.double_tap_interval {
            count + 1
        } else {
            1
        };
        self.tap_history.insert(key_code, (new_count, now));

        let double_click_rule = self.parsed_rules.iter().find(|pr| {
            pr.original.enabled
                && pr.trigger_keys.len() == 1
                && pr.trigger_keys[0] == key_code
                && pr.original.rule_type == RuleType::DoubleClick
        });

        let click_rules: Vec<&ParsedRule> = self
            .parsed_rules
            .iter()
            .filter(|pr| {
                pr.original.enabled
                    && pr.trigger_keys.len() == 1
                    && pr.trigger_keys[0] == key_code
                    && pr.original.rule_type == RuleType::Click
            })
            .collect();

        if double_click_rule.is_some() {
            if new_count == 2 {
                actions.push(double_click_rule.expect("checked is_some").original.action.clone());
                self.pending_clicks.retain(|p| p.key_code != key_code);
                self.tap_history.remove(&key_code);
            } else {
                for pr in click_rules {
                    self.pending_clicks.push(PendingClick {
                        key_code,
                        action: pr.original.action.clone(),
                        available_at: now + self.double_tap_interval,
                    });
                }
            }
        } else {
            for pr in click_rules {
                actions.push(pr.original.action.clone());
            }
        }
    }

    pub fn tick(&mut self) -> Vec<Action> {
        let mut actions = Vec::new();
        let now = Instant::now();

        let key_codes: Vec<u16> = self.key_states.keys().copied().collect();

        for key_code in key_codes {
            if let Some(state) = self.key_states.get_mut(&key_code) {
                let hold_time = now.duration_since(state.pressed_at);

                let sp_rules: Vec<&ParsedRule> = self
                    .parsed_rules
                    .iter()
                    .filter(|pr| {
                        pr.original.enabled
                            && pr.trigger_keys.len() == 1
                            && pr.trigger_keys[0] == key_code
                            && pr.original.rule_type == RuleType::ShortPress
                    })
                    .collect();

                for pr in sp_rules {
                    if !self.triggered_rules.contains(&pr.original.id)
                        && hold_time >= self.short_press_threshold
                    {
                        actions.push(pr.original.action.clone());
                        self.triggered_rules.insert(pr.original.id.clone());
                        state.triggered_short_press = true;
                    }
                }

                let lp_rules: Vec<&ParsedRule> = self
                    .parsed_rules
                    .iter()
                    .filter(|pr| {
                        pr.original.enabled
                            && pr.trigger_keys.len() == 1
                            && pr.trigger_keys[0] == key_code
                            && pr.original.rule_type == RuleType::LongPress
                    })
                    .collect();

                for pr in lp_rules {
                    if !self.triggered_rules.contains(&pr.original.id)
                        && hold_time >= self.long_press_threshold
                    {
                        actions.push(pr.original.action.clone());
                        self.triggered_rules.insert(pr.original.id.clone());
                        state.triggered_long_press = true;
                    }
                }
            }
        }

        actions.extend(self.check_combo_hold(
            RuleType::ComboShortPress,
            self.short_press_threshold,
            now,
        ));
        actions.extend(self.check_combo_hold(
            RuleType::ComboLongPress,
            self.long_press_threshold,
            now,
        ));

        let mut retained = Vec::new();
        for pending in self.pending_clicks.drain(..) {
            if now >= pending.available_at {
                actions.push(pending.action);
            } else {
                retained.push(pending);
            }
        }
        self.pending_clicks = retained;

        actions
    }

    fn check_combo_hold(&mut self, rtype: RuleType, default_threshold: Duration, now: Instant) -> Vec<Action> {
        let mut actions = Vec::new();

        let indices: Vec<usize> = self
            .parsed_rules
            .iter()
            .enumerate()
            .filter(|(_, pr)| {
                pr.original.enabled && pr.original.rule_type == rtype && pr.trigger_keys.len() == 2
            })
            .map(|(i, _)| i)
            .collect();

        for i in indices {
            let pr = &self.parsed_rules[i];
            if self.triggered_rules.contains(&pr.original.id) {
                continue;
            }

            let all_held_long_enough = pr.trigger_keys.iter().all(|k| {
                self.key_states
                    .get(k)
                    .map(|state| now.duration_since(state.pressed_at) >= default_threshold)
                    .unwrap_or(false)
            });

            if !all_held_long_enough {
                continue;
            }

            let times: Vec<Instant> = pr
                .trigger_keys
                .iter()
                .filter_map(|k| self.key_states.get(k).map(|s| s.pressed_at))
                .collect();

            if let (Some(min), Some(max)) = (times.iter().min(), times.iter().max()) {
                if max.duration_since(*min) <= self.combination_timeout {
                    actions.push(pr.original.action.clone());
                    self.triggered_rules.insert(pr.original.id.clone());
                    for key in &pr.trigger_keys {
                        if let Some(state) = self.key_states.get_mut(key) {
                            match rtype {
                                RuleType::ComboShortPress => state.triggered_short_press = true,
                                RuleType::ComboLongPress => state.triggered_long_press = true,
                                _ => {}
                            }
                        }
                    }
                }
            }
        }

        actions
    }

    fn check_combo_release(&self, key_code: u16, released_pressed_at: Instant, now: Instant) -> Vec<Action> {
        let mut actions = Vec::new();
        for pr in &self.parsed_rules {
            if !(pr.original.enabled
                && pr.original.rule_type == RuleType::ComboClick
                && pr.trigger_keys.len() == 2
                && pr.trigger_keys.contains(&key_code))
            {
                continue;
            }

            let mut pressed_times = Vec::with_capacity(2);
            let mut valid_combo = true;

            for k in &pr.trigger_keys {
                if *k == key_code {
                    if now.duration_since(released_pressed_at) >= self.short_press_threshold {
                        valid_combo = false;
                        break;
                    }
                    pressed_times.push(released_pressed_at);
                    continue;
                }

                if let Some(state) = self.key_states.get(k) {
                    if now.duration_since(state.pressed_at) >= self.short_press_threshold {
                        valid_combo = false;
                        break;
                    }
                    pressed_times.push(state.pressed_at);
                } else {
                    valid_combo = false;
                    break;
                }
            }

            if !valid_combo {
                continue;
            }

            if let (Some(min), Some(max)) = (pressed_times.iter().min(), pressed_times.iter().max()) {
                if max.duration_since(*min) <= self.combination_timeout {
                    actions.push(pr.original.action.clone());
                }
            }
        }
        actions
    }

    pub fn is_mapped(&self, key_code: u16) -> bool {
        self.parsed_rules.iter().any(|pr| pr.trigger_keys.contains(&key_code))
    }
}

fn parse_trigger(trigger: &str, map: &HashMap<String, u16>, rule_type: RuleType) -> Vec<u16> {
    let parse_token = |token: &str| -> Option<u16> {
        let t = token.trim();
        if t.is_empty() {
            return None;
        }
        if let Ok(code) = t.parse::<u16>() {
            return Some(code);
        }
        map.get(t).copied()
    };

    match rule_type {
        RuleType::ComboClick | RuleType::ComboShortPress | RuleType::ComboLongPress => {
            let parts: Vec<&str> = trigger
                .split('+')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();
            if parts.len() != 2 {
                return Vec::new();
            }

            match (parse_token(parts[0]), parse_token(parts[1])) {
                (Some(a), Some(b)) if a != b => vec![a, b],
                _ => Vec::new(),
            }
        }
        _ => parse_token(trigger).map(|code| vec![code]).unwrap_or_default(),
    }
}
