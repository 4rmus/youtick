use super::*;

#[near]
impl Contract {
    fn log_purchase(
        &mut self,
        buyer_id: AccountId,
        creator_id: AccountId,
        event_cid: String,
        token_id: String,
        price: u128,
        creator_amount: u128,
        commission_amount: u128,
        purchase_type: PurchaseType,
    ) {
        let log = PurchaseLog {
            buyer_id,
            creator_id,
            event_cid,
            token_id: token_id.clone(),
            price: U128(price),
            creator_amount: U128(creator_amount),
            commission_amount: U128(commission_amount),
            purchase_type,
            timestamp_ns: env::block_timestamp(),
        };

        let purchase_id = self.next_purchase_id;
        self.next_purchase_id += 1;

        env::log_str(&format!(
            "PurchaseLog #{}: buyer={}, creator={}, event={}, token={}, price={}, creator_share={}, commission={}",
            purchase_id, log.buyer_id, log.creator_id, log.event_cid, token_id, price, creator_amount, commission_amount
        ));
    }

    // ═══════════════════════════════════════════════════════════════
    // EVENT FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    #[payable]
    pub fn create_event(
        &mut self,
        encrypted_cid: String,
        title: String,
        description: String,
        price: U128,
        price_usd: Option<u128>,
        price_usdc: Option<U128>,
        access_mode: Option<String>,
        content_type: Option<String>,
    ) {
        self.assert_not_paused();
        let price_usdc = price_usdc.filter(|value| value.0 > 0);

        // Minimum price check (free events allowed, but paid events must be >= 0.001 NEAR)
        if price.0 > 0 {
            require!(
                price.0 >= MIN_TICKET_PRICE_YOCTO,
                "Price must be at least 0.001 NEAR"
            );
        }

        // Minimum USDC price check
        if let Some(usdc) = price_usdc {
            if usdc.0 > 0 {
                require!(
                    usdc.0 >= MIN_TICKET_PRICE_USDC,
                    "USDC price must be at least $0.50"
                );
            }
        }

        let deposit = env::attached_deposit();
        require!(
            deposit >= STORAGE_COST_ACCOUNT,
            "Requires at least 0.1 NEAR deposit to create an event"
        );

        // SECURITY: Prevent overwriting existing events
        require!(
            self.events.get(&encrypted_cid).is_none(),
            "Event with this CID already exists"
        );

        // SECURITY: Only owner can create ACCESS_PASS events (universal access)
        require!(
            encrypted_cid != "ACCESS_PASS" || env::predecessor_account_id() == self.tokens.owner_id,
            "Only owner can create ACCESS_PASS events"
        );

        let price_near = if price.0 > 0 { Some(price) } else { None };
        let has_paid_price = price_near.is_some() || price_usdc.is_some();
        let normalized_access_mode = self.normalize_access_mode(access_mode, has_paid_price);

        let parsed_content_type = match content_type.as_deref() {
            Some("Concert") => ContentType::Concert,
            Some("Cinema") => ContentType::Cinema,
            Some("Exclusive") => ContentType::Exclusive,
            Some("LiveEvent") => ContentType::LiveEvent,
            Some("Documentary") => ContentType::Documentary,
            Some("ShortFilm") => ContentType::ShortFilm,
            Some("FestivalSelection") => ContentType::FestivalSelection,
            _ => ContentType::Exclusive,
        };

        let event = Event {
            title,
            description,
            price,
            price_usdc,
            price_near,
            creator_id: env::predecessor_account_id(),
            created_at: env::block_timestamp(),
            content_type: parsed_content_type,
        };

        self.events.insert(&encrypted_cid, &event);
        self.store_event_access_mode(&encrypted_cid, normalized_access_mode);

        // Increment active event counter for O(1) get_events_count
        self.active_event_count = self.active_event_count.saturating_add(1);

        // Store USD price in separate map (backward-compatible)
        if let Some(usd) = price_usd {
            self.lazy_event_price_usd().insert(&encrypted_cid, &usd);
        }

        // Store USDC price in separate map (V12)
        if let Some(usdc) = price_usdc {
            self.events_price_usdc.insert(&encrypted_cid, &usdc);
        }

        events::emit_event_created(
            encrypted_cid.clone(),
            event.title.clone(),
            event.creator_id.clone(),
            event.price.0.to_string(),
            price_usdc.map(|p| p.0.to_string()),
            price_near.map(|p| p.0.to_string()),
            None, // max_tickets: not yet implemented in Event struct
        );
    }

