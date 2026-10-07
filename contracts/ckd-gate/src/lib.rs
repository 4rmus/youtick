//! ckd-gate v2 (not audited): approval-free CKD root secret bound to a NEAR account.
//!
//! The near/mpc "developer contract" pattern. MPC binds the secret to (this contract, "v1/<account>");
//! this contract allows a request for an account only through one of three rules:
//!   (a) the fast-auth account of the login token equals the requested account,
//!   (b) the token's identity has been linked to that account (the account links it itself),
//!   (c) the caller is the account itself (predecessor).
//! Token checks: RS256 (keys read from the fast-auth Auth0 guard), alg, iss, aud contains client_id,
//! exp/nbf and nonce == b64url(sha256("ckd-gate|" + this contract + "|" + pk1 + "|" + pk2)).
//! The nonce binding means a captured token cannot be used with a different ephemeral key.
//! This contract pays the 1 yocto deposit. There is no owner, upgrade or migration path.
// The write-once #[init] configuration exceeds clippy's argument limit inside near-sdk generated code.
#![allow(clippy::too_many_arguments)]
use base64::Engine;
use base_jwt_guard::jwt::codec::{decode_base64_bytes, decode_jwt};
use base_jwt_guard::rsa::rs256::verify_signature_from_components;
use base_jwt_guard::JwtPublicKey;
use near_sdk::serde::Deserialize;
use near_sdk::serde_json::{self, json, Value};
// collections::LookupSet writes immediately, so storage cost can be measured inside the call.
use near_sdk::collections::LookupSet;
use near_sdk::{
    env, log, near, require, AccountId, CurveType, Gas, NearToken, PanicOnDefault, Promise,
    PromiseError, PublicKey,
};
use sha2::{Digest, Sha256};

const MAX_JWT_SIZE: usize = 7168;
const MAX_SUB_LEN: usize = 256;
const GET_KEYS_GAS: Gas = Gas::from_tgas(5);
const DERIVE_GAS: Gas = Gas::from_tgas(10);
const ON_TOKEN_GAS: Gas = Gas::from_tgas(60);
const MPC_GAS: Gas = Gas::from_tgas(20);
const ON_CKD_GAS: Gas = Gas::from_tgas(5);

