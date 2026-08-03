use std::{env, net::Ipv4Addr, sync::Mutex, time::Duration};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::{rngs::OsRng, RngCore};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    time::timeout,
};
use url::Url;

const AUTHORIZE_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const CALLBACK_TIMEOUT: Duration = Duration::from_secs(300);
const MAX_CALLBACK_BYTES: usize = 8 * 1024;

pub struct AuthState(Mutex<AuthStatus>);

enum AuthStatus {
    SignedOut,
    SigningIn,
    Authorized(GoogleIdentityProof),
}

pub struct GoogleIdentityProof {
    pub id_token: String,
    pub nonce: String,
}

impl Default for AuthState {
    fn default() -> Self {
        Self(Mutex::new(AuthStatus::SignedOut))
    }
}

impl AuthState {
    fn begin(&self) -> Result<(), String> {
        let mut status = self
            .0
            .lock()
            .map_err(|_| "Authentication state is unavailable")?;
        if matches!(*status, AuthStatus::SigningIn) {
            return Err("A Google sign-in is already in progress".into());
        }
        *status = AuthStatus::SigningIn;
        Ok(())
    }

    fn finish(&self, result: Result<GoogleIdentityProof, String>) -> Result<(), String> {
        let mut status = self
            .0
            .lock()
            .map_err(|_| "Authentication state is unavailable")?;
        match result {
            Ok(proof) => {
                *status = AuthStatus::Authorized(proof);
                Ok(())
            }
            Err(error) => {
                *status = AuthStatus::SignedOut;
                Err(error)
            }
        }
    }

    pub fn take_identity_proof(&self) -> Result<Option<GoogleIdentityProof>, String> {
        let mut status = self
            .0
            .lock()
            .map_err(|_| "Authentication state is unavailable")?;
        if matches!(*status, AuthStatus::Authorized(_)) {
            let AuthStatus::Authorized(proof) =
                std::mem::replace(&mut *status, AuthStatus::SignedOut)
            else {
                unreachable!()
            };
            return Ok(Some(proof));
        }
        Ok(None)
    }
}

struct PkceRequest {
    verifier: String,
    challenge: String,
    state: String,
    nonce: String,
}

impl PkceRequest {
    fn generate() -> Self {
        let verifier = random_base64url();
        Self {
            challenge: pkce_challenge(&verifier),
            verifier,
            state: random_base64url(),
            nonce: random_base64url(),
        }
    }
}