    pub fn get_events(
        &self,
        from_index: Option<U128>,
        limit: Option<u64>,
        content_type: Option<String>,
    ) -> Vec<(String, EventResponse)> {
        let banned = self.lazy_banned_events();
        let type_filter = content_type.as_ref().and_then(|ct| parse_content_type(ct));
        self.events
            .iter()
            .filter(|(cid, event)| {
                if banned.get(cid).is_some() {
                    return false;
                }
                if let Some(filter) = type_filter {
                    if event.content_type != filter {
                        return false;
                    }
                }
                true
            })
            .skip(from_index.map(|v| v.0 as usize).unwrap_or(0))
            .take(limit.unwrap_or(50) as usize)
            .map(|(cid, event)| {
                let resp = self.build_event_response(&cid, &event);
                (cid.clone(), resp)
            })
            .collect()
    }

    /// Cursor-based paginated event listing.
    /// - `cursor`: CID to start after (None = start from beginning)
    /// - `limit`: max items to return (default 50, capped at 100)
    pub fn get_events_paginated(
        &self,
        cursor: Option<String>,
        limit: Option<u64>,
        content_type: Option<String>,
    ) -> PaginatedEventsResponse {
        let limit = limit.unwrap_or(50).min(100) as usize;
        let banned = self.lazy_banned_events();
        let type_filter = content_type.as_ref().and_then(|ct| parse_content_type(ct));
        let total_count = match type_filter {
            Some(filter) => self
                .events
                .iter()
                .filter(|(cid, event)| banned.get(cid).is_none() && event.content_type == filter)
                .count() as u64,
            None => self.active_event_count,
        };

        // Build an iterator that skips past the cursor if provided
        let mut iter = self.events.iter();
        if let Some(ref cursor_cid) = cursor {
            // Advance iterator until we find the cursor CID, then skip it
            let mut found = false;
            for (cid, _) in iter.by_ref() {
                if cid == *cursor_cid {
                    found = true;
                    break;
                }
            }
            if !found {
                // Cursor not found — return empty result
                return PaginatedEventsResponse {
                    events: Vec::new(),
                    next_cursor: None,
                    total_count,
                };
            }
        }

        // Collect limit + 1 non-banned items so we can determine if there's a next page
        let items: Vec<(String, Event)> = iter
            .filter(|(cid, event)| {
                if banned.get(cid).is_some() {
                    return false;
                }
                match type_filter {
                    Some(filter) => event.content_type == filter,
                    None => true,
                }
            })
            .take(limit + 1)
            .collect();
        let has_more = items.len() > limit;
        let page_items = if has_more {
            &items[..limit]
        } else {
            &items[..]
        };

        let events: Vec<(String, EventResponse)> = page_items
            .iter()
            .map(|(cid, event)| {
                let resp = self.build_event_response(cid, event);
                (cid.clone(), resp)
            })
            .collect();

        let next_cursor = if has_more {
            events.last().map(|(cid, _)| cid.clone())
        } else {
            None
        };

        PaginatedEventsResponse {
            events,
            next_cursor,
            total_count,
        }
    }

    /// Returns the total number of non-banned events in O(1).
    pub fn get_events_count(&self) -> u64 {
        self.active_event_count
    }

    pub fn get_event(&self, encrypted_cid: String) -> Option<EventResponse> {
        self.events
            .get(&encrypted_cid)
            .map(|event| self.build_event_response(&encrypted_cid, &event))
    }