#[near(serializers = [json])]
#[derive(Clone)]
pub struct AppPublicKeyPV {
    pub pk1: String,
    pub pk2: String,
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct Header {
    alg: String,
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct Claims {
    iss: String,
    sub: String,
    aud: Value,
    exp: u64,
    nbf: Option<u64>,
    nonce: Option<String>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct CkdGate {
    guard: AccountId,
    mpc: AccountId,
    fast_auth: AccountId,
    fast_auth_domain: u64,
    issuer: String,
    client_id: String,
    ckd_domain: u64,
    /// (identity hash, account): this identity may request this account's secret.
    links: LookupSet<(String, AccountId)>,
}

fn sha256_hex(input: &str) -> String {
    hex::encode(Sha256::digest(input.as_bytes()))
}

pub fn expected_nonce(gate: &AccountId, app: &AppPublicKeyPV) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(
        format!("ckd-gate|{gate}|{}|{}", app.pk1, app.pk2).as_bytes(),
    ))
}

/// Identity digest stored in link records instead of the raw `sub`.
pub fn identity_hash(issuer: &str, sub: &str) -> String {
    sha256_hex(&format!("ckd-gate-identity|{issuer}|{sub}"))
}

pub fn derivation_path(account: &AccountId) -> String {
    format!("v1/{account}")
}

/// fast-auth'un MPC path'i: `jwt#<iss>#<sub>` (fast-auth `fa/src/lib.rs`, `verify_sub`).
pub fn fast_auth_path(issuer: &str, sub: &str) -> String {
    format!("jwt#{issuer}#{sub}")
}

fn valid_sub(sub: &str) -> bool {
    !sub.is_empty() && sub.len() <= MAX_SUB_LEN && !sub.contains('#')
}

fn audience_matches(aud: &Value, expected: &str) -> bool {
    match aud {
        Value::String(s) => s == expected,
        Value::Array(a) => a.iter().any(|v| v.as_str() == Some(expected)),
        _ => false,
    }
}

/// Rule selection: no requested account or the token's own account is (a); anything else requires a link (b).
pub fn select_account(
    derived: AccountId,
    requested: Option<AccountId>,
    linked: impl FnOnce(&AccountId) -> bool,
) -> (AccountId, &'static str) {
    match requested {
        None => (derived, "a"),
        Some(a) if a == derived => (a, "a"),
        Some(a) => {
            require!(
                linked(&a),
                "identity is not linked to the requested account"
            );
            (a, "b")
        }
    }
}

/// Reads sub from the unverified payload only to start the parallel calls; the callback does the real checks.
fn unverified_sub(jwt: &str, issuer: &str) -> String {
    let (_, p, _) = decode_jwt(jwt.to_string());
    let claims: Claims = serde_json::from_slice(&decode_base64_bytes(p))
        .unwrap_or_else(|_| env::panic_str("bad claims"));
    require!(claims.iss == issuer, "bad issuer");
    require!(valid_sub(&claims.sub), "bad sub");
    claims.sub
}

/// Fully verifies the token and returns sub; panics on any failure.
pub fn verify_token(
    jwt: &str,
    keys: &[JwtPublicKey],
    issuer: &str,
    client_id: &str,
    nonce: &str,
    now_s: u64,
) -> String {
    require!(jwt.len() <= MAX_JWT_SIZE, "jwt too large");
    let (h, p, s) = decode_jwt(jwt.to_string());
    require!(
        !h.is_empty() && !p.is_empty() && !s.is_empty(),
        "malformed jwt"
    );
    let header: Header = serde_json::from_slice(&decode_base64_bytes(h.clone()))
        .unwrap_or_else(|_| env::panic_str("bad header"));
    require!(header.alg == "RS256", "unsupported alg");
    let signed = format!("{h}.{p}");
    let sig = decode_base64_bytes(s);
    require!(
        keys.iter().any(|k| verify_signature_from_components(
            signed.clone(),
            sig.clone(),
            k.n.clone(),
            k.e.clone()
        )),
        "bad signature"
    );
    let claims: Claims = serde_json::from_slice(&decode_base64_bytes(p))
        .unwrap_or_else(|_| env::panic_str("bad claims"));
    require!(claims.iss == issuer, "bad issuer");
    require!(audience_matches(&claims.aud, client_id), "bad audience");
    require!(claims.exp > now_s, "token expired");
    require!(claims.nbf.unwrap_or(0) <= now_s, "token not yet valid");
    require!(
        claims.nonce.as_deref() == Some(nonce),
        "nonce does not bind app key"
    );
    require!(valid_sub(&claims.sub), "bad sub");
    claims.sub
}

fn implicit_account(derived: &str) -> AccountId {
    let pk: PublicKey = derived
        .parse()
        .unwrap_or_else(|_| env::panic_str("bad derived key"));
    require!(
        pk.curve_type() == CurveType::ED25519,
        "derived key is not ed25519"
    );
    hex::encode(&pk.as_bytes()[1..]).parse().unwrap()
}

#[near]
impl CkdGate {
    #[init]
    pub fn new(
        guard: AccountId,
        mpc: AccountId,
        fast_auth: AccountId,
        fast_auth_domain: u64,
        issuer: String,
        client_id: String,
        ckd_domain: u64,
    ) -> Self {
        Self {
            guard,
            mpc,
            fast_auth,
            fast_auth_domain,
            issuer,
            client_id,
            ckd_domain,
            links: LookupSet::new(b"l"),
        }
    }

    pub fn config(&self) -> Value {
        json!({ "guard": self.guard, "mpc": self.mpc, "fast_auth": self.fast_auth, "fast_auth_domain": self.fast_auth_domain,
            "issuer": self.issuer, "client_id": self.client_id, "ckd_domain": self.ckd_domain })
    }

    pub fn is_linked(&self, identity_hash: String, account_id: AccountId) -> bool {
        self.links.contains(&(identity_hash, account_id))
    }

    /// (a)/(b): permissionless; gas from the caller (usually a relayer), deposit from this contract.
    pub fn request_key(
        &mut self,
        jwt: String,
        app_public_key: AppPublicKeyPV,
        account_id: Option<AccountId>,
    ) -> Promise {
        require!(jwt.len() <= MAX_JWT_SIZE, "jwt too large");
        let sub = unverified_sub(&jwt, &self.issuer);
        let keys = Promise::new(self.guard.clone()).function_call(
            "get_public_keys".to_string(),
            b"{}".to_vec(),
            NearToken::from_yoctonear(0),
            GET_KEYS_GAS,
        );
        let derive = Promise::new(self.mpc.clone()).function_call(
            "derived_public_key".to_string(),
            serde_json::to_vec(
                &json!({ "path": fast_auth_path(&self.issuer, &sub), "predecessor": self.fast_auth,
                "domain_id": self.fast_auth_domain }),
            )
            .unwrap(),
            NearToken::from_yoctonear(0),
            DERIVE_GAS,
        );
        keys.and(derive).then(
            Self::ext(env::current_account_id())
                .with_static_gas(ON_TOKEN_GAS)
                .on_token(jwt, app_public_key, account_id),
        )
    }

