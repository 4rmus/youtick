// Reference implementation and checker for protocol/youtick-market-v2.
// `node scripts/check-youtick-market-v2.mjs` rebuilds every vector from its fixed inputs and
// fails on any drift; `--write` regenerates golden-vectors.json. Test keys are derived from
// public labels and must never hold value.
import { createHash, createHmac, createPrivateKey, createPublicKey, hkdfSync, sign, verify } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const protocolDir = resolve(root, "protocol/youtick-market-v2");
const vectorsPath = resolve(protocolDir, "golden-vectors.json");
const schema = readJson(resolve(protocolDir, "schema.json"));

export const PROTOCOL = "youtick.market-v2.protocol.v1";
export const TICKET_SIGNATURE_DOMAIN = "youtick.market-v2.ticket-sig.v1";
export const VAT_DOMAIN = "youtick.market-v2.vat.v1";
export const PLAYBACK_DOMAIN = "youtick.market-v2.playback.v1";
export const ROOT_SALT = "youtick.market-v2.root.v1";
export const ROOT_INFO = "youtick.market-v2.ticket-root";
export const TICKET_INFO = "youtick.market-v2.ticket.v1";
export const MIN_GROSS_USDC_MICRO = 5_000_000n;
export const PLATFORM_DIVISOR = 20n;
export const MAX_VAT_RATE_BPS = 2_700n;
export const MAX_SIGNATURE_TTL_MS = 3_600_000n;
const U32_MAX = 0xffffffffn;
const U64_MAX = 0xffffffffffffffffn;
const U128_MAX = (1n << 128n) - 1n;

// Fields signed after `expires_at_ms`, in order, with their canonical type.
export const TICKET_FIELDS = {
  purchase_device: [["publication_id", "text"], ["session_public_key", "key"], ["certificate_sha256", "hex"]],
  card_purchase: [["publication_id", "text"], ["session_public_key", "key"], ["certificate_sha256", "hex"],
    ["payment_reference_hmac", "hex"], ["gross_minor", "u64"], ["currency", "currency"]],
  add_device: [["session_public_key", "key"], ["certificate_sha256", "hex"], ["device_epoch", "u32"]],
  revoke_device: [["session_public_key", "key"], ["device_epoch", "u32"]],
  refund_unwatched: [["refund_to", "text"]],
};
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// --- Key derivation -------------------------------------------------------------------------

export function deriveRootKey(ckdKey) {
  assert(ckdKey.length === 32, "CKD key must be 32 bytes");
  return Buffer.from(hkdfSync("sha256", ckdKey, Buffer.from(ROOT_SALT), Buffer.from(ROOT_INFO), 32));
}

export function deriveTicketSeed(rootKey, index) {
  assert(Number.isInteger(index) && index >= 0 && index <= 0xffffffff, "ticket index must be u32");
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(index);
  const info = Buffer.concat([Buffer.from(TICKET_INFO), counter]);
  return Buffer.from(hkdfSync("sha256", rootKey, Buffer.alloc(0), info, 32));
}

export function keyPairFromSeed(seed) {
  const privateKey = createPrivateKey({ key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]), format: "der", type: "pkcs8" });
  const publicKey = createPublicKey(privateKey).export({ format: "der", type: "spki" }).subarray(-32);
  return { privateKey, publicKey: Buffer.from(publicKey) };
}

export const nearPublicKey = (raw) => `ed25519:${base58(raw)}`;
export const ticketId = (rawPublicKey) => sha256Hex(rawPublicKey);

// --- Canonical messages ---------------------------------------------------------------------

export function ticketMessage({ network, contract_id, action, ticket_id, expires_at_ms, fields }) {
  const spec = TICKET_FIELDS[action];
  assert(spec, `unknown ticket action ${action}`);
  assert(/^[0-9a-f]{64}$/.test(ticket_id), "ticket_id must be lowercase SHA-256 hex");
  return lines([TICKET_SIGNATURE_DOMAIN, network, contract_id, action, ticket_id, decimal(expires_at_ms, U64_MAX),
    ...spec.map(([name, type]) => canonicalField(fields[name], type))]);
}