    /// Create an event using prepaid funds (Callable via Session Key)
    pub fn create_event_prepaid(
        &mut self,
        encrypted_cid: String,
        title: String,
        description: String,
        price: U128,
        price_usd: Option<u128>,
        price_usdc: Option<U128>,
        access_mode: Option<String>,
        content_type: Option<String>,
    ) {
        self.assert_not_paused();
        let price_usdc = price_usdc.filter(|value| value.0 > 0);

        // Minimum price check (free events allowed, but paid events must be >= 0.001 NEAR)
        if price.0 > 0 {
            require!(
                price.0 >= MIN_TICKET_PRICE_YOCTO,
                "Price must be at least 0.001 NEAR"
            );
        }

        // Minimum USDC price check
        if let Some(usdc) = price_usdc {
            if usdc.0 > 0 {
                require!(
                    usdc.0 >= MIN_TICKET_PRICE_USDC,
                    "USDC price must be at least $0.50"
                );
            }
        }

        // SECURITY: Prevent overwriting existing events
        require!(
            self.events.get(&encrypted_cid).is_none(),
            "Event with this CID already exists"
        );

        // SECURITY: Only owner can create ACCESS_PASS events (universal access)
        require!(
            encrypted_cid != "ACCESS_PASS" || env::predecessor_account_id() == self.tokens.owner_id,
            "Only owner can create ACCESS_PASS events"
        );

        let price_near = if price.0 > 0 { Some(price) } else { None };
        let has_paid_price = price_near.is_some() || price_usdc.is_some();
        let normalized_access_mode = self.normalize_access_mode(access_mode, has_paid_price);

        let account_id = env::predecessor_account_id();
        let session_public_key = self.use_upload_session(
            UploadSessionStatus::AwaitingEvent,
            UploadSessionStatus::Completed,
            STORAGE_COST_ACCOUNT,
        );

        let parsed_content_type = match content_type.as_deref() {
            Some("Concert") => ContentType::Concert,
            Some("Cinema") => ContentType::Cinema,
            Some("Exclusive") => ContentType::Exclusive,
            Some("LiveEvent") => ContentType::LiveEvent,
            Some("Documentary") => ContentType::Documentary,
            Some("ShortFilm") => ContentType::ShortFilm,
            Some("FestivalSelection") => ContentType::FestivalSelection,
            _ => ContentType::Exclusive,
        };

        // Execute creation
        let event = Event {
            title,
            description,
            price,
            price_usdc,
            price_near,
            creator_id: account_id,
            created_at: env::block_timestamp(),
            content_type: parsed_content_type,
        };

        self.events.insert(&encrypted_cid, &event);
        self.store_event_access_mode(&encrypted_cid, normalized_access_mode);

        // Increment active event counter for O(1) get_events_count
        self.active_event_count = self.active_event_count.saturating_add(1);

        // Store USD price in separate map (backward-compatible)
        if let Some(usd) = price_usd {
            self.lazy_event_price_usd().insert(&encrypted_cid, &usd);
        }

        // Store USDC price in separate map (V12)
        if let Some(usdc) = price_usdc {
            self.events_price_usdc.insert(&encrypted_cid, &usdc);
        }

        self.close_upload_session(&session_public_key, UploadSessionStatus::Completed);
    }

    #[payable]
    pub fn create_upload_session(
        &mut self,
        public_key: PublicKey,
        budget_yocto: U128,
        ttl_ms: u64,
    ) {
        self.assert_not_paused();
        let attached_deposit = env::attached_deposit();
        let minimum_budget = Self::minimum_upload_session_budget();

        require!(
            attached_deposit.as_yoctonear() == budget_yocto.0,
            "Attached deposit must exactly match session budget"
        );
        require!(
            attached_deposit >= minimum_budget,
            "Upload session budget must cover mint and event creation"
        );
        require!(ttl_ms > 0, "Upload session TTL must be greater than zero");
        require!(
            ttl_ms <= UPLOAD_SESSION_MAX_TTL_MS,
            "Upload session TTL exceeds the maximum allowed window"
        );
        require!(
            self.lazy_upload_sessions().get(&public_key).is_none(),
            "Upload session already exists for this public key"
        );

        let session = UploadSession {
            owner_id: env::predecessor_account_id(),
            remaining_budget: budget_yocto,
            remaining_calls: UPLOAD_SESSION_TOTAL_CALLS,
            expires_at_ms: Self::current_time_ms().saturating_add(ttl_ms),
            status: UploadSessionStatus::AwaitingMint,
        };

        self.lazy_upload_sessions().insert(&public_key, &session);
    }

    pub fn revoke_upload_session(&mut self, public_key: PublicKey) {
        self.assert_not_paused();
        let session = self
            .lazy_upload_sessions()
            .get(&public_key)
            .expect("Upload session not found");

        require!(
            session.owner_id == env::predecessor_account_id(),
            "Only the upload session owner can revoke it"
        );

        self.close_upload_session(&public_key, UploadSessionStatus::Revoked);
    }

    pub fn get_upload_session(&self, public_key: PublicKey) -> Option<UploadSession> {
        self.view_upload_session(&public_key)
    }

