use super::*;

#[derive(BorshDeserialize, BorshSerialize)]
#[borsh(crate = "near_sdk::borsh")]
struct CompactUpload {
    job_id: String,
    title: String,
    price: u128,
    source_bytes: u64,
    profile: u8,
    upload_key: [u8; 32],
    upload_duration: u32,
    device_key: [u8; 32],
    certificate: [u8; 32],
    device_duration: u32,
    issued: u64,
    lifetime: u32,
    block: u64,
    block_window: u8,
    key_version: u32,
    signature: [u8; 64],
}

pub(super) fn decode(message: &str, contract: &Contract, sender: &AccountId) -> TransferMessage {
    let encoded = message
        .strip_prefix("yt:u1:")
        .expect("Invalid compact upload");
    require!(encoded.len() <= 800, "Invalid compact upload");
    let bytes: Base64VecU8 =
        near_sdk::serde_json::from_value(near_sdk::serde_json::Value::String(encoded.into()))
            .expect("Invalid compact upload");
    require!(
        near_sdk::serde_json::to_value(&bytes).unwrap().as_str() == Some(encoded),
        "Invalid compact upload"
    );
    let data = CompactUpload::try_from_slice(&bytes.0).expect("Invalid compact upload");
    require!(
        !data.job_id.is_empty()
            && data.job_id.len() <= 128
            && data
                .job_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"._:-".contains(&b))
            && !data.title.trim().is_empty()
            && data.title.len() <= 200
            && data.price >= MIN_TICKET_PRICE_USDC
            && data.price < 100_000_000_000_000_000_000u128
            && data.source_bytes > 0
            && data.source_bytes <= 5_000_000_000
            && data.profile < 3
            && data.upload_duration > 0
            && data.device_duration as u64 == PLAYBACK_DEVICE_LIFETIME_MS
            && data.lifetime > 0
            && data.lifetime as u64 <= QUOTE_MAX_LIFETIME_MS
            && data.block_window as u64 == SPONSORED_UPLOAD_MAX_BLOCK_WINDOW
            && data.key_version > 0,
        "Invalid compact upload"
    );
    let key = |bytes: [u8; 32]| {
        String::from(
            &near_sdk::PublicKey::from_parts(near_sdk::CurveType::ED25519, bytes.to_vec()).unwrap(),
        )
    };
    // Wire IDs are immutable, independent of the currently active upload profile.
    let profile = [
        "96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77",
        "28ba12452dd2cc55e64baf73a3dbf665784eeb8fd87892163818513165bbd3b2",
        "a6751ecd819f080430d3bea4cab0d7b906cd729993c925ae16c676433fe65752",
    ][data.profile as usize];
    let request = PaidJobRequest {
        creator_id: sender.clone(),
        job_id: data.job_id,
        title: data.title,
        price_usdc: U128(data.price),
        expected_source_bytes: U128(data.source_bytes as u128),
        profile_id: PROFILE.into(),
        profile_config_sha256: profile.into(),
        upload_public_key: key(data.upload_key),
        upload_key_expires_at_ms: U64(data
            .issued
            .checked_add(data.upload_duration as u64)
            .expect("Invalid compact upload")),
    };
    let fee = upload_fee_usdc(request.expected_source_bytes.0);
    let mut quote = SponsoredUploadQuote {
        domain: "youtick.sponsored-upload-quote".into(),
        version: "1".into(),
        network: contract.network_id(),
        contract_id: env::current_account_id(),
        creator_id: sender.clone(),
        job_id: request.job_id.clone(),
        request_sha256: paid_job_request_sha256(&request),
        expected_source_bytes: request.expected_source_bytes,
        upload_fee_usdc: U128(fee),
        sponsor_fee_usdc: U128(SPONSORED_UPLOAD_FEE_USDC),
        total_fee_usdc: U128(fee + SPONSORED_UPLOAD_FEE_USDC),
        delegate_receiver_id: contract.usdc_contract_id(),
        delegate_method: "ft_transfer_call".into(),
        delegate_gas: U64(SPONSORED_UPLOAD_DELEGATE_GAS),
        delegate_deposit_yocto: U128(1),
        issued_at_ms: U64(data.issued),
        quote_block_height: U64(data.block),
        max_delegate_block_height: U64(data
            .block
            .checked_add(data.block_window as u64)
            .expect("Invalid compact upload")),
        expires_at_ms: U64(data
            .issued
            .checked_add(data.lifetime as u64)
            .expect("Invalid compact upload")),
        quote_key_version: data.key_version,
        quote_id: String::new(),
    };
    quote.quote_id = hex_sha256(canonical_sponsored_upload_quote_message(&quote).as_bytes());
    TransferMessage {
        action: Some("create_paid_job".into()),
        publication_id: None,
        job_id: Some(request.job_id),
        title: Some(request.title),
        price_usdc: Some(request.price_usdc),
        expected_source_bytes: Some(request.expected_source_bytes),
        profile_id: Some(request.profile_id),
        profile_config_sha256: Some(request.profile_config_sha256),
        upload_public_key: Some(request.upload_public_key),
        upload_key_expires_at_ms: Some(request.upload_key_expires_at_ms),
        sponsor_quote: Some(quote),
        sponsor_quote_signature: Some(Base64VecU8(data.signature.to_vec())),
        playback_session: Some(PlaybackSessionAuthorization {
            session_public_key: key(data.device_key),
            certificate_sha256: data
                .certificate
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect(),
            authorization_duration_ms: U64(data.device_duration as u64),
        }),
    }
}