    /// (c): the account itself (full access key or a function-call key scoped to this contract).
    pub fn request_key_as_account(&mut self, app_public_key: AppPublicKeyPV) -> Promise {
        let account = env::predecessor_account_id();
        log!("ckd-gate: rule=c account={}", account);
        self.request_ckd(account, app_public_key)
    }

    /// The caller allows the given identity to request its secret. The caller pays for storage.
    #[payable]
    pub fn link_identity(&mut self, identity_hash: String) {
        require!(
            identity_hash.len() == 64
                && identity_hash
                    .bytes()
                    .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()),
            "bad identity hash"
        );
        let account = env::predecessor_account_id();
        let before = env::storage_usage();
        let inserted = self.links.insert(&(identity_hash, account.clone()));
        let cost = env::storage_byte_cost()
            .saturating_mul((env::storage_usage().saturating_sub(before)) as u128);
        let deposit = env::attached_deposit();
        require!(deposit >= cost, "attach deposit for storage");
        if inserted {
            log!("ckd-gate: linked account={}", account);
        }
        let refund = deposit.saturating_sub(cost);
        if !refund.is_zero() {
            let _ = Promise::new(account).transfer(refund);
        }
    }

    pub fn unlink_identity(&mut self, identity_hash: String) {
        let account = env::predecessor_account_id();
        let before = env::storage_usage();
        if self.links.remove(&(identity_hash, account.clone())) {
            let freed = env::storage_byte_cost()
                .saturating_mul((before.saturating_sub(env::storage_usage())) as u128);
            log!("ckd-gate: unlinked account={}", account);
            if !freed.is_zero() {
                let _ = Promise::new(account).transfer(freed);
            }
        }
    }

    #[private]
    pub fn on_token(
        &mut self,
        jwt: String,
        app_public_key: AppPublicKeyPV,
        account_id: Option<AccountId>,
        #[callback_result] keys: Result<Vec<JwtPublicKey>, PromiseError>,
        #[callback_result] derived: Result<String, PromiseError>,
    ) -> Promise {
        let keys = keys.unwrap_or_else(|_| env::panic_str("guard keys unavailable"));
        let derived =
            derived.unwrap_or_else(|_| env::panic_str("fast-auth key derivation unavailable"));
        let nonce = expected_nonce(&env::current_account_id(), &app_public_key);
        let sub = verify_token(
            &jwt,
            &keys,
            &self.issuer,
            &self.client_id,
            &nonce,
            env::block_timestamp_ms() / 1000,
        );
        let identity = identity_hash(&self.issuer, &sub);
        let (account, rule) = select_account(implicit_account(&derived), account_id, |a| {
            self.links.contains(&(identity.clone(), a.clone()))
        });
        log!("ckd-gate: rule={} account={}", rule, account);
        self.request_ckd(account, app_public_key)
    }

    #[private]
    pub fn on_ckd(
        &mut self,
        account_id: AccountId,
        #[callback_result] response: Result<Value, PromiseError>,
    ) -> Value {
        let response = response.unwrap_or_else(|_| env::panic_str("ckd request failed"));
        json!({ "account_id": account_id, "derivation_path": derivation_path(&account_id), "response": response })
    }
}