    /// Purchase a ticket (mint NFT) for an event
    /// - Free tickets (price=0): Contract pays storage, user pays nothing
    /// - Paid tickets: 2% commission to contract, 98% to creator
    ///
    /// IMPORTANT: This function keeps deposits in contract balance and only
    /// explicitly transfers to creator. No automatic refund to buyer.
    #[payable]
    pub fn buy_ticket(&mut self, receiver_id: AccountId, encrypted_cid: String) -> Token {
        self.assert_not_paused();
        let maybe_event = self.events.get(&encrypted_cid);
        require!(maybe_event.is_some(), "Event not found");
        let event = maybe_event.unwrap();
        self.assert_event_not_banned(&encrypted_cid);
        self.assert_near_purchase_available(&encrypted_cid, &event);

        let deposit = env::attached_deposit();
        let required_price = NearToken::from_yoctonear(Self::event_near_price(&event).0);
        let is_free = required_price.as_yoctonear() == 0;

        // Storage cost for NFT (safe upper bound)
        let storage_cost = STORAGE_COST_NFT;

        // Track amounts for purchase log
        let mut creator_amount: u128 = 0;
        let mut commission: u128 = 0;

        if !is_free {
            let min_deposit = required_price.saturating_add(storage_cost);
            require!(
                deposit >= min_deposit,
                &format!(
                    "Insufficient deposit. Required: {} yoctoNEAR (price) + {} (storage)",
                    required_price.as_yoctonear(),
                    storage_cost.as_yoctonear()
                )
            );

            // Calculate and apply commission (2% platform, 98% creator)
            let (ca, cm) = self.apply_commission(required_price);
            creator_amount = ca;
            commission = cm;

            // Transfer 98% to creator
            // Note: The rest (storage + any excess) stays in contract
            if creator_amount > 0 {
                Promise::new(event.creator_id.clone())
                    .transfer(NearToken::from_yoctonear(creator_amount))
                    .as_return();
            }

            // Refund excess deposit to buyer
            let total_used = required_price.saturating_add(storage_cost);
            if deposit > total_used {
                let refund = deposit.saturating_sub(total_used);
                Promise::new(env::predecessor_account_id())
                    .transfer(refund)
                    .as_return();
            }
        } else {
            // Free ticket - just require minimal storage (or contract pays)
            require!(deposit >= storage_cost, "Insufficient deposit for storage");
        }

        // Mint the NFT using helper
        let token =
            self.internal_mint_ticket(receiver_id.clone(), &event, encrypted_cid.clone(), false);

        // Log purchase for audit trail
        let purchase_type = if is_free {
            PurchaseType::Free
        } else {
            PurchaseType::Direct
        };
        self.log_purchase(
            env::predecessor_account_id(),
            event.creator_id.clone(),
            encrypted_cid.clone(),
            token.token_id.clone(),
            required_price.as_yoctonear(),
            creator_amount,
            commission,
            purchase_type,
        );

        events::emit_nft_purchased(
            token.token_id.clone(),
            receiver_id.clone(),
            Some(encrypted_cid.clone()),
            if is_free {
                None
            } else {
                Some(required_price.as_yoctonear().to_string())
            },
            self.event_usdc_price(&encrypted_cid, &event)
                .map(|p| p.0.to_string()),
        );

        token
    }

    /// Internal buy ticket function - called via cross-contract call with deposit
    #[payable]
    #[private]
    pub fn buy_ticket_internal(&mut self, receiver_id: AccountId, encrypted_cid: String) -> Token {
        let maybe_event = self.events.get(&encrypted_cid);
        require!(maybe_event.is_some(), "Event not found");
        let event = maybe_event.unwrap();
        self.assert_event_not_banned(&encrypted_cid);
        self.assert_near_purchase_available(&encrypted_cid, &event);

        let price_yoctonear = Self::event_near_price(&event).0;

        // Mint the NFT using helper (storage paid by attached deposit from contract)
        let token =
            self.internal_mint_ticket(receiver_id.clone(), &event, encrypted_cid.clone(), false);

        events::emit_nft_purchased(
            token.token_id.clone(),
            receiver_id.clone(),
            Some(encrypted_cid.clone()),
            Some(price_yoctonear.to_string()),
            self.event_usdc_price(&encrypted_cid, &event)
                .map(|p| p.0.to_string()),
        );

        token
    }

    // ═══════════════════════════════════════════════════════════════
    // COMMISSION HELPER
    // ═══════════════════════════════════════════════════════════════

    /// Calculate commission split: 2% total (50% trial pool, 50% commission pool)
    /// Returns (creator_amount, commission_total)
    fn apply_commission(&mut self, price: NearToken) -> (u128, u128) {
        let price_yocto = price.as_yoctonear();
        let commission = price_yocto * COMMISSION_RATE_PERCENT / COMMISSION_DENOMINATOR;
        let creator_amount = price_yocto - commission;

        // Split commission: 50% to trial pool, 50% to commission pool
        let trial_share = commission / COMMISSION_SPLIT_DENOMINATOR;
        let commission_share = commission - trial_share;
        self.trial_pool = self
            .trial_pool
            .saturating_add(NearToken::from_yoctonear(trial_share));
        self.commission_pool = self
            .commission_pool
            .saturating_add(NearToken::from_yoctonear(commission_share));

        (creator_amount, commission)
    }