export function vatMessage({ network, contract_id, ticket_id, publication_id, gross_usdc_micro, vat_usdc_micro, expires_at_ms, key_version }) {
  splitAmounts(gross_usdc_micro, vat_usdc_micro);
  return lines([VAT_DOMAIN, network, contract_id, ticket_id, publication_id, decimal(gross_usdc_micro, U128_MAX),
    decimal(vat_usdc_micro, U128_MAX), decimal(expires_at_ms, U64_MAX), decimal(key_version, U32_MAX)]);
}

export function playbackMessage({ network, contract_id, ticket_id, session_public_key, origin, device_nonce, expires_at_ms }) {
  return lines([PLAYBACK_DOMAIN, network, contract_id, ticket_id, canonicalField(session_public_key, "key"), origin, device_nonce,
    decimal(expires_at_ms, U64_MAX)]);
}

// The whole gross amount stays in the ticket's escrow until it settles. On `mark_watched` or
// `release_expired`, VAT goes to the tax account, the platform share to the platform balance and
// the creator share to the creator. `refund_unwatched` returns the whole gross amount.
export function splitAmounts(gross, vat) {
  const grossValue = BigInt(decimal(gross, U128_MAX));
  const vatValue = BigInt(decimal(vat, U128_MAX));
  assert(grossValue >= MIN_GROSS_USDC_MICRO, "gross is below the 5 USDC minimum");
  assert(vatValue * (10_000n + MAX_VAT_RATE_BPS) <= grossValue * MAX_VAT_RATE_BPS, "VAT exceeds the maximum VAT-inclusive rate");
  const net = grossValue - vatValue;
  const platform = net / PLATFORM_DIVISOR;
  return { net_usdc_micro: `${net}`, platform_usdc_micro: `${platform}`, creator_usdc_micro: `${net - platform}` };
}

function canonicalField(value, type) {
  if (type === "u32") return decimal(value, U32_MAX);
  if (type === "u64") return decimal(value, U64_MAX);
  if (type === "hex") assert(typeof value === "string" && /^[0-9a-f]{64}$/.test(value), "hex fields must be lowercase SHA-256 hex");
  if (type === "currency") assert(typeof value === "string" && /^[A-Z]{3}$/.test(value), "currency must be an ISO 4217 code");
  if (type === "key") assert(typeof value === "string" && base58Decode(value.replace(/^ed25519:/, "")).length === 32
    && value === nearPublicKey(publicKeyRaw(value)), "public keys must be canonical ed25519 base58");
  return value;
}

function lines(values) {
  for (const value of values) {
    assert(typeof value === "string" && value.length > 0, "canonical fields must be non-empty strings");
    assert(!/[\n\r]/.test(value), "canonical fields must not contain line breaks");
  }
  return values.join("\n");
}

function decimal(value, max) {
  const text = typeof value === "bigint" || typeof value === "number" ? `${value}` : value;
  assert(typeof text === "string" && /^(0|[1-9][0-9]*)$/.test(text), "decimal must be a canonical unsigned integer");
  assert(BigInt(text) <= max, "decimal is out of range");
  return text;
}

// --- Fixture --------------------------------------------------------------------------------

const FIXTURE = {
  network: "testnet",
  contract_id: "market-v2.youtick.testnet",
  usdc_contract_id: "usdc.fakes.testnet",
  creator_id: "creator.testnet",
  buyer_id: "6f0c8e1d2a3b4c5d6e7f80919293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5",
  publication_id: "job-001",
  origin: "https://preview.youtick.net",
  certificate_sha256: sha256Hex("youtick.market-v2.test.certificate"),
  ckd_key_hex: sha256Hex("youtick.market-v2.test.ckd-key"),
  issued_at_ms: "1791360000000",
  gross_usdc_micro: "5000000",
  vat_usdc_micro: "833334",
  vat_key_version: "1",
  card_payment_reference: "cleeng-test-order-0001",
  payment_reference_key_hex: sha256Hex("youtick.market-v2.test.payment-reference-key"),
};