impl CkdGate {
    fn request_ckd(&self, account: AccountId, app: AppPublicKeyPV) -> Promise {
        let args = json!({ "request": {
            "derivation_path": derivation_path(&account),
            "domain_id": self.ckd_domain,
            "app_public_key": { "AppPublicKeyPV": { "pk1": app.pk1, "pk2": app.pk2 } },
        } });
        Promise::new(self.mpc.clone())
            .function_call(
                "request_app_private_key".to_string(),
                serde_json::to_vec(&args).unwrap(),
                NearToken::from_yoctonear(1),
                MPC_GAS,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(ON_CKD_GAS)
                    .on_ckd(account),
            )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;
    use rsa::pkcs1v15::SigningKey;
    use rsa::signature::{SignatureEncoding, Signer};
    use rsa::traits::PublicKeyParts;
    use rsa::RsaPrivateKey;

    const ISS: &str = "https://login.testnet.fast-auth.com/";
    const CLIENT: &str = "client-1";

    fn b64(v: &[u8]) -> String {
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(v)
    }

    struct Issuer {
        key: RsaPrivateKey,
    }
    impl Issuer {
        fn new() -> Self {
            let mut rng = rand::thread_rng();
            Self {
                key: RsaPrivateKey::new(&mut rng, 2048).unwrap(),
            }
        }
        fn public(&self) -> JwtPublicKey {
            let p = self.key.to_public_key();
            JwtPublicKey {
                n: p.n().to_bytes_be(),
                e: p.e().to_bytes_be(),
            }
        }
        fn token(&self, header: Value, claims: Value) -> String {
            let signing = format!(
                "{}.{}",
                b64(header.to_string().as_bytes()),
                b64(claims.to_string().as_bytes())
            );
            let sig = SigningKey::<rsa::sha2::Sha256>::new(self.key.clone())
                .sign(signing.as_bytes())
                .to_vec();
            format!("{signing}.{}", b64(&sig))
        }
    }

    fn app() -> AppPublicKeyPV {
        AppPublicKeyPV {
            pk1: "bls12381g1:a".into(),
            pk2: "bls12381g2:b".into(),
        }
    }
    fn gate() -> AccountId {
        "gate.testnet".parse().unwrap()
    }
    fn claims(nonce: &str) -> Value {
        json!({ "iss": ISS, "sub": "google-oauth2|123", "aud": CLIENT, "exp": 2_000, "nbf": 0, "nonce": nonce })
    }
    fn check(issuer: &Issuer, header: Value, claims: Value) -> String {
        let jwt = issuer.token(header, claims);
        verify_token(
            &jwt,
            &[issuer.public()],
            ISS,
            CLIENT,
            &expected_nonce(&gate(), &app()),
            1_000,
        )
    }

    #[test]
    fn valid_token_returns_sub() {
        let i = Issuer::new();
        assert_eq!(
            check(
                &i,
                json!({"alg": "RS256"}),
                claims(&expected_nonce(&gate(), &app()))
            ),
            "google-oauth2|123"
        );
    }

    #[test]
    #[should_panic(expected = "nonce does not bind app key")]
    fn token_for_another_app_key_is_rejected() {
        let i = Issuer::new();
        let other = AppPublicKeyPV {
            pk1: "bls12381g1:x".into(),
            pk2: "bls12381g2:y".into(),
        };
        check(
            &i,
            json!({"alg": "RS256"}),
            claims(&expected_nonce(&gate(), &other)),
        );
    }

    #[test]
    #[should_panic(expected = "nonce does not bind app key")]
    fn token_for_another_gate_is_rejected() {
        let i = Issuer::new();
        check(
            &i,
            json!({"alg": "RS256"}),
            claims(&expected_nonce(&"other.testnet".parse().unwrap(), &app())),
        );
    }

    #[test]
    #[should_panic(expected = "bad signature")]
    fn token_from_another_key_is_rejected() {
        let signer = Issuer::new();
        let jwt = signer.token(
            json!({"alg": "RS256"}),
            claims(&expected_nonce(&gate(), &app())),
        );
        verify_token(
            &jwt,
            &[Issuer::new().public()],
            ISS,
            CLIENT,
            &expected_nonce(&gate(), &app()),
            1_000,
        );
    }

    #[test]
    #[should_panic(expected = "bad audience")]
    fn token_for_another_client_is_rejected() {
        let i = Issuer::new();
        let mut c = claims(&expected_nonce(&gate(), &app()));
        c["aud"] = json!("someone-else");
        check(&i, json!({"alg": "RS256"}), c);
    }

    #[test]
    #[should_panic(expected = "token expired")]
    fn expired_token_is_rejected() {
        let i = Issuer::new();
        let mut c = claims(&expected_nonce(&gate(), &app()));
        c["exp"] = json!(999);
        check(&i, json!({"alg": "RS256"}), c);
    }

    #[test]
    #[should_panic(expected = "unsupported alg")]
    fn non_rs256_header_is_rejected() {
        let i = Issuer::new();
        check(
            &i,
            json!({"alg": "none"}),
            claims(&expected_nonce(&gate(), &app())),
        );
    }

    #[test]
    #[should_panic(expected = "bad sub")]
    fn sub_with_separator_is_rejected() {
        let i = Issuer::new();
        let mut c = claims(&expected_nonce(&gate(), &app()));
        c["sub"] = json!("a#b");
        check(&i, json!({"alg": "RS256"}), c);
    }

    #[test]
    fn rule_selection() {
        let own: AccountId = "aa.testnet".parse().unwrap();
        let other: AccountId = "bb.testnet".parse().unwrap();
        assert_eq!(
            select_account(own.clone(), None, |_| false),
            (own.clone(), "a")
        );
        assert_eq!(
            select_account(own.clone(), Some(own.clone()), |_| false),
            (own.clone(), "a")
        );
        assert_eq!(
            select_account(own.clone(), Some(other.clone()), |_| true),
            (other, "b")
        );
    }

    #[test]
    #[should_panic(expected = "identity is not linked")]
    fn unlinked_account_is_rejected() {
        select_account(
            "aa.testnet".parse().unwrap(),
            Some("bb.testnet".parse().unwrap()),
            |_| false,
        );
    }

    #[test]
    fn implicit_account_from_derived_key() {
        // Synthetic key: sha256("ckd-gate synthetic test key").
        let acc = implicit_account("ed25519:8Jttjj6ziAUWHqqtbZcxcJyztYx2tRkMhueEuvqiu75Q");
        assert_eq!(
            acc.as_str(),
            "6c975b5231e78a1d84edb77701adef8c5e307a27162c5ca05c7f1cb70cd071c7"
        );
    }

    #[test]
    fn link_and_unlink() {
        let alice: AccountId = "alice.testnet".parse().unwrap();
        let id = identity_hash(ISS, "google-oauth2|123");
        let mut g = CkdGate::new(
            "g.testnet".parse().unwrap(),
            "m.testnet".parse().unwrap(),
            "fa.testnet".parse().unwrap(),
            1,
            ISS.into(),
            CLIENT.into(),
            2,
        );
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(alice.clone())
            .attached_deposit(NearToken::from_millinear(10))
            .build());
        g.link_identity(id.clone());
        assert!(g.is_linked(id.clone(), alice.clone()));
        assert!(!g.is_linked(id.clone(), "bob.testnet".parse().unwrap()));
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(alice.clone())
            .build());
        g.unlink_identity(id.clone());
        assert!(!g.is_linked(id, alice));
    }

    #[test]
    fn paths_and_hashes() {
        assert_eq!(
            derivation_path(&"abc.testnet".parse().unwrap()),
            "v1/abc.testnet"
        );
        assert_eq!(
            fast_auth_path(ISS, "s"),
            "jwt#https://login.testnet.fast-auth.com/#s"
        );
        assert_ne!(identity_hash(ISS, "s1"), identity_hash(ISS, "s2"));
        assert_eq!(identity_hash(ISS, "s1").len(), 64);
    }

    fn gate_contract() -> CkdGate {
        CkdGate::new(
            "g.testnet".parse().unwrap(),
            "m.testnet".parse().unwrap(),
            "fa.testnet".parse().unwrap(),
            1,
            ISS.into(),
            CLIENT.into(),
            2,
        )
    }

    #[test]
    #[should_panic(expected = "token not yet valid")]
    fn token_used_before_nbf_is_rejected() {
        let i = Issuer::new();
        let mut c = claims(&expected_nonce(&gate(), &app()));
        c["nbf"] = json!(1_001);
        check(&i, json!({"alg": "RS256"}), c);
    }

    #[test]
    #[should_panic(expected = "bad issuer")]
    fn token_from_another_issuer_is_rejected() {
        let i = Issuer::new();
        let mut c = claims(&expected_nonce(&gate(), &app()));
        c["iss"] = json!("https://evil.example/");
        check(&i, json!({"alg": "RS256"}), c);
    }

    #[test]
    fn audience_arrays_must_contain_the_client() {
        let i = Issuer::new();
        let mut c = claims(&expected_nonce(&gate(), &app()));
        c["aud"] = json!(["other", CLIENT]);
        assert_eq!(
            check(&i, json!({"alg": "RS256"}), c.clone()),
            "google-oauth2|123"
        );
        c["aud"] = json!(["other", "another"]);
        let outcome =
            std::panic::catch_unwind(|| check(&Issuer::new(), json!({"alg": "RS256"}), c));
        assert!(outcome.is_err());
    }

    #[test]
    #[should_panic(expected = "nonce does not bind app key")]
    fn token_without_nonce_is_rejected() {
        let i = Issuer::new();
        let mut c = claims(&expected_nonce(&gate(), &app()));
        c.as_object_mut().unwrap().remove("nonce");
        check(&i, json!({"alg": "RS256"}), c);
    }

    #[test]
    #[should_panic(expected = "bad signature")]
    fn tampered_payload_is_rejected() {
        let i = Issuer::new();
        let jwt = i.token(
            json!({"alg": "RS256"}),
            claims(&expected_nonce(&gate(), &app())),
        );
        let mut parts: Vec<String> = jwt.split('.').map(str::to_string).collect();
        let mut forged = claims(&expected_nonce(&gate(), &app()));
        forged["sub"] = json!("google-oauth2|999");
        parts[1] = b64(forged.to_string().as_bytes());
        verify_token(
            &parts.join("."),
            &[i.public()],
            ISS,
            CLIENT,
            &expected_nonce(&gate(), &app()),
            1_000,
        );
    }

    #[test]
    #[should_panic(expected = "jwt too large")]
    fn oversized_token_is_rejected() {
        let jwt = format!("a.{}.c", "b".repeat(MAX_JWT_SIZE));
        verify_token(
            &jwt,
            &[],
            ISS,
            CLIENT,
            &expected_nonce(&gate(), &app()),
            1_000,
        );
    }

    #[test]
    fn malformed_tokens_are_rejected() {
        for jwt in ["", "only-one-part", "a.b", "..", "a.b.c.d"] {
            let outcome = std::panic::catch_unwind(|| {
                verify_token(
                    jwt,
                    &[Issuer::new().public()],
                    ISS,
                    CLIENT,
                    &expected_nonce(&gate(), &app()),
                    1_000,
                )
            });
            assert!(outcome.is_err(), "{jwt:?} must be rejected");
        }
    }

    #[test]
    #[should_panic(expected = "attach deposit for storage")]
    fn linking_without_a_storage_deposit_fails() {
        let mut g = gate_contract();
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id("alice.testnet".parse().unwrap())
            .build());
        g.link_identity(identity_hash(ISS, "google-oauth2|123"));
    }

    #[test]
    #[should_panic(expected = "bad identity hash")]
    fn link_requires_a_lowercase_sha256_identity_hash() {
        let mut g = gate_contract();
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id("alice.testnet".parse().unwrap())
            .attached_deposit(NearToken::from_millinear(10))
            .build());
        g.link_identity(identity_hash(ISS, "s").to_uppercase());
    }

    #[test]
    fn relinking_costs_nothing_and_unlinking_a_missing_link_is_a_no_op() {
        let alice: AccountId = "alice.testnet".parse().unwrap();
        let id = identity_hash(ISS, "google-oauth2|123");
        let mut g = gate_contract();
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(alice.clone())
            .attached_deposit(NearToken::from_millinear(10))
            .build());
        g.link_identity(id.clone());
        // Already linked: no new storage, so no deposit is needed.
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(alice.clone())
            .build());
        g.link_identity(id.clone());
        assert!(g.is_linked(id.clone(), alice.clone()));
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id("bob.testnet".parse().unwrap())
            .build());
        g.unlink_identity(id.clone());
        assert!(g.is_linked(id, alice));
    }

    #[test]
    #[should_panic(expected = "guard keys unavailable")]
    fn failed_guard_key_read_fails_the_request() {
        let mut g = gate_contract();
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id("gate.testnet".parse().unwrap())
            .current_account_id("gate.testnet".parse().unwrap())
            .build());
        let _ = g.on_token(
            "a.b.c".into(),
            app(),
            None,
            Err(PromiseError::Failed),
            Ok("ed25519:8Jttjj6ziAUWHqqtbZcxcJyztYx2tRkMhueEuvqiu75Q".into()),
        );
    }

    #[test]
    #[should_panic(expected = "fast-auth key derivation unavailable")]
    fn failed_key_derivation_fails_the_request() {
        let mut g = gate_contract();
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id("gate.testnet".parse().unwrap())
            .current_account_id("gate.testnet".parse().unwrap())
            .build());
        let _ = g.on_token(
            "a.b.c".into(),
            app(),
            None,
            Ok(vec![]),
            Err(PromiseError::Failed),
        );
    }

    #[test]
    #[should_panic(expected = "ckd request failed")]
    fn failed_mpc_request_is_reported() {
        let mut g = gate_contract();
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id("gate.testnet".parse().unwrap())
            .current_account_id("gate.testnet".parse().unwrap())
            .build());
        g.on_ckd("alice.testnet".parse().unwrap(), Err(PromiseError::Failed));
    }
}