    /// Calculate commission split for USDC (6 decimals): 2% total (50% trial pool, 50% commission pool)
    /// Returns (creator_amount, commission_total)
    fn apply_commission_usdc(&mut self, price_usdc: u128) -> (u128, u128) {
        let commission = price_usdc * COMMISSION_RATE_PERCENT / COMMISSION_DENOMINATOR;
        let creator_amount = price_usdc - commission;
        (creator_amount, commission)
    }

    /// Distribute USDC commission into pools
    fn distribute_commission_usdc(&mut self, commission: u128) {
        let trial_share = commission / COMMISSION_SPLIT_DENOMINATOR;
        let commission_share = commission - trial_share;
        self.trial_pool_usdc = self.trial_pool_usdc.saturating_add(trial_share);
        self.commission_pool_usdc = self.commission_pool_usdc.saturating_add(commission_share);
    }

    // ═══════════════════════════════════════════════════════════════
    // MINTING FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// Internal helper to mint a ticket NFT
    /// Consolidates duplicated minting logic across buy_ticket, claim_gift, etc.
    pub(crate) fn internal_mint_ticket(
        &mut self,
        receiver_id: AccountId,
        event: &Event,
        event_cid: String,
        is_gift: bool,
    ) -> Token {
        let token_id = self.next_token_id.to_string();
        self.next_token_id += 1;

        let video_metadata = VideoMetadata {
            encrypted_cid: event_cid.clone(),
            duration_seconds: 0,
            event_date: Some(event.created_at),
            content_type: ContentType::Exclusive,
            nova_group_id: None,
            storage_type: StorageType::Kms,
        };
        self.video_metadata.insert(&token_id, &video_metadata);
        self.add_token_to_cid_index(&event_cid, &token_id);

        let description = if is_gift {
            format!("Gift ticket: {}", event.description)
        } else {
            event.description.clone()
        };

        let token_metadata = TokenMetadata {
            title: Some(event.title.clone()),
            description: Some(description),
            media: None,
            media_hash: None,
            copies: Some(1),
            issued_at: None,
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: None,
            reference: None,
            reference_hash: None,
        };

        self.tokens
            .internal_mint(token_id.clone(), receiver_id, Some(token_metadata))
    }

    /// Mint a new video NFT ticket
    /// SECURITY: Only contract owner can directly mint NFTs via timelock
    #[payable]
    pub fn nft_mint(
        &mut self,
        receiver_id: AccountId,
        token_metadata: TokenMetadata,
        video_metadata: VideoMetadata,
    ) -> Token {
        self.assert_owner();
        self.nft_mint_timelocked(receiver_id, token_metadata, video_metadata)
    }

    pub(crate) fn nft_mint_timelocked(
        &mut self,
        receiver_id: AccountId,
        token_metadata: TokenMetadata,
        video_metadata: VideoMetadata,
    ) -> Token {
        self.assert_not_paused();

        // SECURITY: Require minimum deposit
        require!(
            env::attached_deposit() >= NearToken::from_yoctonear(1),
            "Requires attached deposit of at least 1 yoctoNEAR"
        );

        let token_id = self.next_token_id.to_string();
        self.next_token_id += 1;

        self.video_metadata.insert(&token_id, &video_metadata);

        self.tokens
            .internal_mint(token_id.clone(), receiver_id, Some(token_metadata))
    }

    // ═══════════════════════════════════════════════════════════════
    // wNEAR DIRECT PURCHASE (Single-popup stablecoin flow)
    // ═══════════════════════════════════════════════════════════════

    /// NEP-141 ft_on_transfer — called by wrap.near when someone sends wNEAR
    /// via ft_transfer_call to this contract.
    ///
    /// This enables a single-wallet-popup purchase flow for stablecoin payments:
    /// User swaps USDC→wNEAR via 1Click, then sends wNEAR to this contract.
    /// The contract unwraps wNEAR to native NEAR and processes the ticket purchase.
    ///
    /// msg format: {"action":"buy_ticket","buyer_id":"alice.near","encrypted_cid":"Qm..."}
    ///
    /// Returns "0" (all tokens used) on success, or the full amount (refund) on failure.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.assert_not_paused();

        // Reentrancy guard
        require!(!self.ft_transfer_lock, "Reentrant call detected");
        self.ft_transfer_lock = true;

        let nonce = self.next_swap_nonce;
        self.next_swap_nonce = self.next_swap_nonce.wrapping_add(1);

        let predecessor = env::predecessor_account_id();
        let wrap_account = wrap_near_account_id();

        env::log_str(&format!(
            "ft_on_transfer nonce={} sender={} token={} amount={} msg={}",
            nonce, sender_id, predecessor, amount.0, msg
        ));

