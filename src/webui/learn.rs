use std::time::{Duration, Instant};

pub const LEARN_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Clone, Debug, PartialEq)]
pub enum LearnStatus {
    Idle,
    Learning { start: Instant },
    Captured { key_code: u16 },
    Timeout,
}

#[derive(Clone, Debug)]
pub struct LearnResultSnapshot {
    pub status: LearnStatus,
    pub remaining_ms: Option<u32>,
}

pub struct LearnState {
    pub status: LearnStatus,
    // Keep consuming the matching UP after a captured DOWN to avoid half events leaking through.
    consumed_key_up: Option<u16>,
}

impl LearnState {
    pub fn start(&mut self) {
        self.status = LearnStatus::Learning {
            start: Instant::now(),
        };
        self.consumed_key_up = None;
    }

    pub fn refresh_timeout(&mut self) {
        if let LearnStatus::Learning { start } = self.status {
            if start.elapsed() >= LEARN_TIMEOUT {
                self.status = LearnStatus::Timeout;
                self.consumed_key_up = None;
            }
        }
    }

    pub fn consume_event(&mut self, key_code: u16, value: i32) -> bool {
        self.refresh_timeout();

        match self.status {
            LearnStatus::Learning { .. } => {
                // Intercept events while learning to avoid triggering normal mappings.
                if value == 1 {
                    self.status = LearnStatus::Captured { key_code };
                    self.consumed_key_up = Some(key_code);
                }
                true
            }
            LearnStatus::Captured { .. } => {
                if self.consumed_key_up == Some(key_code) {
                    if value == 0 {
                        self.consumed_key_up = None;
                    }
                    return true;
                }
                false
            }
            LearnStatus::Idle | LearnStatus::Timeout => false,
        }
    }

    pub fn snapshot(&mut self) -> LearnResultSnapshot {
        self.refresh_timeout();

        match self.status {
            LearnStatus::Learning { start } => {
                let elapsed = start.elapsed();
                let remaining = LEARN_TIMEOUT.saturating_sub(elapsed).as_millis() as u32;
                LearnResultSnapshot {
                    status: self.status.clone(),
                    remaining_ms: Some(remaining),
                }
            }
            _ => LearnResultSnapshot {
                status: self.status.clone(),
                remaining_ms: None,
            },
        }
    }
}

impl Default for LearnState {
    fn default() -> Self {
        Self {
            status: LearnStatus::Idle,
            consumed_key_up: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_and_capture_should_consume_down_and_matching_up() {
        let mut state = LearnState::default();
        state.start();

        assert!(matches!(state.status, LearnStatus::Learning { .. }));
        assert!(state.consume_event(116, 1));
        assert!(matches!(state.status, LearnStatus::Captured { key_code: 116 }));

        assert!(state.consume_event(116, 0));
        assert!(!state.consume_event(115, 0));
    }

    #[test]
    fn snapshot_should_timeout_when_learning_exceeds_limit() {
        let mut state = LearnState {
            status: LearnStatus::Learning {
                start: Instant::now() - LEARN_TIMEOUT - Duration::from_millis(1),
            },
            consumed_key_up: None,
        };

        let snapshot = state.snapshot();
        assert!(matches!(snapshot.status, LearnStatus::Timeout));
        assert!(snapshot.remaining_ms.is_none());
    }

    #[test]
    fn snapshot_should_return_remaining_ms_while_learning() {
        let mut state = LearnState::default();
        state.start();

        let snapshot = state.snapshot();
        assert!(matches!(snapshot.status, LearnStatus::Learning { .. }));
        let remaining = snapshot.remaining_ms.expect("remaining_ms should exist");
        assert!(remaining <= LEARN_TIMEOUT.as_millis() as u32);
    }
}