const testKey = (label) => keyPairFromSeed(createHash("sha256").update(`youtick.market-v2.test.${label}`).digest());
const signText = (text, privateKey) => sign(null, Buffer.from(text), privateKey).toString("base64");

export function buildVectors() {
  const expires = `${BigInt(FIXTURE.issued_at_ms) + 600_000n}`;
  const rootKey = deriveRootKey(Buffer.from(FIXTURE.ckd_key_hex, "hex"));
  const tickets = [0, 1, 2].map((index) => {
    const seed = deriveTicketSeed(rootKey, index);
    const { publicKey } = keyPairFromSeed(seed);
    return { index, seed_hex: seed.toString("hex"), public_key: nearPublicKey(publicKey), ticket_id: ticketId(publicKey) };
  });
  const cryptoKey = keyPairFromSeed(deriveTicketSeed(rootKey, 0));
  const cardKey = keyPairFromSeed(deriveTicketSeed(rootKey, 1));
  const [ticket, cardTicket] = tickets;
  const session = nearPublicKey(testKey("session").publicKey);
  const sessionKey = testKey("session");
  const secondSession = nearPublicKey(testKey("second-session").publicKey);
  const vatSigner = testKey("vat-signer");
  const paymentReferenceHmac = createHmac("sha256", Buffer.from(FIXTURE.payment_reference_key_hex, "hex"))
    .update(FIXTURE.card_payment_reference).digest("hex");

  const signTicket = (keyPair, publicKey, ticketIdValue, action, fields) => {
    const message = ticketMessage({ network: FIXTURE.network, contract_id: FIXTURE.contract_id, ticket_id: ticketIdValue,
      expires_at_ms: expires, action, fields });
    return { signer_public_key: publicKey, ticket_id: ticketIdValue, action, fields, message, signature: signText(message, keyPair.privateKey) };
  };
  const device = { session_public_key: session, certificate_sha256: FIXTURE.certificate_sha256 };
  const purchaseDevice = signTicket(cryptoKey, ticket.public_key, ticket.ticket_id, "purchase_device",
    { publication_id: FIXTURE.publication_id, ...device });
  const cardPurchase = signTicket(cardKey, cardTicket.public_key, cardTicket.ticket_id, "card_purchase", {
    publication_id: FIXTURE.publication_id, ...device, payment_reference_hmac: paymentReferenceHmac, gross_minor: "500", currency: "USD",
  });
  const addDevice = signTicket(cryptoKey, ticket.public_key, ticket.ticket_id, "add_device",
    { session_public_key: secondSession, certificate_sha256: FIXTURE.certificate_sha256, device_epoch: "0" });
  const revokeDevice = signTicket(cryptoKey, ticket.public_key, ticket.ticket_id, "revoke_device",
    { session_public_key: secondSession, device_epoch: "0" });
  const refund = signTicket(cryptoKey, ticket.public_key, ticket.ticket_id, "refund_unwatched", { refund_to: FIXTURE.buyer_id });

  const vatInput = {
    network: FIXTURE.network,
    contract_id: FIXTURE.contract_id,
    ticket_id: ticket.ticket_id,
    publication_id: FIXTURE.publication_id,
    gross_usdc_micro: FIXTURE.gross_usdc_micro,
    vat_usdc_micro: FIXTURE.vat_usdc_micro,
    expires_at_ms: expires,
    key_version: FIXTURE.vat_key_version,
  };
  const vatCanonical = vatMessage(vatInput);
  const vatSignature = signText(vatCanonical, vatSigner.privateKey);

  const signedDevice = (signature) => ({ ...device, expires_at_ms: expires, signature });
  const purchaseMsg = {
    action: "buy_ticket_v2",
    publication_id: FIXTURE.publication_id,
    ticket_public_key: ticket.public_key,
    device: signedDevice(purchaseDevice.signature),
    vat: { vat_usdc_micro: FIXTURE.vat_usdc_micro, expires_at_ms: expires, key_version: FIXTURE.vat_key_version, signature: vatSignature },
  };
  const split = splitAmounts(FIXTURE.gross_usdc_micro, FIXTURE.vat_usdc_micro);

  const playbackInput = {
    network: FIXTURE.network,
    contract_id: FIXTURE.contract_id,
    ticket_id: ticket.ticket_id,
    session_public_key: session,
    origin: FIXTURE.origin,
    device_nonce: sha256Hex("youtick.market-v2.test.device-nonce").slice(0, 32),
    expires_at_ms: `${BigInt(FIXTURE.issued_at_ms) + 120_000n}`,
  };
  const playbackCanonical = playbackMessage(playbackInput);

  return {
    protocol: PROTOCOL,
    fixture: FIXTURE,
    key_derivation: { ckd_key_hex: FIXTURE.ckd_key_hex, root_key_hex: rootKey.toString("hex"), tickets },
    ticket_signatures: {
      purchase_device: purchaseDevice,
      card_purchase: cardPurchase,
      add_device: addDevice,
      revoke_device: revokeDevice,
      refund_unwatched: refund,
    },
    vat_attestation: {
      signer_public_key: nearPublicKey(vatSigner.publicKey),
      input: vatInput,
      message: vatCanonical,
      signature: vatSignature,
      split,
    },
    purchase: {
      ft_transfer_call_args: { receiver_id: FIXTURE.contract_id, amount: FIXTURE.gross_usdc_micro, msg: JSON.stringify(purchaseMsg) },
      msg: purchaseMsg,
    },
    card_ticket: {
      issue_card_ticket_args: {
        ticket_public_key: cardTicket.public_key,
        publication_id: FIXTURE.publication_id,
        device: signedDevice(cardPurchase.signature),
        payment_reference_hmac: paymentReferenceHmac,
        gross_minor: "500",
        currency: "USD",
      },
      void_card_ticket_args: { ticket_id: cardTicket.ticket_id, reason: "chargeback" },
    },
    calls: {
      add_device_args: {
        ticket_id: ticket.ticket_id, session_public_key: secondSession, certificate_sha256: FIXTURE.certificate_sha256,
        device_epoch: "0", expires_at_ms: expires, signature: addDevice.signature,
      },
      revoke_device_args: {
        ticket_id: ticket.ticket_id, session_public_key: secondSession, device_epoch: "0", expires_at_ms: expires, signature: revokeDevice.signature,
      },
      platform_revoke_device_args: { ticket_id: ticket.ticket_id, session_public_key: secondSession },
      refund_unwatched_args: { ticket_id: ticket.ticket_id, refund_to: FIXTURE.buyer_id, expires_at_ms: expires, signature: refund.signature },
      mark_watched_args: { ticket_id: ticket.ticket_id },
      release_expired_args: { ticket_ids: [ticket.ticket_id] },
    },
    playback_request: {
      input: playbackInput,
      message: playbackCanonical,
      signature: signText(playbackCanonical, sessionKey.privateKey),
    },
    events: buildEvents({ ticket, cardTicket, split, paymentReferenceHmac, session, secondSession }),
    size_budget: sizeBudget(),
  };
}

