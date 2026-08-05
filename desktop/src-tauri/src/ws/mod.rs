pub mod pairing;

use serde::{Deserialize, Serialize};
use std::{fmt, str::FromStr};

pub const CONTRACT_VERSION: &str = "1.0.0";
pub const DESKTOP_CAPABILITIES: [&str; 2] = ["action_grouping", "media_upload"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContractVersion {
    raw: String,
    major: u64,
}

impl ContractVersion {
    pub fn as_str(&self) -> &str {
        &self.raw
    }

    pub fn major(&self) -> u64 {
        self.major
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvalidContractVersion(pub String);

impl fmt::Display for InvalidContractVersion {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "invalid semantic contract version: {}", self.0)
    }
}

impl std::error::Error for InvalidContractVersion {}

impl FromStr for ContractVersion {
    type Err = InvalidContractVersion;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let (without_build, build) = value
            .split_once('+')
            .map_or((value, None), |(version, metadata)| {
                (version, Some(metadata))
            });
        let (core, prerelease) = without_build
            .split_once('-')
            .map_or((without_build, None), |(version, label)| {
                (version, Some(label))
            });
        let mut parts = core.split('.');
        let numbers = [parts.next(), parts.next(), parts.next()];

        if parts.next().is_some()
            || numbers.iter().any(|part| {
                !matches!(part, Some(number) if !number.is_empty()
                    && number.bytes().all(|byte| byte.is_ascii_digit())
                    && (number == &"0" || !number.starts_with('0')))
            })
            || !valid_identifiers(prerelease, false)
            || !valid_identifiers(build, true)
        {
            return Err(InvalidContractVersion(value.to_owned()));
        }

        let major = numbers[0]
            .expect("version components were validated")
            .parse()
            .map_err(|_| InvalidContractVersion(value.to_owned()))?;

        Ok(Self {
            raw: value.to_owned(),
            major,
        })
    }
}

