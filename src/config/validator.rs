use super::{Config, RuleType};
use anyhow::{anyhow, bail, Result};
use std::collections::{HashMap, HashSet};

impl Config {
    pub fn validate(&self) -> Result<()> {
        if self.device_name.trim().is_empty() {
            bail!("device_name cannot be empty");
        }

        if self.settings.short_press_threshold_ms == 0 {
            bail!("settings.short_press_threshold_ms must be > 0");
        }
        if self.settings.long_press_threshold_ms < self.settings.short_press_threshold_ms {
            bail!("settings.long_press_threshold_ms must be >= short_press_threshold_ms");
        }
        if self.settings.double_tap_interval_ms == 0 {
            bail!("settings.double_tap_interval_ms must be > 0");
        }
        if self.settings.combination_timeout_ms == 0 {
            bail!("settings.combination_timeout_ms must be > 0");
        }

        let mut seen_ids = HashSet::new();
        let name_to_code: HashMap<&str, u16> = self
            .hardware_map
            .iter()
            .map(|(code, name)| (name.as_str(), *code))
            .collect();

        let resolve_token = |token: &str| -> Option<u16> {
            let t = token.trim();
            if t.is_empty() {
                return None;
            }
            if let Ok(code) = t.parse::<u16>() {
                return Some(code);
            }
            name_to_code.get(t).copied()
        };

        for rule in &self.rules {
            if rule.id.trim().is_empty() {
                bail!("Rule id cannot be empty");
            }
            if rule.trigger.trim().is_empty() {
                bail!("Rule '{}' trigger cannot be empty", rule.id);
            }
            if !seen_ids.insert(&rule.id) {
                bail!("Duplicate rule ID: {}", rule.id);
            }

            match rule.rule_type {
                RuleType::ComboClick | RuleType::ComboShortPress | RuleType::ComboLongPress => {
                    if rule.trigger.contains("->") {
                        bail!("Rule '{}' combo type cannot contain '->'", rule.id);
                    }

                    let parts: Vec<&str> = rule
                        .trigger
                        .split('+')
                        .map(|s| s.trim())
                        .filter(|s| !s.is_empty())
                        .collect();

                    if parts.len() != 2 {
                        bail!(
                            "Rule '{}' combo type requires exactly 2 keys separated by '+'",
                            rule.id
                        );
                    }

                    let left = resolve_token(parts[0]).ok_or_else(|| {
                        anyhow!("Rule '{}' has unknown combo token '{}'", rule.id, parts[0])
                    })?;
                    let right = resolve_token(parts[1]).ok_or_else(|| {
                        anyhow!("Rule '{}' has unknown combo token '{}'", rule.id, parts[1])
                    })?;

                    if left == right {
                        bail!("Rule '{}' combo trigger cannot use identical keys", rule.id);
                    }
                }
                _ => {
                    if rule.trigger.contains("->") {
                        bail!("Rule '{}' non-combo type cannot use '->' trigger", rule.id);
                    }
                    if rule.trigger.contains('+') {
                        bail!("Rule '{}' non-combo type cannot use '+' trigger", rule.id);
                    }
                    if resolve_token(&rule.trigger).is_none() {
                        bail!(
                            "Rule '{}' has unknown trigger token '{}'",
                            rule.id,
                            rule.trigger
                        );
                    }
                }
            }
        }
        Ok(())
    }
}
