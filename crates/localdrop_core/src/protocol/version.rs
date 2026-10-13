use serde::{Deserialize, Serialize};

/// Current protocol version.
pub const CURRENT_VERSION_MAJOR: u16 = 1;
pub const CURRENT_VERSION_MINOR: u16 = 0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProtocolVersion {
    pub major: u16,
    pub minor: u16,
}

impl Default for ProtocolVersion {
    fn default() -> Self {
        Self {
            major: CURRENT_VERSION_MAJOR,
            minor: CURRENT_VERSION_MINOR,
        }
    }
}

impl ProtocolVersion {
    pub const CURRENT: Self = Self {
        major: CURRENT_VERSION_MAJOR,
        minor: CURRENT_VERSION_MINOR,
    };

    pub fn new(major: u16, minor: u16) -> Self {
        Self { major, minor }
    }

    /// Checks if a remote protocol version is compatible with this version.
    /// Major versions must match; higher minor versions are accepted in backward-compatibility mode.
    pub fn is_compatible_with(&self, other: &Self) -> bool {
        self.major == other.major
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version_compatibility() {
        let v1_0 = ProtocolVersion::new(1, 0);
        let v1_1 = ProtocolVersion::new(1, 1);
        let v2_0 = ProtocolVersion::new(2, 0);

        assert!(v1_0.is_compatible_with(&v1_1));
        assert!(v1_1.is_compatible_with(&v1_0));
        assert!(!v1_0.is_compatible_with(&v2_0));
    }
}