#[derive(Deserialize)]
struct TokenResponse {
    id_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[tauri::command]
pub async fn sign_in_with_google(
    app: AppHandle,
    state: State<'_, AuthState>,
) -> Result<(), String> {
    state.begin()?;
    state.finish(authorize(&app).await)
}

async fn authorize(app: &AppHandle) -> Result<GoogleIdentityProof, String> {
    let client_id = env::var("GOOGLE_CLIENT_ID")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .ok_or("Google sign-in is not configured: GOOGLE_CLIENT_ID is missing")?;
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .await
        .map_err(|error| format!("Could not start the sign-in callback: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("Could not read the sign-in callback address: {error}"))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");
    let request = PkceRequest::generate();
    let authorize_url = build_authorize_url(&client_id, &redirect_uri, &request)?;

    app.opener()
        .open_url(authorize_url.as_str(), None::<&str>)
        .map_err(|error| format!("Could not open the system browser: {error}"))?;

    let code = receive_callback(listener, &request.state, CALLBACK_TIMEOUT).await?;
    let id_token = exchange_code(
        &client_id,
        &redirect_uri,
        &request.verifier,
        &code,
        TOKEN_URL,
    )
    .await?;
    Ok(GoogleIdentityProof {
        id_token,
        nonce: request.nonce,
    })
}

fn random_base64url() -> String {
    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn build_authorize_url(
    client_id: &str,
    redirect_uri: &str,
    request: &PkceRequest,
) -> Result<Url, String> {
    let mut url = Url::parse(AUTHORIZE_URL).map_err(|error| error.to_string())?;
    url.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", "openid email profile")
        .append_pair("code_challenge", &request.challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", &request.state)
        .append_pair("nonce", &request.nonce);
    Ok(url)
}

async fn receive_callback(
    listener: TcpListener,
    expected_state: &str,
    wait: Duration,
) -> Result<String, String> {
    let (mut stream, _) = timeout(wait, listener.accept())
        .await
        .map_err(|_| "Google sign-in timed out")?
        .map_err(|error| format!("Could not receive the sign-in callback: {error}"))?;
    let mut request = Vec::new();
    let mut chunk = [0_u8; 1024];

    loop {
        let count = stream
            .read(&mut chunk)
            .await
            .map_err(|error| format!("Could not read the sign-in callback: {error}"))?;
        if count == 0 {
            break;
        }
        request.extend_from_slice(&chunk[..count]);
        if request.len() > MAX_CALLBACK_BYTES {
            return Err("The sign-in callback was too large".into());
        }
        if request.windows(4).any(|window| window == b"\r\n\r\n") {
            break;
        }
    }

    let parsed = parse_callback(&request, expected_state);
    let (status, body) = if parsed.is_ok() {
        ("200 OK", "Sign-in complete. You can return to TestLab.")
    } else {
        (
            "400 Bad Request",
            "Sign-in could not be completed. Return to TestLab and try again.",
        )
    };
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream
        .write_all(response.as_bytes())
        .await
        .map_err(|error| format!("Could not finish the sign-in callback: {error}"))?;
    parsed
}

fn parse_callback(request: &[u8], expected_state: &str) -> Result<String, String> {
    let request = std::str::from_utf8(request).map_err(|_| "The sign-in callback was invalid")?;
    let line = request
        .lines()
        .next()
        .ok_or("The sign-in callback was empty")?;
    let mut parts = line.split_whitespace();
    if parts.next() != Some("GET") {
        return Err("The sign-in callback used an unsupported method".into());
    }
    let target = parts.next().ok_or("The sign-in callback had no target")?;
    let url = Url::parse(&format!("http://127.0.0.1{target}"))
        .map_err(|_| "The sign-in callback target was invalid")?;
    if url.path() != "/callback" {
        return Err("The sign-in callback path was invalid".into());
    }

    let mut state = None;
    let mut code = None;
    let mut oauth_error = None;
    for (key, value) in url.query_pairs() {
        let slot = match key.as_ref() {
            "state" => &mut state,
            "code" => &mut code,
            "error" => &mut oauth_error,
            _ => continue,
        };
        if slot.replace(value.into_owned()).is_some() {
            return Err(format!("The sign-in callback repeated {key}"));
        }
    }
    if state.as_deref() != Some(expected_state) {
        return Err("Google sign-in returned an invalid state".into());
    }
    if let Some(error) = oauth_error {
        return Err(format!("Google sign-in was not completed: {error}"));
    }
    code.filter(|value| !value.is_empty())
        .ok_or_else(|| "Google sign-in returned no authorization code".into())
}

async fn exchange_code(
    client_id: &str,
    redirect_uri: &str,
    verifier: &str,
    code: &str,
    token_url: &str,
) -> Result<String, String> {
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("Could not prepare the Google token exchange: {error}"))?
        .post(token_url)
        .form(&token_exchange_form(
            client_id,
            redirect_uri,
            verifier,
            code,
        ))
        .send()
        .await
        .map_err(|error| format!("Could not exchange the Google authorization code: {error}"))?;
    let status = response.status();
    let body: TokenResponse = response
        .json()
        .await
        .map_err(|error| format!("Google returned an invalid token response: {error}"))?;

    if !status.is_success() {
        let detail = body
            .error_description
            .or(body.error)
            .unwrap_or_else(|| status.to_string());
        return Err(format!("Google rejected the token exchange: {detail}"));
    }
    body.id_token
        .filter(|token| !token.is_empty())
        .ok_or_else(|| "Google returned no ID token".into())
}

fn token_exchange_form<'a>(
    client_id: &'a str,
    redirect_uri: &'a str,
    verifier: &'a str,
    code: &'a str,
) -> [(&'static str, &'a str); 5] {
    [
        ("client_id", client_id),
        ("code", code),
        ("code_verifier", verifier),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect_uri),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tokio::net::TcpStream;

    #[test]
    fn pkce_uses_the_rfc_7636_s256_vector() {
        assert_eq!(
            pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn authorize_url_has_native_pkce_parameters_and_no_secret() {
        let request = PkceRequest {
            verifier: "verifier".into(),
            challenge: "challenge".into(),
            state: "state".into(),
            nonce: "nonce".into(),
        };
        let url =
            build_authorize_url("client", "http://127.0.0.1:4321/callback", &request).unwrap();
        let query: HashMap<_, _> = url.query_pairs().into_owned().collect();

        assert_eq!(url.scheme(), "https");
        assert_eq!(
            query.get("redirect_uri").unwrap(),
            "http://127.0.0.1:4321/callback"
        );
        assert_eq!(query.get("code_challenge_method").unwrap(), "S256");
        assert_eq!(query.get("state").unwrap(), "state");
        assert_eq!(query.get("nonce").unwrap(), "nonce");
        assert!(!query.contains_key("client_secret"));
    }

    #[test]
    fn token_exchange_is_a_public_client_request() {
        let form = token_exchange_form("client", "redirect", "verifier", "code");
        let fields: HashMap<_, _> = form.into_iter().collect();

        assert_eq!(fields.get("code_verifier"), Some(&"verifier"));
        assert_eq!(fields.get("grant_type"), Some(&"authorization_code"));
        assert!(!fields.contains_key("client_secret"));
    }

    #[test]
    fn callback_rejects_invalid_state_and_duplicate_values() {
        let wrong_state = b"GET /callback?code=abc&state=wrong HTTP/1.1\r\n\r\n";
        assert!(parse_callback(wrong_state, "expected")
            .unwrap_err()
            .contains("invalid state"));

        let duplicate = b"GET /callback?code=abc&code=def&state=expected HTTP/1.1\r\n\r\n";
        assert!(parse_callback(duplicate, "expected")
            .unwrap_err()
            .contains("repeated code"));
    }

    #[tokio::test]
    async fn loopback_listener_accepts_one_valid_callback_and_closes() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let address = listener.local_addr().unwrap();
        assert_eq!(address.ip(), Ipv4Addr::LOCALHOST);

        let callback = receive_callback(listener, "expected", Duration::from_secs(1));
        let sender = async move {
            let mut stream = TcpStream::connect(address).await.unwrap();
            stream
                .write_all(
                    b"GET /callback?code=abc&state=expected HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n",
                )
                .await
                .unwrap();
        };
        let (code, _) = tokio::join!(callback, sender);
        assert_eq!(code.unwrap(), "abc");
    }

    #[test]
    fn auth_state_prevents_parallel_sign_ins_and_keeps_proof_in_rust() {
        let state = AuthState::default();
        state.begin().unwrap();
        assert!(state.begin().unwrap_err().contains("already in progress"));
        state
            .finish(Ok(GoogleIdentityProof {
                id_token: "id-token".into(),
                nonce: "nonce".into(),
            }))
            .unwrap();
        let proof = state.take_identity_proof().unwrap().unwrap();
        assert_eq!(proof.id_token, "id-token");
        assert_eq!(proof.nonce, "nonce");
    }
}