        // Route to appropriate handler based on token contract
        let result = if predecessor == wrap_account {
            self.process_wnear_transfer(sender_id, amount, msg, nonce)
        } else if predecessor == usdt_contract_id() || predecessor == usdc_contract_id() {
            self.process_stablecoin_transfer(sender_id, amount, msg, &predecessor, nonce)
        } else {
            env::panic_str("Unsupported token. Only wNEAR, USDC, and USDT are accepted.");
        };

        self.ft_transfer_lock = false;
        result
    }

    /// Handle wNEAR transfers (legacy path)
    fn process_wnear_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
        _nonce: u64,
    ) -> PromiseOrValue<U128> {
        // Parse the message
        let parsed: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(&msg).unwrap_or_else(|_| {
            env::panic_str("Invalid JSON message. Expected: {\"action\":\"buy_ticket\",\"buyer_id\":\"...\",\"encrypted_cid\":\"...\"}");
        });

        let action = parsed.get("action").and_then(|v| v.as_str()).unwrap_or("");
        require!(
            action == "buy_ticket",
            "Unknown action. Only 'buy_ticket' is supported."
        );

        let buyer_id: AccountId = parsed
            .get("buyer_id")
            .and_then(|v| v.as_str())
            .unwrap_or_else(|| env::panic_str("Missing buyer_id"))
            .parse()
            .unwrap_or_else(|_| env::panic_str("Invalid buyer_id"));

        let encrypted_cid = parsed
            .get("encrypted_cid")
            .and_then(|v| v.as_str())
            .unwrap_or_else(|| env::panic_str("Missing encrypted_cid"))
            .to_string();

        // SECURITY: sender_id must match buyer_id (prevent buying for others without consent)
        require!(sender_id == buyer_id, "sender_id must match buyer_id");

        // Verify event exists and get pricing
        let event = self
            .events
            .get(&encrypted_cid)
            .unwrap_or_else(|| env::panic_str("Event not found"));
        self.assert_event_not_banned(&encrypted_cid);
        self.assert_near_purchase_available(&encrypted_cid, &event);

        let required_price = NearToken::from_yoctonear(Self::event_near_price(&event).0);
        let storage_cost = STORAGE_COST_NFT;
        let is_free = required_price.as_yoctonear() == 0;

        if is_free {
            // Free tickets don't need wNEAR — refund everything
            return PromiseOrValue::Value(amount); // Refund all
        }

        // Check wNEAR amount covers price + storage
        let total_cost = required_price.saturating_add(storage_cost);

        let received = NearToken::from_yoctonear(amount.0);
        require!(
            received >= total_cost,
            &format!(
                "Insufficient wNEAR. Need {} yocto (price {} + storage {}), got {}",
                total_cost.as_yoctonear(),
                required_price.as_yoctonear(),
                storage_cost.as_yoctonear(),
                received.as_yoctonear()
            )
        );

        // Unwrap ALL received wNEAR to native NEAR, then process purchase in callback.
        PromiseOrValue::Promise(
            Promise::new(wrap_near_account_id())
                .function_call(
                    "near_withdraw".to_string(),
                    near_sdk::serde_json::json!({ "amount": amount.0.to_string() })
                        .to_string()
                        .into_bytes(),
                    NearToken::from_yoctonear(1),
                    near_sdk::Gas::from_tgas(10),
                )
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(near_sdk::Gas::from_tgas(100))
                        .on_wnear_unwrap_for_purchase(buyer_id, encrypted_cid, amount),
                ),
        )
    }

    /// Handle USDC/USDT transfers (new USDC-native path)
    fn process_stablecoin_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
        token_contract: &AccountId,
        nonce: u64,
    ) -> PromiseOrValue<U128> {
        let parsed: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(&msg).unwrap_or_else(|_| {
            env::panic_str("Invalid JSON message. Expected: {\"action\":\"buy_ticket\",\"buyer_id\":\"...\",\"encrypted_cid\":\"...\"}");
        });

        let action = parsed.get("action").and_then(|v| v.as_str()).unwrap_or("");
        require!(
            action == "buy_ticket",
            "Unknown action. Only 'buy_ticket' is supported."
        );

        let buyer_id: AccountId = parsed
            .get("buyer_id")
            .and_then(|v| v.as_str())
            .unwrap_or_else(|| env::panic_str("Missing buyer_id"))
            .parse()
            .unwrap_or_else(|_| env::panic_str("Invalid buyer_id"));

        let encrypted_cid = parsed
            .get("encrypted_cid")
            .and_then(|v| v.as_str())
            .unwrap_or_else(|| env::panic_str("Missing encrypted_cid"))
            .to_string();
        let payment_id = parsed
            .get("payment_id")
            .and_then(|v| v.as_str())
            .map(|value| value.to_string());

        // SECURITY: sender_id must match buyer_id
        require!(sender_id == buyer_id, "sender_id must match buyer_id");

        let event = self
            .events
            .get(&encrypted_cid)
            .unwrap_or_else(|| env::panic_str("Event not found"));
        self.assert_event_not_banned(&encrypted_cid);

        let price_usdc = self
            .event_usdc_price(&encrypted_cid, &event)
            .unwrap_or(U128(0));
        let required_price = price_usdc.0;
        let is_free = required_price == 0;

        if is_free {
            return PromiseOrValue::Value(amount); // Refund all
        }

        require!(
            amount.0 >= required_price,
            &format!(
                "Insufficient {}. Need {} (price {}), got {}",
                if token_contract == &usdc_contract_id() {
                    "USDC"
                } else {
                    "USDT"
                },
                required_price,
                required_price,
                amount.0
            )
        );
        let payment_id = payment_id.unwrap_or_else(|| env::panic_str("payment_id is required"));
        let payment_key = format!("{}:{}:{}", token_contract, sender_id, payment_id);
        let mut settled_payments = self.lazy_settled_stablecoin_payments();
        require!(
            !settled_payments.contains(&payment_key),
            "Stablecoin payment already settled"
        );
        settled_payments.insert(&payment_key);

        // Apply commission on the required price (not the full amount — excess is refunded)
        let (creator_amount, commission) = self.apply_commission_usdc(required_price);

        // V1 keeps creator payouts as withdrawable balances. This avoids minting
        // an NFT based on an async creator transfer that may later fail.
        self.add_stablecoin_creator_balance(token_contract, &event.creator_id, creator_amount);
        if token_contract == &usdc_contract_id() {
            self.distribute_commission_usdc(commission);
        } else {
            self.add_stablecoin_commission_balance(token_contract, commission);
        }

        // Mint NFT
        let token =
            self.internal_mint_ticket(buyer_id.clone(), &event, encrypted_cid.clone(), false);

        events::emit_nft_purchased(
            token.token_id.clone(),
            buyer_id.clone(),
            Some(encrypted_cid.clone()),
            None, // price_yoctonear — stablecoin purchase, no NEAR price
            Some(price_usdc.0.to_string()),
        );

        // Log purchase for audit trail (parity with wNEAR path)
        self.log_purchase(
            buyer_id.clone(),
            event.creator_id.clone(),
            encrypted_cid.clone(),
            token.token_id,
            required_price,
            creator_amount,
            commission,
            PurchaseType::Direct,
        );

        // Refund excess if any
        let refund = amount.0.saturating_sub(required_price);
        if refund > 0 {
            Promise::new(token_contract.clone()).function_call(
                "ft_transfer".to_string(),
                near_sdk::serde_json::json!({
                    "receiver_id": sender_id,
                    "amount": refund.to_string()
                })
                .to_string()
                .into_bytes(),
                NearToken::from_yoctonear(1),
                near_sdk::Gas::from_tgas(10),
            );
        }

        env::log_str(&format!(
            "stablecoin_purchase_complete nonce={} buyer={} event={} token={} amount={} refund={}",
            nonce, sender_id, encrypted_cid, token_contract, amount.0, refund
        ));

        PromiseOrValue::Value(U128(0))
    }

    /// Callback after wNEAR unwrap completes.
    /// Native NEAR has arrived in the contract's balance.
    /// Now process the ticket purchase: split payments, mint NFT.
    #[private]
    pub fn on_wnear_unwrap_for_purchase(
        &mut self,
        buyer_id: AccountId,
        encrypted_cid: String,
        wnear_amount: U128,
    ) -> U128 {
        // Verify unwrap succeeded
        #[allow(deprecated)]
        let succeeded = matches!(
            env::promise_result(0),
            near_sdk::PromiseResult::Successful(_)
        );

        if !succeeded {
            // Unwrap failed — the wNEAR was NOT burned, so wrap.near will handle
            // the refund via ft_resolve_transfer (returns the full amount).
            env::panic_str("wNEAR unwrap failed — tokens will be refunded by wrap.near");
        }

        // Native NEAR is now in the contract's balance.
        // Mint first so funds do not leave the contract before entitlement exists.
        let event = self
            .events
            .get(&encrypted_cid)
            .unwrap_or_else(|| env::panic_str("Event not found"));
        self.assert_event_not_banned(&encrypted_cid);
        self.assert_near_purchase_available(&encrypted_cid, &event);

        let required_price = NearToken::from_yoctonear(Self::event_near_price(&event).0);
        let storage_cost = STORAGE_COST_NFT;
        let token =
            self.internal_mint_ticket(buyer_id.clone(), &event, encrypted_cid.clone(), false);

        // Calculate and apply commission (2% platform, 98% creator)
        let (creator_amount, commission) = self.apply_commission(required_price);

        // Transfer 98% to creator
        if creator_amount > 0 {
            Promise::new(event.creator_id.clone())
                .transfer(NearToken::from_yoctonear(creator_amount))
                .as_return();
        }

        // Refund excess to buyer (unwrapped NEAR minus total cost)
        let total_used = required_price.saturating_add(storage_cost);
        let received = NearToken::from_yoctonear(wnear_amount.0);
        if received > total_used {
            let refund = received.saturating_sub(total_used);
            Promise::new(buyer_id.clone()).transfer(refund).as_return();
        }

        // Log purchase for audit trail
        let price_yocto = required_price.as_yoctonear();
        self.log_purchase(
            buyer_id.clone(),
            event.creator_id.clone(),
            encrypted_cid.clone(),
            token.token_id,
            price_yocto,
            creator_amount,
            commission,
            PurchaseType::Direct,
        );

        // Return "0" to ft_resolve_transfer → all wNEAR was used (no refund needed)
        U128(0)
    }

    /// Mint NFT using pre-paid funds (Callable via Session Key)
    ///
    /// Deducts storage cost from user's prepaid balance, then mints via
    /// a #[private] internal function (not nft_mint which has an owner guard).
    /// Includes a callback to refund the user if the mint fails.
    pub fn nft_mint_prepaid(
        &mut self,
        receiver_id: AccountId,
        token_metadata: TokenMetadata,
        video_metadata: VideoMetadata,
    ) -> Promise {
        self.assert_not_paused();
        let account_id = env::predecessor_account_id();
        let session_public_key = self.use_upload_session(
            UploadSessionStatus::AwaitingMint,
            UploadSessionStatus::AwaitingEvent,
            STORAGE_COST_ACCOUNT,
        );

        // Call #[private] internal mint (NOT nft_mint which has owner guard)
        // Then callback to verify success and refund on failure
        Self::ext(env::current_account_id())
            .with_attached_deposit(STORAGE_COST_ACCOUNT)
            .with_static_gas(near_sdk::Gas::from_tgas(60))
            .nft_mint_internal(receiver_id, token_metadata, video_metadata)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(near_sdk::Gas::from_tgas(10))
                    .on_nft_mint_prepaid_callback(
                        account_id,
                        session_public_key,
                        U128(STORAGE_COST_ACCOUNT.as_yoctonear()),
                    ),
            )
    }

    /// Internal NFT mint - called via cross-contract call from nft_mint_prepaid
    /// Uses #[private] instead of owner guard so the contract can call itself
    #[payable]
    #[private]
    pub fn nft_mint_internal(
        &mut self,
        receiver_id: AccountId,
        token_metadata: TokenMetadata,
        video_metadata: VideoMetadata,
    ) -> Token {
        let token_id = self.next_token_id.to_string();
        self.next_token_id += 1;

        self.video_metadata.insert(&token_id, &video_metadata);
        self.add_token_to_cid_index(&video_metadata.encrypted_cid, &token_id);

        self.tokens
            .internal_mint(token_id, receiver_id, Some(token_metadata))
    }

    /// Callback after nft_mint_prepaid XCC completes.
    /// Returns true on success, false on failure (session restored to AwaitingMint).
    /// The client MUST check this return value before calling create_event_prepaid.
    #[private]
    pub fn on_nft_mint_prepaid_callback(
        &mut self,
        account_id: AccountId,
        session_public_key: PublicKey,
        charge_amount: U128,
    ) -> bool {
        #[allow(deprecated)]
        let succeeded = matches!(
            env::promise_result(0),
            near_sdk::PromiseResult::Successful(_)
        );

        if !succeeded {
            let mut sessions = self.lazy_upload_sessions();
            if let Some(mut session) = sessions.get(&session_public_key) {
                if session.owner_id == account_id
                    && session.status == UploadSessionStatus::AwaitingEvent
                {
                    session.remaining_budget =
                        U128(session.remaining_budget.0.saturating_add(charge_amount.0));
                    session.remaining_calls = session.remaining_calls.saturating_add(1);
                    session.status = UploadSessionStatus::AwaitingMint;
                    sessions.insert(&session_public_key, &session);
                }
            }
            env::log_str(&format!(
                "Upload session mint FAILED - restored {} to {}",
                charge_amount.0, account_id
            ));
        }

        succeeded
    }

    // ═══════════════════════════════════════════════════════════════
    // SPONSORED TRIAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════
}
