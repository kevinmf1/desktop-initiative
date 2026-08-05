//! Pairing tokens — the desktop's only trust gate for a device (FR-016, FR-020, FR-020a).
//!
//! One active token at a time. Minting is also refreshing: the slot is overwritten, so the
//! previous token is gone rather than marked stale — FR-020a's "invalidates the previous one"
//! needs no bookkeeping and cannot be got wrong by a later reader.

use std::{
    net::{IpAddr, Ipv4Addr, UdpSocket},
    sync::Mutex,
};

use rand::Rng;
use serde::Serialize;
use time::{Duration, OffsetDateTime};

use super::{HelloHandshake, CONTRACT_VERSION};

/// FR-020a. Whichever comes first — this, or the single use.
pub const TTL: Duration = Duration::minutes(5);
/// The manual-entry code is 9 digits, so refuse to be a brute-force oracle: a handful of wrong
/// guesses burns the token and the tester refreshes.
const MAX_WRONG_GUESSES: u8 = 5;
/// ponytail: feat-015 owns the listener; this is the port it will bind, named once here so the QR
/// and the server cannot disagree.
pub const WS_PORT: u16 = 8787;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PairingToken {
    pub token: String,
    pub ws_url: String,
    pub issued_at: OffsetDateTime,
    pub expires_at: OffsetDateTime,
    pub consumed_at: Option<OffsetDateTime>,
    wrong_guesses: u8,
}

/// The active token. Desktop-only, never synced, never persisted — a restart should not resurrect
/// a token whose 5 minutes elapsed while the app was closed.
#[derive(Default)]
pub struct PairingState(pub Mutex<Option<PairingToken>>);

