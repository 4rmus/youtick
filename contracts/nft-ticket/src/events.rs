//! NEP-297 Event Emission Module
//!
//! Emits structured JSON events via `env::log_str` for on-chain event indexing.
//! Follows the NEP-297 standard: https://github.com/near/NEPs/blob/master/neps/nep-0297.md
//!
//! Event format:
//! - `standard`: "youtick"
//! - `version`: "1.0.0"
//! - `event`: event type (e.g., "nft_purchased")
//! - `data`: array of typed event data

use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, serde_json, AccountId};

// ============================================================================
// NEP-297 Standard Header
// ============================================================================

const NEP297_STANDARD: &str = "youtick";
const NEP297_VERSION: &str = "1.0.0";

// ============================================================================
// Event Types
// ============================================================================

/// Event emitted when an NFT ticket is purchased
#[derive(Serialize, Deserialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct NftPurchasedEvent {
    pub token_id: String,
    pub owner_id: AccountId,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_cid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price_yoctonear: Option<String>,
}

/// Event emitted when a gift drop is created
#[derive(Serialize, Deserialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct GiftDropCreatedEvent {
    pub event_cid: String,
    pub signer_pk: String,
    pub num_tickets: u64,
}

/// Event emitted when a gift is claimed
#[derive(Serialize, Deserialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct GiftClaimedEvent {
    pub token_id: String,
    pub receiver_id: AccountId,
    pub signer_pk: String,
}

/// Event emitted when a new event (VOD) is created
#[derive(Serialize, Deserialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct EventCreatedEvent {
    pub encrypted_cid: String,
    pub title: String,
    pub creator_id: AccountId,
    pub price_yoctonear: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tickets: Option<u64>,
}

// ============================================================================
// NEP-297 Event Envelope
// ============================================================================

/// Generic NEP-297 event envelope
#[derive(Serialize, Deserialize, Debug)]
#[serde(crate = "near_sdk::serde")]
struct Nep297Event<T> {
    standard: &'static str,
    version: &'static str,
    event: &'static str,
    data: Vec<T>,
}

// ============================================================================
// Emit Functions
// ============================================================================

/// Emit nft_purchased event
pub fn emit_nft_purchased(
    token_id: String,
    owner_id: AccountId,
    event_cid: Option<String>,
    price_yoctonear: Option<String>,
) {
    let event = Nep297Event {
        standard: NEP297_STANDARD,
        version: NEP297_VERSION,
        event: "nft_purchased",
        data: vec![NftPurchasedEvent {
            token_id,
            owner_id,
            event_cid,
            price_yoctonear,
        }],
    };
    env::log_str(&serde_json::to_string(&event).expect("Failed to serialize nft_purchased event"));
}

/// Emit gift_drop_created event
pub fn emit_gift_drop_created(event_cid: String, signer_pk: String, num_tickets: u64) {
    let event = Nep297Event {
        standard: NEP297_STANDARD,
        version: NEP297_VERSION,
        event: "gift_drop_created",
        data: vec![GiftDropCreatedEvent {
            event_cid,
            signer_pk,
            num_tickets,
        }],
    };
    env::log_str(
        &serde_json::to_string(&event).expect("Failed to serialize gift_drop_created event"),
    );
}

/// Emit gift_claimed event
pub fn emit_gift_claimed(token_id: String, receiver_id: AccountId, signer_pk: String) {
    let event = Nep297Event {
        standard: NEP297_STANDARD,
        version: NEP297_VERSION,
        event: "gift_claimed",
        data: vec![GiftClaimedEvent {
            token_id,
            receiver_id,
            signer_pk,
        }],
    };
    env::log_str(&serde_json::to_string(&event).expect("Failed to serialize gift_claimed event"));
}

/// Emit event_created event
pub fn emit_event_created(
    encrypted_cid: String,
    title: String,
    creator_id: AccountId,
    price_yoctonear: String,
    max_tickets: Option<u64>,
) {
    let event = Nep297Event {
        standard: NEP297_STANDARD,
        version: NEP297_VERSION,
        event: "event_created",
        data: vec![EventCreatedEvent {
            encrypted_cid,
            title,
            creator_id,
            price_yoctonear,
            max_tickets,
        }],
    };
    env::log_str(&serde_json::to_string(&event).expect("Failed to serialize event_created event"));
}
