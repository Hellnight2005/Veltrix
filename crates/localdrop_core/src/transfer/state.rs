use crate::error::LocalDropError;
use serde::{Deserialize, Serialize};

/// Explicit Transfer States as defined in the LocalDrop Engine Plan.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TransferState {
    Queued,
    Connecting,
    Authenticating,
    Preparing,
    Transferring,
    Verifying,
    Completed,
    Interrupted,
    Reconnecting,
    Resuming,
    Retrying,
    Cancelled,
    Failed,
}

impl TransferState {
    /// Checks if a transition from `self` to `next` is permitted by the state machine.
    pub fn can_transition_to(&self, next: TransferState) -> bool {
        match (self, next) {
            // Self-transition is a no-op (allowed)
            (s, n) if *s == n => true,

            // Queued
            (Self::Queued, Self::Connecting) => true,
            (Self::Queued, Self::Cancelled) => true,

            // Connecting
            (Self::Connecting, Self::Authenticating) => true,
            (Self::Connecting, Self::Interrupted) => true,
            (Self::Connecting, Self::Failed) => true,
            (Self::Connecting, Self::Cancelled) => true,

            // Authenticating
            (Self::Authenticating, Self::Preparing) => true,
            (Self::Authenticating, Self::Failed) => true,
            (Self::Authenticating, Self::Cancelled) => true,

            // Preparing
            (Self::Preparing, Self::Transferring) => true,
            (Self::Preparing, Self::Failed) => true,
            (Self::Preparing, Self::Cancelled) => true,

            // Transferring
            (Self::Transferring, Self::Verifying) => true,
            (Self::Transferring, Self::Interrupted) => true,
            (Self::Transferring, Self::Cancelled) => true,
            (Self::Transferring, Self::Failed) => true,

            // Interrupted
            (Self::Interrupted, Self::Reconnecting) => true,
            (Self::Interrupted, Self::Failed) => true,
            (Self::Interrupted, Self::Cancelled) => true,

            // Reconnecting
            (Self::Reconnecting, Self::Resuming) => true,
            (Self::Reconnecting, Self::Retrying) => true,
            (Self::Reconnecting, Self::Failed) => true,
            (Self::Reconnecting, Self::Cancelled) => true,

            // Resuming
            (Self::Resuming, Self::Preparing) => true,
            (Self::Resuming, Self::Transferring) => true,
            (Self::Resuming, Self::Failed) => true,
            (Self::Resuming, Self::Cancelled) => true,

            // Retrying
            (Self::Retrying, Self::Connecting) => true,
            (Self::Retrying, Self::Failed) => true,
            (Self::Retrying, Self::Cancelled) => true,

            // Verifying
            (Self::Verifying, Self::Completed) => true,
            (Self::Verifying, Self::Failed) => true,

            // Terminal states
            (Self::Completed, _) => false,
            (Self::Cancelled, _) => false,
            (Self::Failed, Self::Retrying) => true,
            (Self::Failed, _) => false,

            _ => false,
        }
    }

    /// Transition to `next` state, returning an error if the transition is illegal.
    pub fn transition_to(&mut self, next: TransferState) -> Result<(), LocalDropError> {
        if self.can_transition_to(next) {
            *self = next;
            Ok(())
        } else {
            Err(LocalDropError::IllegalStateTransition {
                from: format!("{:?}", self),
                to: format!("{:?}", next),
            })
        }
    }

    /// Indicates whether the state is final and no further progress occurs.
    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Completed | Self::Cancelled)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_forward_lifecycle() {
        let mut state = TransferState::Queued;
        assert!(state.transition_to(TransferState::Connecting).is_ok());
        assert!(state.transition_to(TransferState::Authenticating).is_ok());
        assert!(state.transition_to(TransferState::Preparing).is_ok());
        assert!(state.transition_to(TransferState::Transferring).is_ok());
        assert!(state.transition_to(TransferState::Verifying).is_ok());
        assert!(state.transition_to(TransferState::Completed).is_ok());
        assert!(state.is_terminal());

        // Completed cannot transition anywhere
        assert!(state.transition_to(TransferState::Transferring).is_err());
    }

    #[test]
    fn test_interruption_and_resume_lifecycle() {
        let mut state = TransferState::Transferring;
        assert!(state.transition_to(TransferState::Interrupted).is_ok());
        assert!(state.transition_to(TransferState::Reconnecting).is_ok());
        assert!(state.transition_to(TransferState::Resuming).is_ok());
        assert!(state.transition_to(TransferState::Transferring).is_ok());
    }

    #[test]
    fn test_illegal_jump_fails() {
        let mut state = TransferState::Queued;
        // Queued cannot directly jump to Completed or Verifying
        assert!(state.transition_to(TransferState::Completed).is_err());
        assert!(state.transition_to(TransferState::Verifying).is_err());
    }
}