function buildEvents({ ticket, cardTicket, split, paymentReferenceHmac, session, secondSession }) {
  const event = (name, data) => ({ standard: "youtick_market", version: "2.0.0", event: name, data: [data] });
  const deviceExpiry = `${BigInt(FIXTURE.issued_at_ms) + 2_592_000_000n}`;
  const settled = { vat_usdc_micro: FIXTURE.vat_usdc_micro, platform_usdc_micro: split.platform_usdc_micro, creator_usdc_micro: split.creator_usdc_micro };
  return {
    ticket_purchased: event("ticket_purchased", {
      ticket_id: ticket.ticket_id, publication_id: FIXTURE.publication_id, creator_id: FIXTURE.creator_id, rail: "crypto",
      asset: FIXTURE.usdc_contract_id, gross_usdc_micro: FIXTURE.gross_usdc_micro, vat_usdc_micro: FIXTURE.vat_usdc_micro, ...split,
      vat_key_version: FIXTURE.vat_key_version, status: "purchased",
    }),
    card_ticket_issued: event("card_ticket_issued", {
      ticket_id: cardTicket.ticket_id, publication_id: FIXTURE.publication_id, creator_id: FIXTURE.creator_id, rail: "card",
      gross_minor: "500", currency: "USD", payment_reference_hmac: paymentReferenceHmac, status: "purchased",
    }),
    device_added: event("device_added", { ticket_id: ticket.ticket_id, session_public_key: session, device_epoch: "0", expires_at_ms: deviceExpiry }),
    ticket_watched: event("ticket_watched", { ticket_id: ticket.ticket_id, publication_id: FIXTURE.publication_id, rail: "crypto", ...settled }),
    ticket_refunded: event("ticket_refunded", {
      ticket_id: ticket.ticket_id, publication_id: FIXTURE.publication_id, rail: "crypto", refunded_usdc_micro: FIXTURE.gross_usdc_micro,
    }),
    ticket_released: event("ticket_released", { ticket_id: ticket.ticket_id, publication_id: FIXTURE.publication_id, ...settled }),
    card_ticket_voided: event("card_ticket_voided", { ticket_id: cardTicket.ticket_id, publication_id: FIXTURE.publication_id, reason: "chargeback" }),
    device_revoked: event("device_revoked", { ticket_id: ticket.ticket_id, session_public_key: secondSession, device_epoch: "1" }),
    creator_payout_credited: event("creator_payout_credited", {
      ticket_id: ticket.ticket_id, creator_id: FIXTURE.creator_id, creator_usdc_micro: split.creator_usdc_micro,
    }),
  };
}