/// What the webview renders: the QR payload as a module grid, plus the same token as digits for
/// manual entry. The token is the whole secret, so nothing else needs to be transported.
#[derive(Debug, Serialize)]
pub struct PairingInvite {
    pub token: String,
    pub ws_url: String,
    pub contract_version: &'static str,
    #[serde(with = "time::serde::rfc3339")]
    pub expires_at: OffsetDateTime,
    pub qr_size: usize,
    pub qr_modules: Vec<bool>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct PairingNack {
    #[serde(rename = "type")]
    pub message_type: &'static str,
    pub reason: &'static str,
    pub message: String,
}

impl PairingNack {
    fn expired_token(message: &str) -> Self {
        Self {
            message_type: "nack",
            reason: "expired_token",
            message: message.to_owned(),
        }
    }
}

/// A device that presented a valid token. The credential lets it come back without a new QR;
/// storing and re-checking it belongs to the device registry (feat-014, FR-018/019).
#[derive(Debug, PartialEq, Eq)]
pub struct Authorized {
    pub device_id: String,
    pub reconnect_credential: String,
}

fn digits(count: usize) -> String {
    let mut rng = rand::thread_rng();
    (0..count)
        .map(|_| char::from(b'0' + rng.gen_range(0..10u8)))
        .collect()
}

/// Mints and installs a new token, discarding whatever was there (FR-020a).
pub fn mint(slot: &mut Option<PairingToken>, ws_url: String, now: OffsetDateTime) -> PairingToken {
    let token = PairingToken {
        token: digits(9),
        ws_url,
        issued_at: now,
        expires_at: now + TTL,
        consumed_at: None,
        wrong_guesses: 0,
    };
    *slot = Some(token.clone());
    token
}

/// FR-020: the device ID is deliberately not consulted. It is a filter for the registry
/// (feat-014), never the thing that establishes trust — only the token does that.
pub fn authorize(
    slot: &mut Option<PairingToken>,
    hello: &HelloHandshake,
    now: OffsetDateTime,
) -> Result<Authorized, PairingNack> {
    let Some(presented) = hello.pairing_token.as_deref().filter(|t| !t.is_empty()) else {
        return Err(PairingNack::expired_token(
            "No pairing token. Scan the QR or enter the pairing code — a device ID alone never pairs.",
        ));
    };
    let active = slot.as_mut().ok_or_else(|| {
        PairingNack::expired_token("That pairing token is no longer valid. Refresh the QR code.")
    })?;

    if active.consumed_at.is_some() || now >= active.expires_at {
        *slot = None;
        return Err(PairingNack::expired_token(
            "That pairing token was already used or has expired. Refresh the QR code.",
        ));
    }
    if active.token != presented {
        active.wrong_guesses += 1;
        if active.wrong_guesses >= MAX_WRONG_GUESSES {
            *slot = None;
        }
        return Err(PairingNack::expired_token(
            "That pairing code does not match. Refresh the QR code and try again.",
        ));
    }

    active.consumed_at = Some(now);
    Ok(Authorized {
        device_id: hello.device_id.clone(),
        reconnect_credential: format!("{:016x}{:016x}", rand::random::<u64>(), rand::random::<u64>()),
    })
}

/// The address the device dials. ponytail: a connectionless UDP socket is the no-dependency way to
/// learn which local interface routes outward — nothing is sent. Loopback if there is no route,
/// which is honest: an unrouted desktop cannot be paired with over the LAN either.
pub fn local_ws_url(port: u16) -> String {
    let host = UdpSocket::bind("0.0.0.0:0")
        .and_then(|socket| {
            socket.connect("8.8.8.8:80")?;
            socket.local_addr()
        })
        .map(|addr| addr.ip())
        .unwrap_or(IpAddr::V4(Ipv4Addr::LOCALHOST));
    format!("ws://{host}:{port}")
}

pub fn invite(token: &PairingToken) -> Result<PairingInvite, String> {
    // research R4: the QR carries ws_url + token + contract_version, so a scan needs no typing
    // and no manual IP entry (FR-016).
    let payload = serde_json::json!({
        "ws_url": token.ws_url,
        "token": token.token,
        "contract_version": CONTRACT_VERSION,
    })
    .to_string();
    let code = qrcode::QrCode::new(payload).map_err(|e| format!("Could not encode the QR: {e}"))?;

    Ok(PairingInvite {
        token: token.token.clone(),
        ws_url: token.ws_url.clone(),
        contract_version: CONTRACT_VERSION,
        expires_at: token.expires_at,
        qr_size: code.width(),
        qr_modules: code
            .to_colors()
            .into_iter()
            .map(|color| color == qrcode::Color::Dark)
            .collect(),
    })
}

#[tauri::command]
pub fn mint_pairing_invite(state: tauri::State<'_, PairingState>) -> Result<PairingInvite, String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    let token = mint(&mut slot, local_ws_url(WS_PORT), OffsetDateTime::now_utc());
    invite(&token)
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::format_description::well_known::Rfc3339;

    fn at(value: &str) -> OffsetDateTime {
        OffsetDateTime::parse(value, &Rfc3339).unwrap()
    }

    fn hello(device_id: &str, token: Option<&str>) -> HelloHandshake {
        HelloHandshake {
            contract_version: CONTRACT_VERSION.into(),
            capabilities: Vec::new(),
            device_id: device_id.into(),
            pairing_token: token.map(str::to_owned),
            reconnect_credential: None,
        }
    }

    // FR-020a
    #[test]
    fn a_token_pairs_once_and_never_again() {
        let now = at("2026-08-06T10:00:00Z");
        let mut slot = None;
        let token = mint(&mut slot, "ws://10.0.0.4:8787".into(), now);

        let paired = authorize(&mut slot, &hello("dev-1", Some(&token.token)), now).unwrap();
        assert_eq!(paired.device_id, "dev-1");
        assert!(!paired.reconnect_credential.is_empty());

        let reused = authorize(&mut slot, &hello("dev-1", Some(&token.token)), now).unwrap_err();
        assert_eq!(reused.reason, "expired_token");
    }

    // FR-020a
    #[test]
    fn a_token_expires_five_minutes_after_issue() {
        let now = at("2026-08-06T10:00:00Z");
        let mut slot = None;
        let token = mint(&mut slot, "ws://10.0.0.4:8787".into(), now);
        assert_eq!(token.expires_at, at("2026-08-06T10:05:00Z"));

        let one_tick_early = authorize(
            &mut slot,
            &hello("dev-1", Some(&token.token)),
            at("2026-08-06T10:04:59Z"),
        );
        assert!(one_tick_early.is_ok());

        let mut slot = None;
        let token = mint(&mut slot, "ws://10.0.0.4:8787".into(), now);
        let expired = authorize(
            &mut slot,
            &hello("dev-1", Some(&token.token)),
            at("2026-08-06T10:05:00Z"),
        )
        .unwrap_err();
        assert_eq!(expired.reason, "expired_token");
        assert!(slot.is_none(), "an expired token must not linger");
    }

    // FR-020a — refresh mints a new token and invalidates the previous one.
    #[test]
    fn refreshing_invalidates_the_previous_token() {
        let now = at("2026-08-06T10:00:00Z");
        let mut slot = None;
        let first = mint(&mut slot, "ws://10.0.0.4:8787".into(), now);
        let second = mint(&mut slot, "ws://10.0.0.4:8787".into(), now);
        assert_ne!(first.token, second.token);

        let stale = authorize(&mut slot, &hello("dev-1", Some(&first.token)), now).unwrap_err();
        assert_eq!(stale.reason, "expired_token");
        // The refresh is still usable — only the previous one died.
        assert!(authorize(&mut slot, &hello("dev-1", Some(&second.token)), now).is_ok());
    }

    // FR-020: the device ID filters, it never authenticates.
    #[test]
    fn an_unknown_device_id_pairs_with_a_token_and_no_device_id_pairs_without_one() {
        let now = at("2026-08-06T10:00:00Z");
        let mut slot = None;
        let token = mint(&mut slot, "ws://10.0.0.4:8787".into(), now);

        assert!(authorize(&mut slot, &hello("never-seen-before", Some(&token.token)), now).is_ok());

        let mut slot = None;
        mint(&mut slot, "ws://10.0.0.4:8787".into(), now);
        let no_token = authorize(&mut slot, &hello("never-seen-before", None), now).unwrap_err();
        assert_eq!(no_token.reason, "expired_token");
        assert!(no_token.message.contains("device ID alone never pairs"));
    }

    #[test]
    fn repeated_wrong_codes_burn_the_token() {
        let now = at("2026-08-06T10:00:00Z");
        let mut slot = None;
        let token = mint(&mut slot, "ws://10.0.0.4:8787".into(), now);

        for _ in 0..MAX_WRONG_GUESSES {
            assert!(authorize(&mut slot, &hello("dev-1", Some("000000000")), now).is_err());
        }
        assert!(slot.is_none());
        assert!(authorize(&mut slot, &hello("dev-1", Some(&token.token)), now).is_err());
    }

    #[test]
    fn the_qr_encodes_the_url_token_and_contract_version() {
        let mut slot = None;
        let token = mint(
            &mut slot,
            "ws://10.0.0.4:8787".into(),
            at("2026-08-06T10:00:00Z"),
        );
        let invite = invite(&token).unwrap();

        assert_eq!(invite.token.len(), 9);
        assert!(invite.token.bytes().all(|b| b.is_ascii_digit()));
        assert_eq!(invite.contract_version, CONTRACT_VERSION);
        assert_eq!(invite.qr_modules.len(), invite.qr_size * invite.qr_size);
        assert!(invite.qr_modules.iter().any(|dark| *dark));

        let nack = serde_json::to_value(PairingNack::expired_token("x")).unwrap();
        assert_eq!(nack["type"], "nack");
        assert_eq!(nack["reason"], "expired_token");
    }

    #[test]
    fn the_ws_url_is_a_dialable_lan_address() {
        let url = local_ws_url(WS_PORT);
        assert!(url.starts_with("ws://"), "{url}");
        assert!(url.ends_with(":8787"), "{url}");
    }
}