fn valid_identifiers(value: Option<&str>, allow_numeric_leading_zero: bool) -> bool {
    value.is_none_or(|identifiers| {
        !identifiers.is_empty()
            && identifiers.split('.').all(|identifier| {
                !identifier.is_empty()
                    && identifier
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
                    && (allow_numeric_leading_zero
                        || !identifier.bytes().all(|byte| byte.is_ascii_digit())
                        || identifier == "0"
                        || !identifier.starts_with('0'))
            })
    })
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum InboundHandshakeFrame {
    Hello(HelloHandshake),
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
pub struct HelloHandshake {
    pub contract_version: String,
    pub capabilities: Vec<String>,
    // Trust half of the frame (FR-020). Defaulted because version negotiation happens whether or
    // not credentials are present, and an older minor may not send them at all.
    #[serde(default)]
    pub device_id: String,
    #[serde(default)]
    pub pairing_token: Option<String>,
    // ponytail: parsed but not yet checked — the per-device credential is stored and re-verified by
    // the device registry (feat-014). Until then a return visit re-pairs from the QR.
    #[serde(default)]
    pub reconnect_credential: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct PairedHandshake {
    #[serde(rename = "type")]
    pub message_type: &'static str,
    pub contract_version: &'static str,
    pub capabilities: Vec<&'static str>,
}

impl PairedHandshake {
    fn current() -> Self {
        Self {
            message_type: "paired",
            contract_version: CONTRACT_VERSION,
            capabilities: DESKTOP_CAPABILITIES.to_vec(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OutOfDatePeer {
    DeviceSdk,
    Desktop,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct VersionMismatch {
    #[serde(rename = "type")]
    pub message_type: &'static str,
    pub reason: &'static str,
    pub out_of_date: OutOfDatePeer,
    pub message: String,
}

#[derive(Debug, PartialEq, Eq)]
pub struct AcceptedHandshake {
    pub device_contract_version: ContractVersion,
    pub device_capabilities: Vec<String>,
    pub response: PairedHandshake,
}

impl AcceptedHandshake {
    pub fn capability(&self, name: &str) -> CapabilityAvailability {
        if self.device_capabilities.iter().any(|item| item == name) {
            CapabilityAvailability::Available
        } else {
            CapabilityAvailability::UnavailableBecauseOutOfDate {
                reason: format!(
                    "Unavailable for this device: SDK contract {} does not advertise `{name}`; upgrade the device SDK.",
                    self.device_contract_version.as_str()
                ),
            }
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum CapabilityAvailability {
    Available,
    UnavailableBecauseOutOfDate { reason: String },
}

#[derive(Debug, PartialEq, Eq)]
pub enum HandshakeOutcome {
    Accepted(AcceptedHandshake),
    Refused(VersionMismatch),
    IgnoredUnknownMessage,
}

#[derive(Debug)]
pub enum HandshakeError {
    MalformedJson(serde_json::Error),
    InvalidVersion(InvalidContractVersion),
}

impl fmt::Display for HandshakeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MalformedJson(error) => write!(formatter, "malformed handshake: {error}"),
            Self::InvalidVersion(error) => error.fmt(formatter),
        }
    }
}

impl std::error::Error for HandshakeError {}

pub fn negotiate_handshake(json: &str) -> Result<HandshakeOutcome, HandshakeError> {
    let frame: InboundHandshakeFrame =
        serde_json::from_str(json).map_err(HandshakeError::MalformedJson)?;
    let InboundHandshakeFrame::Hello(hello) = frame else {
        return Ok(HandshakeOutcome::IgnoredUnknownMessage);
    };

    let device_version = hello
        .contract_version
        .parse::<ContractVersion>()
        .map_err(HandshakeError::InvalidVersion)?;
    let desktop_version = CONTRACT_VERSION
        .parse::<ContractVersion>()
        .expect("the compiled contract version must be valid semver");

    if device_version.major() == desktop_version.major() {
        return Ok(HandshakeOutcome::Accepted(AcceptedHandshake {
            device_contract_version: device_version,
            device_capabilities: hello.capabilities,
            response: PairedHandshake::current(),
        }));
    }

    let (out_of_date, message) = if device_version.major() < desktop_version.major() {
        (
            OutOfDatePeer::DeviceSdk,
            format!(
                "Device SDK uses contract {}; upgrade the device SDK to contract major {}.",
                device_version.as_str(),
                desktop_version.major()
            ),
        )
    } else {
        (
            OutOfDatePeer::Desktop,
            format!(
                "Desktop uses contract {CONTRACT_VERSION}; upgrade the desktop to contract major {}.",
                device_version.major()
            ),
        )
    };

    Ok(HandshakeOutcome::Refused(VersionMismatch {
        message_type: "nack",
        reason: "version_mismatch",
        out_of_date,
        message,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hello(version: &str, capabilities: &str) -> String {
        format!(
            r#"{{"type":"hello","contract_version":"{version}","capabilities":{capabilities}}}"#
        )
    }

    #[test]
    fn same_major_connects_and_exchanges_capabilities() {
        let outcome = negotiate_handshake(&hello("1.9.3", r#"["api_capture","user_actions"]"#))
            .expect("same-major hello should parse");
        let HandshakeOutcome::Accepted(accepted) = outcome else {
            panic!("same-major peer must connect");
        };

        assert_eq!(accepted.device_contract_version.major(), 1);
        assert_eq!(
            accepted.device_capabilities,
            ["api_capture", "user_actions"]
        );
        assert_eq!(accepted.response.contract_version, CONTRACT_VERSION);
        assert_eq!(accepted.response.capabilities, DESKTOP_CAPABILITIES);
    }

    #[test]
    fn valid_semver_prerelease_and_build_metadata_connect() {
        assert!(matches!(
            negotiate_handshake(&hello("1.2.0-rc.1+ios.45", "[]")),
            Ok(HandshakeOutcome::Accepted(_))
        ));
    }

    #[test]
    fn older_major_refuses_and_names_device_sdk_as_stale() {
        let outcome = negotiate_handshake(&hello("0.8.0", "[]")).unwrap();
        let HandshakeOutcome::Refused(refusal) = outcome else {
            panic!("major mismatch must be refused");
        };

        assert_eq!(refusal.reason, "version_mismatch");
        assert_eq!(refusal.out_of_date, OutOfDatePeer::DeviceSdk);
        assert!(refusal.message.contains("upgrade the device SDK"));
        assert!(refusal.message.contains("major 1"));
        let response = serde_json::to_value(refusal).unwrap();
        assert_eq!(response["type"], "nack");
        assert_eq!(response["reason"], "version_mismatch");
        assert_eq!(response["out_of_date"], "device_sdk");
    }

    #[test]
    fn newer_major_refuses_and_names_desktop_as_stale() {
        let outcome = negotiate_handshake(&hello("2.0.0", "[]")).unwrap();
        let HandshakeOutcome::Refused(refusal) = outcome else {
            panic!("major mismatch must be refused");
        };

        assert_eq!(refusal.out_of_date, OutOfDatePeer::Desktop);
        assert!(refusal.message.contains("upgrade the desktop"));
        assert!(refusal.message.contains("major 2"));
    }

    #[test]
    fn unknown_hello_fields_are_ignored() {
        let frame = r#"{
            "type":"hello",
            "contract_version":"1.1.0",
            "capabilities":[],
            "added_by_newer_minor":{"nested":true}
        }"#;

        assert!(matches!(
            negotiate_handshake(frame),
            Ok(HandshakeOutcome::Accepted(_))
        ));
    }

    #[test]
    fn unknown_message_types_are_ignored() {
        let frame = r#"{"type":"future_message","new_field":true}"#;
        assert_eq!(
            negotiate_handshake(frame).unwrap(),
            HandshakeOutcome::IgnoredUnknownMessage
        );
    }

    #[test]
    fn missing_capability_is_explicitly_unavailable_with_upgrade_reason() {
        let HandshakeOutcome::Accepted(accepted) =
            negotiate_handshake(&hello("1.0.0", r#"["api_capture"]"#)).unwrap()
        else {
            panic!("same-major peer must connect");
        };

        assert_eq!(
            accepted.capability("api_capture"),
            CapabilityAvailability::Available
        );
        let CapabilityAvailability::UnavailableBecauseOutOfDate { reason } =
            accepted.capability("user_actions")
        else {
            panic!("missing capability must not be silently hidden");
        };
        assert!(reason.contains("Unavailable for this device"));
        assert!(reason.contains("upgrade the device SDK"));
    }

    #[test]
    fn malformed_semver_is_rejected() {
        for version in ["1.2", "01.2.3", "1.2.3-", "1.2.3+", "1.2.3-01"] {
            assert!(matches!(
                negotiate_handshake(&hello(version, "[]")),
                Err(HandshakeError::InvalidVersion(_))
            ));
        }
    }

    #[test]
    fn paired_frame_serializes_the_version_and_capabilities() {
        let json = serde_json::to_value(PairedHandshake::current()).unwrap();

        assert_eq!(json["type"], "paired");
        assert_eq!(json["contract_version"], CONTRACT_VERSION);
        assert_eq!(json["capabilities"][0], "action_grouping");
    }
}