// --- Size budget for a NEAR Auth signed purchase -------------------------------------------
// The NEAR Auth approval token carries the signed delegate bytes as a JSON array of decimals
// (`fatxn`), and the token guard rejects tokens above 7,168 bytes. The Auth0 prompt renders the
// delegate verbosely; the measured ratio is 27,101 prompt bytes for a 2,235-byte delegate
// (docs/architecture/near-auth-prompt-size.md). Claims other than `fatxn` are assumptions.

const SIZE_LIMITS = { token_bytes: 7168, prompt_bytes: 24576, headroom_ratio: 0.85 };
const PROMPT_RATIO = { prompt_bytes: 27101, delegate_bytes: 2235 };

const SIZE_ASSUMPTIONS = {
  sender_id: "f".repeat(64),
  usdc_contract_id: "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
  market_contract_id: "market-v2.youtick.near",
  jwt_signature_chars: 342,
  other_claims: "illustrative; not captured from a live token",
};

function sizeBudget() {
  return {
    assumptions: SIZE_ASSUMPTIONS,
    token_limit_bytes: SIZE_LIMITS.token_bytes,
    prompt_limit_bytes: SIZE_LIMITS.prompt_bytes,
    // Web job IDs are `lp-` + UUID (39 chars); 128 is the schema maximum.
    typical: sizeCase(`lp-${"0".repeat(8)}-${"0".repeat(4)}-${"0".repeat(4)}-${"0".repeat(4)}-${"0".repeat(12)}`),
    worst: sizeCase("j".repeat(128)),
  };
}

function sizeCase(publicationId) {
  const worst = { ...SIZE_ASSUMPTIONS, publication_id: publicationId };
  const msg = JSON.stringify({
    action: "buy_ticket_v2",
    publication_id: worst.publication_id,
    ticket_public_key: `ed25519:${"z".repeat(44)}`,
    device: { session_public_key: `ed25519:${"z".repeat(44)}`, certificate_sha256: "f".repeat(64), expires_at_ms: "9".repeat(13), signature: "A".repeat(86) + "==" },
    vat: { vat_usdc_micro: "9".repeat(12), expires_at_ms: "9".repeat(13), key_version: "99", signature: "A".repeat(86) + "==" },
  });
  const args = JSON.stringify({ receiver_id: worst.market_contract_id, amount: "9".repeat(12), msg });
  const delegate = encodeDelegate({
    sender_id: worst.sender_id,
    receiver_id: worst.usdc_contract_id,
    method_name: "ft_transfer_call",
    args: Buffer.from(args),
    gas: 300_000_000_000_000n,
    deposit: 1n,
  });
  const header = { alg: "RS256", typ: "JWT", kid: "k".repeat(43) };
  const payload = {
    iss: "https://youtick-auth.example-tenant.auth0.com/",
    sub: `google-oauth2|${"9".repeat(21)}`,
    aud: ["https://youtick-near-auth-signing-audience.example", "https://youtick-auth.example-tenant.auth0.com/userinfo"],
    iat: 1791360000,
    exp: 1791360300,
    azp: "a".repeat(32),
    scope: "openid profile email transaction",
    jti: "j".repeat(36),
    fatxn: [...delegate],
  };
  const tokenBytes = b64url(JSON.stringify(header)).length + 1 + b64url(JSON.stringify(payload)).length + 1 + 342;
  const promptBytes = Math.ceil(delegate.length * PROMPT_RATIO.prompt_bytes / PROMPT_RATIO.delegate_bytes);
  return {
    publication_id_chars: publicationId.length,
    purchase_msg_bytes: Buffer.byteLength(msg),
    ft_transfer_call_args_bytes: Buffer.byteLength(args),
    delegate_bytes: delegate.length,
    fatxn_json_bytes: JSON.stringify(payload.fatxn).length,
    token_bytes_estimate: tokenBytes,
    prompt_bytes_estimate: promptBytes,
  };
}

// NEP-461 prefix (2^30 + 366) followed by the Borsh DelegateAction with one FunctionCall.
function encodeDelegate({ sender_id, receiver_id, method_name, args, gas, deposit }) {
  const parts = [u32(2 ** 30 + 366), str(sender_id), str(receiver_id), u32(1), Buffer.from([2]), str(method_name),
    u32(args.length), args, u64(gas), u128(deposit), u64(123456789n), u64(987654321n), Buffer.from([0]), Buffer.alloc(32, 7)];
  return Buffer.concat(parts);
}
const u32 = (value) => { const buffer = Buffer.alloc(4); buffer.writeUInt32LE(value); return buffer; };
const u64 = (value) => { const buffer = Buffer.alloc(8); buffer.writeBigUInt64LE(value); return buffer; };
const u128 = (value) => Buffer.concat([u64(value & 0xffffffffffffffffn), u64(value >> 64n)]);
const str = (value) => Buffer.concat([u32(Buffer.byteLength(value)), Buffer.from(value)]);
const b64url = (text) => Buffer.from(text).toString("base64url");


// --- Checks ---------------------------------------------------------------------------------

function check(vectors) {
  validate(schema.$defs.purchase_msg, vectors.purchase.msg, "$.purchase.msg");
  validate(schema.$defs.purchase_msg, JSON.parse(vectors.purchase.ft_transfer_call_args.msg), "$.purchase.ft_transfer_call_args.msg");
  validate(schema.$defs.issue_card_ticket_args, vectors.card_ticket.issue_card_ticket_args, "$.card_ticket.issue_card_ticket_args");
  validate(schema.$defs.void_card_ticket_args, vectors.card_ticket.void_card_ticket_args, "$.card_ticket.void_card_ticket_args");
  for (const [name, args] of Object.entries(vectors.calls)) validate(schema.$defs[name], args, `$.calls.${name}`);
  for (const [name, event] of Object.entries(vectors.events)) {
    validate(schema.$defs.event, event, `$.events.${name}`);
    validate(schema.$defs[`event_${name}`], event.data[0], `$.events.${name}.data[0]`);
  }

  const actions = Object.keys(TICKET_FIELDS);
  for (const action of actions) {
    const vector = vectors.ticket_signatures[action];
    assert(vector, `missing ${action} vector`);
    const key = publicKeyFromNear(vector.signer_public_key);
    const signature = Buffer.from(vector.signature, "base64");
    const ok = (message) => verify(null, Buffer.from(message), key, signature);
    assert(ok(vector.message), `${action} signature must verify`);
    assert(!ok(vector.message.replace(`\n${vectors.fixture.network}\n`, "\nmainnet\n")), `${action} must bind the network`);
    assert(!ok(vector.message.replace(vectors.fixture.contract_id, "market-v2.other.testnet")), `${action} must bind the contract`);
    for (const other of actions.filter((name) => name !== action)) {
      assert(!ok(vector.message.replace(`\n${action}\n`, `\n${other}\n`)), `${action} must not verify as ${other}`);
    }
  }
  const card = vectors.ticket_signatures.card_purchase;
  const cardKey = publicKeyFromNear(card.signer_public_key);
  assert(!verify(null, Buffer.from(card.message.replace(`\n${card.fields.payment_reference_hmac}\n`, `\n${"0".repeat(64)}\n`)), cardKey,
    Buffer.from(card.signature, "base64")), "card_purchase must bind the payment reference");
  assert(vectors.card_ticket.issue_card_ticket_args.device.signature === card.signature, "card tickets carry the card_purchase signature");
  assert(vectors.purchase.msg.device.signature === vectors.ticket_signatures.purchase_device.signature, "crypto purchases carry purchase_device");

  const vat = vectors.vat_attestation;
  const vatKey = publicKeyFromNear(vat.signer_public_key);
  const vatSignature = Buffer.from(vat.signature, "base64");
  assert(verify(null, Buffer.from(vat.message), vatKey, vatSignature), "VAT attestation must verify");
  assert(!verify(null, Buffer.from(vat.message.replace(`\n${vat.input.vat_usdc_micro}\n`, "\n0\n")), vatKey, vatSignature),
    "VAT attestation must bind the VAT amount");
  assert(!verify(null, Buffer.from(vat.message.replace(`\n${vat.input.network}\n`, "\nmainnet\n")), vatKey, vatSignature),
    "VAT attestation must bind the network");
  const sessionKey = publicKeyFromNear(vectors.playback_request.input.session_public_key);
  assert(verify(null, Buffer.from(vectors.playback_request.message), sessionKey, Buffer.from(vectors.playback_request.signature, "base64")),
    "playback request must verify");
  for (const ticket of vectors.key_derivation.tickets) {
    assert(ticket.ticket_id === ticketId(publicKeyRaw(ticket.public_key)), "ticket_id must be SHA-256 of the raw public key");
  }
  const split = vat.split;
  assert(BigInt(vat.input.vat_usdc_micro) + BigInt(split.platform_usdc_micro) + BigInt(split.creator_usdc_micro)
    === BigInt(vat.input.gross_usdc_micro), "split must add up to gross");

  const message = (action, fields, overrides = {}) => ticketMessage({ network: "testnet", contract_id: "a.testnet", action,
    ticket_id: "0".repeat(64), expires_at_ms: "1", fields, ...overrides });
  rejects(() => splitAmounts("4999999", "0"), "gross below minimum");
  rejects(() => splitAmounts("5000000", "4999999"), "VAT close to gross");
  rejects(() => splitAmounts("12700000", "2700001"), "VAT above the 27% inclusive rate");
  rejects(() => splitAmounts("05000000", "0"), "non-canonical decimal");
  rejects(() => splitAmounts(`${1n << 128n}`, "0"), "u128 overflow");
  rejects(() => message("refund_unwatched", { refund_to: "evil\nadd_device" }), "line break in a field");
  rejects(() => message("withdraw", {}), "unknown action");
  rejects(() => message("refund_unwatched", { refund_to: "a.testnet" }, { ticket_id: "A".repeat(64) }), "upper-case ticket_id");
  rejects(() => message("refund_unwatched", { refund_to: "a.testnet" }, { expires_at_ms: `${1n << 64n}` }), "u64 overflow");
  rejects(() => message("revoke_device", { session_public_key: vectors.calls.revoke_device_args.session_public_key, device_epoch: "01" }),
    "non-canonical device epoch");
  rejects(() => message("revoke_device", { session_public_key: "ed25519:11111111", device_epoch: "0" }),
    "short public key");
  splitAmounts("12700000", "2700000");

  const budget = vectors.size_budget;
  for (const [name, ratio] of [["worst", 1], ["typical", SIZE_LIMITS.headroom_ratio]]) {
    const item = budget[name];
    assert(item.token_bytes_estimate <= budget.token_limit_bytes * ratio,
      `${name} purchase token estimate ${item.token_bytes_estimate} exceeds ${ratio * 100}% of ${budget.token_limit_bytes}`);
    assert(item.prompt_bytes_estimate <= budget.prompt_limit_bytes * ratio,
      `${name} purchase prompt estimate ${item.prompt_bytes_estimate} exceeds ${ratio * 100}% of ${budget.prompt_limit_bytes}`);
  }
}

function rejects(fn, label) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  assert(threw, `must reject ${label}`);
}

function validate(node, value, path) {
  assert(node, `${path} has no schema`);
  if (node.$ref) return validate(node.$ref.split("/").slice(1).reduce((part, key) => part[key], schema), value, path);
  if ("const" in node) assert(JSON.stringify(value) === JSON.stringify(node.const), `${path} must equal its schema constant`);
  if (node.enum) assert(node.enum.includes(value), `${path} is outside its enum`);
  if (node.type === "object") {
    assert(value && typeof value === "object" && !Array.isArray(value), `${path} must be an object`);
    for (const key of node.required ?? []) assert(key in value, `${path}.${key} is required`);
    if (node.additionalProperties === false) {
      for (const key of Object.keys(value)) assert(key in (node.properties ?? {}), `${path}.${key} is not allowed`);
    }
    for (const [key, child] of Object.entries(node.properties ?? {})) if (key in value) validate(child, value[key], `${path}.${key}`);
  } else if (node.type === "array") {
    assert(Array.isArray(value), `${path} must be an array`);
    if (node.minItems !== undefined) assert(value.length >= node.minItems, `${path} has too few items`);
    if (node.maxItems !== undefined) assert(value.length <= node.maxItems, `${path} has too many items`);
    for (const [index, item] of value.entries()) validate(node.items, item, `${path}[${index}]`);
  } else if (node.type === "string") {
    assert(typeof value === "string", `${path} must be a string`);
    if (node.pattern) assert(new RegExp(node.pattern, "u").test(value), `${path} has an invalid format`);
  }
}

// --- Helpers --------------------------------------------------------------------------------

function base58(bytes) {
  let value = BigInt(`0x${Buffer.from(bytes).toString("hex") || "0"}`);
  let out = "";
  while (value > 0n) { out = BASE58[Number(value % 58n)] + out; value /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; out = `1${out}`; }
  return out;
}

function base58Decode(text) {
  let value = 0n;
  for (const char of text) {
    const index = BASE58.indexOf(char);
    assert(index >= 0, "invalid base58");
    value = value * 58n + BigInt(index);
  }
  const hex = value.toString(16);
  const body = Buffer.from(hex.length % 2 ? `0${hex}` : hex, "hex");
  const zeros = text.match(/^1*/)[0].length;
  return Buffer.concat([Buffer.alloc(zeros), value === 0n ? Buffer.alloc(0) : body]);
}

function publicKeyRaw(nearKey) {
  assert(nearKey.startsWith("ed25519:"), "public key must be ed25519");
  const raw = base58Decode(nearKey.slice("ed25519:".length));
  assert(raw.length === 32, "ed25519 public key must be 32 bytes");
  return raw;
}

function publicKeyFromNear(nearKey) {
  return createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), publicKeyRaw(nearKey)]), format: "der", type: "spki" });
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// --- Entry ----------------------------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const built = buildVectors();
  if (process.argv.includes("--write")) writeFileSync(vectorsPath, `${JSON.stringify(built, null, 2)}\n`);
  const stored = readJson(vectorsPath);
  assert(JSON.stringify(stored) === JSON.stringify(built), "golden-vectors.json drifted from the reference implementation; rerun with --write and review");
  check(stored);
  const { typical, worst, token_limit_bytes: tokenLimit } = stored.size_budget;
  console.log(`youtick-market-v2 protocol OK (purchase token ~${typical.token_bytes_estimate} typical / ~${worst.token_bytes_estimate} worst of ${tokenLimit} B; delegate ${typical.delegate_bytes}/${worst.delegate_bytes} B)`);
}
