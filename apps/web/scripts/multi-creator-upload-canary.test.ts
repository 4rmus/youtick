import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { Buffer } from 'node:buffer';
import { expect, test } from 'vitest';

const LIVE_ACK = 'two-nonrefundable-usdc-payments-and-two-uploads';
const SPONSORED_LIVE_ACK = 'one-sponsored-usdc-payment-upload-and-publication';
const SPONSORED_RECOVERY_LIVE_ACK = 'resume-one-paid-job-without-a-second-payment';
const SPONSORED_RECOVERY_KEY_REFRESH_ACK = 'replace-one-upload-key-without-payment';
const SPONSORED_SECOND_KEY_EXCEPTION_ACK = 'replace-one-lost-confirmed-upload-key';
const SPONSORED_SECOND_KEY_INCIDENT_TX_HASH = '6rQkXHXtwZpWv6Bc6XBNh8QMLQHyJPdB5orWw5gt4xqS';
const SPONSORED_SECOND_KEY_INCIDENT_JOB_SHA256 = 'c5f39137e67044a11f037e7b1cbdedfaaa1402376cb86768571e565f85313b1e';
const SPONSORED_SECOND_KEY_INCIDENT_RECOVERY_SHA256 = '9d004bc8f9f9cda47e63cbeab78819ae7d8f729e284dea9b91236d58f475f424';
const SPONSORED_RELAY_FAILURE_PATTERN = /^invalid_sponsored_upload_relay:(delegate_decode|delegate_shape|quote_validation|signature_validation|freshness|access_key)$/;
const SPONSORED_RECOVERY_FAILURE_PATTERN = /^sponsored_recovery_failed:(key_refresh|preflight|job|intent|upload|publication|settlement)$/;
const RECOVERY_KEY_MIN_TTL_MS = 30 * 60 * 1000;
const RECOVERY_KEY_TTL_MS = 24 * 60 * 60 * 1000;
const RECOVERY_KEY_RECONCILIATION_DELAYS_MS = [0, 1000, 2000, 4000, 8000];
const RECOVERY_KEY_REPLACEMENT_GAS = 100_000_000_000_000n;
const MARKET_ID = 'lp-arch-market-v2-260809.youtick-dev-v3.testnet';
const ACCESS_ID = 'lp-arch-access-v2-260809.youtick-dev-v3.testnet';
const APP_ORIGIN = 'https://preview.youtick.net';
const BRIDGE_ORIGIN = 'https://bridge-preview.youtick.net';
const STARTING_USDC = '20000000';
const FEE_USDC = '500000';
const SPONSOR_FEE_USDC = '100000';
const SPONSORED_TOTAL_FEE_USDC = '600000';
const RECOVERY_FILE = join(
  homedir(),
  '.near-credentials/testnet/.youtick-phase3-multi-creator-recovery.json',
);
const SPONSORED_RECOVERY_FILE = join(
  homedir(),
  '.near-credentials/testnet/.youtick-sponsored-upload-recovery.json',
);

const LOCKED_INPUTS = [
  {
    accountId: 'lp-p3-creator-a-250825.youtick-dev-v3.testnet',
    sourceBytes: 341028,
    sourceSha256: '27264dd1f93463725b2a2ac028128ce042fda9989f682338372b02dafe66dea6',
    mediaEnv: 'YOUTICK_CANARY_MEDIA_A',
  },
  {
    accountId: 'lp-p3-creator-b-250825.youtick-dev-v3.testnet',
    sourceBytes: 744278,
    sourceSha256: 'da0abd4c474231308da502d59e9fe171b1d1e2bbaf3075e2f9151d842337be78',
    mediaEnv: 'YOUTICK_CANARY_MEDIA_B',
  },
] as const;

type Participant = {
  accountId: string;
  jobId: string;
  sourceBytes: number;
  feeUsdc: string;
};

type Intent = {
  created: boolean;
  endpointFingerprint: string;
  value: unknown;
};

type CanarySteps = {
  preflight(participant: Participant): Promise<{ usdcBalance: string }>;
  authorize(participant: Participant): Promise<string>;
  waitForJob(participant: Participant, uploadPublicKey: string): Promise<void>;
  requestIntent(participant: Participant): Promise<Intent>;
  upload(participant: Participant, intent: unknown): Promise<void>;
  readUsdcBalance(participant: Participant): Promise<string>;
};

type SponsoredCanarySteps = {
  preflight(): Promise<{ usdcBalance: string; platformBalance: string; publicationCount: number }>;
  authorize(): Promise<string>;
  waitForJob(uploadPublicKey: string): Promise<void>;
  requestIntent(): Promise<Intent>;
  upload(intent: unknown): Promise<void>;
  waitForPublication(): Promise<void>;
  readAfter(): Promise<{ usdcBalance: string; platformBalance: string; publicationCount: number }>;
};

type SponsoredRecoverySession = {
  storageKey: string;
  jobId: string;
  secretKey: string;
  publicKey: string;
  uploadKeyExpiresAtMs: string;
  refreshRequired: boolean;
};

type RecoveryJob = {
  job_id?: unknown;
  generation?: unknown;
  status?: unknown;
  creator_id?: unknown;
  fee_asset?: unknown;
  expected_source_bytes?: unknown;
  upload_public_key?: unknown;
  upload_key_expires_at_ms?: unknown;
} | null;

async function settledValues<T>(promises: Array<Promise<T>>, errorCode: string): Promise<T[]> {
  const results = await Promise.allSettled(promises);
  if (results.some((result) => result.status === 'rejected')) throw new Error(errorCode);
  return results.map((result) => (result as PromiseFulfilledResult<T>).value);
}

async function runExactTwo(participants: Participant[], steps: CanarySteps) {
  if (participants.length !== 2
    || new Set(participants.map(({ accountId }) => accountId)).size !== 2
    || new Set(participants.map(({ jobId }) => jobId)).size !== 2
    || participants.some(({ feeUsdc }) => feeUsdc !== FEE_USDC)) {
    throw new Error('multi_creator_canary_scope_invalid');
  }

  const before = await Promise.all(participants.map((participant) => steps.preflight(participant)));
  if (before.some(({ usdcBalance }) => usdcBalance !== STARTING_USDC)) {
    throw new Error('multi_creator_canary_starting_balance_invalid');
  }

  const uploadKeys = await settledValues(
    participants.map((participant) => steps.authorize(participant)),
    'multi_creator_canary_payment_failed',
  );
  await Promise.all(participants.map((participant, index) => (
    steps.waitForJob(participant, uploadKeys[index])
  )));

  const intents = await settledValues(
    participants.map((participant) => steps.requestIntent(participant)),
    'multi_creator_canary_intent_failed',
  );
  if (intents.some(({ created }) => created !== true)
    || new Set(intents.map(({ endpointFingerprint }) => endpointFingerprint)).size !== 2) {
    throw new Error('multi_creator_canary_intent_invalid');
  }

  await settledValues(
    participants.map((participant, index) => steps.upload(participant, intents[index].value)),
    'multi_creator_canary_upload_failed',
  );

  const after = await Promise.all(participants.map((participant) => (
    steps.readUsdcBalance(participant)
  )));
  if (after.some((balance, index) => (
    BigInt(before[index].usdcBalance) - BigInt(balance) !== BigInt(FEE_USDC)
  ))) {
    throw new Error('multi_creator_canary_payment_delta_invalid');
  }

  return {
    schema: 'youtick.multi-creator-upload-canary.v1',
    status: 'PASS',
    creators: 2,
    payments: 2,
    payment_usdc_each: FEE_USDC,
    new_bridge_resources: 2,
    uploads: 2,
    uploaded_bytes: participants.map(({ sourceBytes }) => String(sourceBytes)),
    endpoint_fingerprints: intents.map(({ endpointFingerprint }) => endpointFingerprint),
  } as const;
}

async function runSponsoredOne(
  participant: Participant,
  steps: SponsoredCanarySteps,
  mode: 'new' | 'recovery' = 'new',
) {
  if (participant.feeUsdc !== FEE_USDC) throw new Error('sponsored_canary_scope_invalid');
  const before = await sponsoredCanaryStep(mode, 'preflight', async () => {
    const value = await steps.preflight();
    if (mode === 'new' && BigInt(value.usdcBalance) < BigInt(SPONSORED_TOTAL_FEE_USDC)) {
      throw new Error('sponsored_canary_balance_insufficient');
    }
    return value;
  });
  const uploadPublicKey = await sponsoredCanaryStep(mode, 'job', steps.authorize);
  await sponsoredCanaryStep(mode, 'job', () => steps.waitForJob(uploadPublicKey));
  const intent = await sponsoredCanaryStep(mode, 'intent', async () => {
    const value = await steps.requestIntent();
    if (mode === 'new' && value.created !== true) {
      throw new Error('sponsored_canary_intent_invalid');
    }
    return value;
  });
  await sponsoredCanaryStep(mode, 'upload', () => steps.upload(intent.value));
  await sponsoredCanaryStep(mode, 'publication', steps.waitForPublication);
  await sponsoredCanaryStep(mode, 'settlement', async () => {
    const after = await steps.readAfter();
    const expectedPaymentDelta = mode === 'new' ? BigInt(SPONSORED_TOTAL_FEE_USDC) : 0n;
    if (BigInt(before.usdcBalance) - BigInt(after.usdcBalance)
        !== expectedPaymentDelta
      || BigInt(after.platformBalance) - BigInt(before.platformBalance)
        !== expectedPaymentDelta
      || after.publicationCount !== before.publicationCount + 1) {
      throw new Error('sponsored_canary_settlement_invalid');
    }
  });
  return {
    schema: mode === 'new'
      ? 'youtick.sponsored-upload-canary.v1'
      : 'youtick.sponsored-upload-recovery-canary.v1',
    status: 'PASS',
    creators: 1,
    payments: mode === 'new' ? 1 : 0,
    recovered_payments: mode === 'recovery' ? 1 : 0,
    upload_fee_usdc: FEE_USDC,
    sponsor_fee_usdc: SPONSOR_FEE_USDC,
    total_fee_usdc: SPONSORED_TOTAL_FEE_USDC,
    new_bridge_resources: intent.created ? 1 : 0,
    uploads: 1,
    publications: 1,
    endpoint_fingerprint: intent.endpointFingerprint,
  } as const;
}

async function sponsoredCanaryStep<T>(
  mode: 'new' | 'recovery',
  stage: 'preflight' | 'job' | 'intent' | 'upload' | 'publication' | 'settlement',
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (mode === 'recovery') {
      const message = error instanceof Error ? error.message : '';
      if (SPONSORED_RECOVERY_FAILURE_PATTERN.test(message)) throw error;
      throw new Error(`sponsored_recovery_failed:${stage}`);
    }
    throw error;
  }
}

test('requires two distinct creators and starts both uploads before either completes', async () => {
  const participants = LOCKED_INPUTS.map((input, index) => ({
    accountId: input.accountId,
    jobId: `job-${index}`,
    sourceBytes: input.sourceBytes,
    feeUsdc: FEE_USDC,
  }));
  let uploadCalls = 0;
  let releaseUploads!: () => void;
  const uploadBarrier = new Promise<void>((resolve) => { releaseUploads = resolve; });
  const receipt = await runExactTwo(participants, {
    preflight: async () => ({ usdcBalance: STARTING_USDC }),
    authorize: async (participant) => `key:${participant.accountId}`,
    waitForJob: async () => undefined,
    requestIntent: async (participant) => ({
      created: true,
      endpointFingerprint: sha256(participant.jobId),
      value: participant.jobId,
    }),
    upload: async () => {
      uploadCalls += 1;
      if (uploadCalls === 2) releaseUploads();
      await uploadBarrier;
    },
    readUsdcBalance: async () => String(BigInt(STARTING_USDC) - BigInt(FEE_USDC)),
  });

  expect(uploadCalls).toBe(2);
  expect(receipt).toMatchObject({ status: 'PASS', creators: 2, payments: 2, uploads: 2 });
  expect(new Set(receipt.endpoint_fingerprints).size).toBe(2);
});

test('sponsored canary requires one payment, upload and publication with exact settlement', async () => {
  const calls: string[] = [];
  const receipt = await runSponsoredOne({
    accountId: 'creator.testnet', jobId: 'sponsored-job', sourceBytes: 341028, feeUsdc: FEE_USDC,
  }, {
    preflight: async () => {
      calls.push('preflight');
      return { usdcBalance: STARTING_USDC, platformBalance: '540000', publicationCount: 1 };
    },
    authorize: async () => { calls.push('authorize'); return 'ed25519:upload'; },
    waitForJob: async () => { calls.push('job'); },
    requestIntent: async () => {
      calls.push('intent');
      return { created: true, endpointFingerprint: sha256('endpoint'), value: 'intent' };
    },
    upload: async () => { calls.push('upload'); },
    waitForPublication: async () => { calls.push('publication'); },
    readAfter: async () => {
      calls.push('after');
      return { usdcBalance: '19400000', platformBalance: '1140000', publicationCount: 2 };
    },
  });
  expect(calls).toEqual(['preflight', 'authorize', 'job', 'intent', 'upload', 'publication', 'after']);
  expect(receipt).toMatchObject({ status: 'PASS', payments: 1, uploads: 1, publications: 1 });
});

test('sponsored recovery publishes the paid job without a second payment', async () => {
  const receipt = await runSponsoredOne({
    accountId: 'creator.testnet', jobId: 'sponsored-job', sourceBytes: 341028, feeUsdc: FEE_USDC,
  }, {
    preflight: async () => ({
      usdcBalance: '19400000', platformBalance: '1140000', publicationCount: 1,
    }),
    authorize: async () => 'ed25519:upload',
    waitForJob: async () => undefined,
    requestIntent: async () => ({
      created: false, endpointFingerprint: sha256('endpoint'), value: 'intent',
    }),
    upload: async () => undefined,
    waitForPublication: async () => undefined,
    readAfter: async () => ({
      usdcBalance: '19400000', platformBalance: '1140000', publicationCount: 2,
    }),
  }, 'recovery');

  expect(receipt).toMatchObject({
    status: 'PASS', payments: 0, recovered_payments: 1, uploads: 1, publications: 1,
    new_bridge_resources: 0,
  });
});

test('uses a Buffer with File metadata for the Node TUS client', async () => {
  const file = nodeTusFile(Buffer.from('video'), 'video.mp4', 123);
  const { defaultOptions } = await import('tus-js-client');

  expect(Buffer.isBuffer(file)).toBe(true);
  expect(file).toMatchObject({
    name: 'video.mp4', type: 'video/mp4', lastModified: 123, size: 5,
  });
  await expect(defaultOptions.fileReader.openFile(file, 32 * 1024 * 1024))
    .resolves.toMatchObject({ size: 5 });
});

test('reports the exact allowlisted sponsored recovery failure phase', async () => {
  const participant = {
    accountId: 'creator.testnet', jobId: 'sponsored-job', sourceBytes: 341028, feeUsdc: FEE_USDC,
  };
  const steps: SponsoredCanarySteps = {
    preflight: async () => ({
      usdcBalance: '19400000', platformBalance: '1140000', publicationCount: 1,
    }),
    authorize: async () => 'ed25519:upload',
    waitForJob: async () => undefined,
    requestIntent: async () => ({
      created: false, endpointFingerprint: sha256('endpoint'), value: 'intent',
    }),
    upload: async () => undefined,
    waitForPublication: async () => undefined,
    readAfter: async () => ({
      usdcBalance: '19400000', platformBalance: '1140000', publicationCount: 2,
    }),
  };
  const fail = async () => { throw new Error('secret_payload'); };
  const cases: Array<[string, Partial<SponsoredCanarySteps>]> = [
    ['preflight', { preflight: fail }],
    ['job', { authorize: fail }],
    ['intent', { requestIntent: fail }],
    ['upload', { upload: fail }],
    ['publication', { waitForPublication: fail }],
    ['settlement', { readAfter: fail }],
  ];

  for (const [stage, override] of cases) {
    await expect(runSponsoredOne(participant, { ...steps, ...override }, 'recovery'))
      .rejects.toThrow(`sponsored_recovery_failed:${stage}`);
  }
  await expect(runSponsoredOne(participant, {
    ...steps,
    authorize: async () => { throw new Error('sponsored_recovery_failed:key_refresh'); },
  }, 'recovery')).rejects.toThrow('sponsored_recovery_failed:key_refresh');
});

test('loads the exact thirty-minute recovery boundary without exposing keys', () => {
  const fixture = makeRecoveryFixture(RECOVERY_KEY_MIN_TTL_MS, true);
  try {
    expect(fixture.session).toMatchObject({
      jobId: fixture.jobId,
      publicKey: 'ed25519:fixture-public',
      refreshRequired: false,
    });
  } finally {
    fixture.cleanup();
  }
});

test('rejects a sponsored Bridge scoped to another valid job', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    versionId: '11111111-1111-4111-8111-111111111111',
    stage: 'ENABLED',
    providerMutationEnabled: true,
    newUploadReady: true,
    sponsoredUploadQuoteReady: true,
    sponsoredUploadRelayReady: true,
    operatorMutationEnabled: true,
    operatorJobFingerprint: sha256('other-job'),
  });
  try {
    await expect(requireEnabledBridge(
      '11111111-1111-4111-8111-111111111111',
      true,
      'job-recovery',
    )).rejects.toThrow('multi_creator_canary_bridge_not_ready');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('persists a FINAL key replacement without trusting a stale follow-up view', async () => {
  const fixture = makeRecoveryFixture(-1, true);
  try {
    const refreshed = {
      ...fixture.session,
      secretKey: 'ed25519:new-secret',
      publicKey: 'ed25519:new-public',
      uploadKeyExpiresAtMs: String(fixture.nowMs + RECOVERY_KEY_TTL_MS),
      refreshRequired: false,
    };
    const replacements: Array<Record<string, string>> = [];
    let readCalls = 0;

    await expect(refreshSponsoredRecoverySession({
      storage: fixture.storage,
      session: fixture.session,
      accountId: fixture.accountId,
      expectedSourceBytes: 341028,
      refreshAck: SPONSORED_RECOVERY_KEY_REFRESH_ACK,
      nowMs: fixture.nowMs,
      createKey: () => ({ secretKey: refreshed.secretKey, publicKey: refreshed.publicKey }),
      readJob: async () => {
        readCalls += 1;
        return recoveryJob(fixture.session, fixture.accountId, 341028);
      },
      replaceKey: async (input) => { replacements.push(input); },
    })).resolves.toMatchObject({ publicKey: refreshed.publicKey, refreshRequired: false });
    expect(replacements).toHaveLength(1);
    expect(readCalls).toBe(1);
    expect(sponsoredRecoverySession(fixture.storage, fixture.accountId, fixture.nowMs))
      .toMatchObject({ publicKey: refreshed.publicKey, refreshRequired: false });
    expect(JSON.parse(fixture.storage.getItem(fixture.storageKey) || 'null'))
      .not.toHaveProperty('sponsoredDelegateBase64');
    expect(lstatSync(fixture.filePath).mode & 0o777).toBe(0o600);
  } finally {
    fixture.cleanup();
  }
});

test('does not retry or overwrite recovery data when key replacement is unconfirmed', async () => {
  const fixture = makeRecoveryFixture(-1);
  try {
    let replaceCalls = 0;
    let readCalls = 0;
    await expect(refreshSponsoredRecoverySession({
      storage: fixture.storage,
      session: fixture.session,
      accountId: fixture.accountId,
      expectedSourceBytes: 341028,
      refreshAck: SPONSORED_RECOVERY_KEY_REFRESH_ACK,
      nowMs: fixture.nowMs,
      createKey: () => ({ secretKey: 'ed25519:new-secret', publicKey: 'ed25519:new-public' }),
      readJob: async () => {
        readCalls += 1;
        return recoveryJob(fixture.session, fixture.accountId, 341028);
      },
      replaceKey: async () => { replaceCalls += 1; throw new Error('ambiguous'); },
      wait: async () => undefined,
    })).rejects.toThrow('sponsored_recovery_key_refresh_unconfirmed');
    expect({ replaceCalls, readCalls }).toEqual({
      replaceCalls: 1,
      readCalls: 1 + RECOVERY_KEY_RECONCILIATION_DELAYS_MS.length,
    });
    expect(readFileSync(fixture.filePath, 'utf8')).toBe(fixture.original);
  } finally {
    fixture.cleanup();
  }
});

test('requires exact acknowledgement before refreshing an expired recovery key', async () => {
  const fixture = makeRecoveryFixture(-1);
  try {
    let calls = 0;
    await expect(refreshSponsoredRecoverySession({
      storage: fixture.storage,
      session: fixture.session,
      accountId: fixture.accountId,
      expectedSourceBytes: 341028,
      nowMs: fixture.nowMs,
      createKey: () => { calls += 1; return { secretKey: '', publicKey: '' }; },
      readJob: async () => { calls += 1; return null; },
      replaceKey: async () => { calls += 1; },
    })).rejects.toThrow('sponsored_recovery_key_refresh_ack_required');
    expect(calls).toBe(0);
  } finally {
    fixture.cleanup();
  }
});

test('locks the final recovery key replacement transaction', () => {
  expect(recoveryKeyReplacementTransaction({
    jobId: 'job-recovery', newPublicKey: 'ed25519:new-public', expiresAtMs: '1800086400000',
  }, (methodName, args, gas, deposit) => ({ methodName, args, gas, deposit }))).toEqual({
    receiverId: MARKET_ID,
    waitUntil: 'FINAL',
    retries: 0,
    actions: [{
      methodName: 'replace_upload_key',
      args: {
        job_id: 'job-recovery',
        new_public_key: 'ed25519:new-public',
        expires_at_ms: '1800086400000',
      },
      gas: 100_000_000_000_000n,
      deposit: 0n,
    }],
  });
});

test.each([
  ['job id', { job_id: 'other-job' }],
  ['generation', { generation: 2 }],
  ['status', { status: 'Published' }],
  ['creator', { creator_id: 'other.testnet' }],
  ['asset', { fee_asset: 'NEAR' }],
  ['source bytes', { expected_source_bytes: '1' }],
  ['public key', { upload_public_key: 'ed25519:other-public' }],
  ['expiry', { upload_key_expires_at_ms: '1' }],
])('rejects a mismatched recovery %s before key creation', async (_label, override) => {
  const nowMs = 1_800_000_000_000;
  const accountId = 'creator.testnet';
  const session: SponsoredRecoverySession = {
    storageKey: 'youtick:livepeer-job-session:creator.testnet:job-recovery',
    jobId: 'job-recovery',
    secretKey: 'ed25519:expired-secret',
    publicKey: 'ed25519:expired-public',
    uploadKeyExpiresAtMs: String(nowMs - 1),
    refreshRequired: true,
  };
  let sideEffects = 0;

  await expect(refreshSponsoredRecoverySession({
    storage: {} as Storage,
    session,
    accountId,
    expectedSourceBytes: 341028,
    refreshAck: SPONSORED_RECOVERY_KEY_REFRESH_ACK,
    nowMs,
    createKey: () => { sideEffects += 1; return { secretKey: '', publicKey: '' }; },
    readJob: async () => ({ ...recoveryJob(session, accountId, 341028), ...override }),
    replaceKey: async () => { sideEffects += 1; },
  })).rejects.toThrow('sponsored_recovery_key_refresh_job_invalid');
  expect(sideEffects).toBe(0);
});

test('accepts one ambiguous replacement only when the final job has the new key', async () => {
  const fixture = makeRecoveryFixture(-1);
  try {
    const refreshed = {
      ...fixture.session,
      secretKey: 'ed25519:new-secret',
      publicKey: 'ed25519:new-public',
      uploadKeyExpiresAtMs: String(fixture.nowMs + RECOVERY_KEY_TTL_MS),
      refreshRequired: false,
    };
    let replaceCalls = 0;
    let readCalls = 0;
    await expect(refreshSponsoredRecoverySession({
      storage: fixture.storage,
      session: fixture.session,
      accountId: fixture.accountId,
      expectedSourceBytes: 341028,
      refreshAck: SPONSORED_RECOVERY_KEY_REFRESH_ACK,
      nowMs: fixture.nowMs,
      createKey: () => ({ secretKey: refreshed.secretKey, publicKey: refreshed.publicKey }),
      readJob: async () => {
        readCalls += 1;
        if (readCalls === 1) return recoveryJob(fixture.session, fixture.accountId, 341028);
        if (readCalls === 2) throw new Error('transient');
        return recoveryJob(refreshed, fixture.accountId, 341028);
      },
      replaceKey: async () => { replaceCalls += 1; throw new Error('ambiguous'); },
      wait: async () => undefined,
    })).resolves.toMatchObject({ publicKey: refreshed.publicKey, refreshRequired: false });
    expect(replaceCalls).toBe(1);
    expect(readCalls).toBe(3);
  } finally {
    fixture.cleanup();
  }
});

test('replaces the exact lost-key incident once and rejects replay', async () => {
  const fixture = makeRecoveryFixture(-1);
  try {
    const first = {
      ...recoveryJob(fixture.session, fixture.accountId, 341028),
      upload_public_key: 'ed25519:first-replacement-public',
      upload_key_expires_at_ms: String(fixture.nowMs + RECOVERY_KEY_TTL_MS),
    };
    const evidence = replacementEvidenceFixture(first, fixture.accountId);
    let current: RecoveryJob = first;
    let replacements = 0;
    let keyCreations = 0;
    const run = (transaction: unknown) => replaceLostSponsoredRecoveryKey({
      storage: fixture.storage,
      session: sponsoredRecoverySession(fixture.storage, fixture.accountId, fixture.nowMs),
      accountId: fixture.accountId,
      expectedSourceBytes: 341028,
      exceptionAck: SPONSORED_SECOND_KEY_EXCEPTION_ACK,
      firstReplacement: transaction,
      incidentJobSha256: sha256(fixture.jobId),
      nowMs: fixture.nowMs,
      createKey: () => {
        keyCreations += 1;
        return { secretKey: 'ed25519:second-secret', publicKey: 'ed25519:second-public' };
      },
      readJob: async () => current,
      replaceKey: async (replacement) => {
        replacements += 1;
        current = recoveryJob({
          ...fixture.session,
          secretKey: 'ed25519:second-secret',
          publicKey: replacement.newPublicKey,
          uploadKeyExpiresAtMs: replacement.expiresAtMs,
          refreshRequired: false,
        }, fixture.accountId, 341028);
      },
    });

    await expect(run({ ...evidence, status: { Failure: {} } }))
      .rejects.toThrow('sponsored_second_key_incident_invalid');
    const wrongDeposit = structuredClone(evidence);
    wrongDeposit.transaction.actions[0].FunctionCall.deposit = '1';
    await expect(run(wrongDeposit)).rejects.toThrow('sponsored_second_key_incident_invalid');
    expect({ replacements, keyCreations }).toEqual({ replacements: 0, keyCreations: 0 });

    const refreshed = await run(evidence);
    expect({ replacements, keyCreations }).toEqual({ replacements: 1, keyCreations: 1 });
    expect(sponsoredRecoverySession(fixture.storage, fixture.accountId, fixture.nowMs))
      .toMatchObject({ publicKey: refreshed.publicKey, refreshRequired: false });

    await expect(run(evidence)).rejects.toThrow('sponsored_second_key_incident_invalid');
    expect({ replacements, keyCreations }).toEqual({ replacements: 1, keyCreations: 1 });
  } finally {
    fixture.cleanup();
  }
});

test('requires exact exception acknowledgement before incident reads', async () => {
  let sideEffects = 0;
  await expect(replaceLostSponsoredRecoveryKey({
    storage: {} as Storage,
    session: {
      storageKey: 'recovery', jobId: 'job-recovery',
      secretKey: 'ed25519:old-secret', publicKey: 'ed25519:old-public',
      uploadKeyExpiresAtMs: '1800000000000', refreshRequired: true,
    },
    accountId: 'creator.testnet',
    expectedSourceBytes: 341028,
    firstReplacement: {},
    nowMs: 1_800_000_000_000,
    createKey: () => { sideEffects += 1; return { secretKey: '', publicKey: '' }; },
    readJob: async () => { sideEffects += 1; return null; },
    replaceKey: async () => { sideEffects += 1; },
  })).rejects.toThrow('sponsored_second_key_exception_ack_required');
  expect(sideEffects).toBe(0);
});

test('requires Preview mutations closed before a second-key exception', async () => {
  const originalFetch = globalThis.fetch;
  const closed: Record<string, unknown> = {
    stage: 'DISABLED', providerMutationEnabled: false, operatorMutationEnabled: false,
    newUploadReady: false, controlPlaneReady: false,
    sponsoredUploadQuoteReady: false, sponsoredUploadRelayReady: false,
    playbackReady: false, playbackV2Ready: false, playbackShadowV2Ready: false,
    webhookQueueReady: false, uploadJobArchiveReady: false, operatorOutboxArchiveReady: false,
  };
  try {
    globalThis.fetch = async () => Response.json(closed);
    await expect(requireDisabledBridge()).resolves.toBeUndefined();
    globalThis.fetch = async () => Response.json({ ...closed, operatorMutationEnabled: true });
    await expect(requireDisabledBridge()).rejects.toThrow('sponsored_second_key_preview_not_closed');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reports only allowlisted sponsored relay rejection stages', () => {
  expect(sponsoredCanaryFailureCode(new Error(
    'invalid_sponsored_upload_relay:access_key',
  ))).toBe('invalid_sponsored_upload_relay:access_key');
  for (const stage of ['key_refresh', 'preflight', 'job', 'intent', 'upload', 'publication', 'settlement']) {
    const code = `sponsored_recovery_failed:${stage}`;
    expect(sponsoredCanaryFailureCode(new Error(code))).toBe(code);
  }
  expect(sponsoredCanaryFailureCode(new Error(
    'sponsored_recovery_failed:secret_payload',
  ))).toBe('unknown');
  expect(sponsoredCanaryFailureCode(new Error('secret_payload'))).toBe('unknown');
});

test.skipIf(process.env.YOUTICK_PHASE3_CANARY_ACK !== LIVE_ACK)(
  'runs the exact local two-creator Preview canary',
  async () => {
    if (process.env.CI) throw new Error('multi_creator_canary_local_only');
    const expectedBridgeVersion = requiredUuid('YOUTICK_EXPECTED_BRIDGE_VERSION');
    const media = LOCKED_INPUTS.map(loadLockedMedia);
    await requireEnabledBridge(expectedBridgeVersion);

    process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
    process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID = MARKET_ID;
    process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = ACCESS_ID;
    process.env.NEXT_PUBLIC_APP_URL = APP_ORIGIN;
    process.env.NEXT_PUBLIC_LIVEPEER_BRIDGE_URL = BRIDGE_ORIGIN;
    process.env.NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1 = 'true';

    const recovery = new RecoveryStorage(RECOVERY_FILE);
    Object.defineProperty(globalThis, 'sessionStorage', { value: recovery, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: recovery, configurable: true });
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: { origin: APP_ORIGIN },
        sessionStorage: recovery,
        localStorage: recovery,
        crypto: globalThis.crypto,
      },
      configurable: true,
    });
    const near = await import('near-api-js');
    const upload = await import('@/lib/livepeer-upload');
    const publication = await import('@/lib/livepeer-publication');
    const { getSplitTransactionProvider } = await import('@/lib/rpc-failover');
    const provider = getSplitTransactionProvider();
    const runtime = await Promise.all(LOCKED_INPUTS.map(async (input, index) => {
      const credentialPath = join(
        homedir(),
        `.near-credentials/testnet/${input.accountId}.json`,
      );
      const keyPair = loadCredential(credentialPath, input.accountId, near.KeyPair);
      await requireFinalFullAccessKey(provider, input.accountId, keyPair.getPublicKey().toString());
      const signer = new near.KeyPairSigner(keyPair);
      const account = new near.Account(input.accountId, provider, signer);
      const file = media[index].file;
      const source = upload.validateLivepeerSourceFile(file);
      if (!source.ok || source.sourceType !== 'mp4'
        || upload.livepeerUploadFeeUsdc(file.size) !== FEE_USDC) {
        throw new Error('multi_creator_canary_media_policy_invalid');
      }
      return {
        input,
        file,
        fingerprint: await upload.fingerprintLivepeerSource(file),
        jobId: upload.createLivepeerJobId(),
        wallet: {
          signAndSendTransaction: ({ receiverId, actions }: {
            receiverId: string;
            actions: unknown[];
          }) => account.signAndSendTransaction({ receiverId, actions: actions as never }),
        },
      };
    }));

    const byAccount = new Map<string, (typeof runtime)[number]>(
      runtime.map((value) => [value.input.accountId, value]),
    );
    const participants = runtime.map(({ input, jobId }) => ({
      accountId: input.accountId,
      jobId,
      sourceBytes: input.sourceBytes,
      feeUsdc: FEE_USDC,
    }));
    const restoreFetch = installBridgeOriginFetch();

    try {
      const receipt = await runExactTwo(participants, {
        preflight: async (participant) => {
          if (await publication.readLivepeerMediaJob(participant.jobId) !== null) {
            throw new Error('multi_creator_canary_job_exists');
          }
          await upload.preflightLivepeerUpload({
            accountId: participant.accountId,
            jobId: participant.jobId,
            generation: 1,
            expectedSourceBytes: participant.sourceBytes,
          });
          const balances = await upload.readCreatorFeeBalances(participant.accountId);
          return { usdcBalance: balances.usdcBalance };
        },
        authorize: async (participant) => {
          const value = byAccount.get(participant.accountId)!;
          return upload.authorizeLivepeerPaidJob(value.wallet as never, {
            accountId: participant.accountId,
            jobId: participant.jobId,
            title: `Phase 3 upload canary ${value.input.mediaEnv.slice(-1)}`,
            priceUsdc: '2000000',
            expectedSourceBytes: participant.sourceBytes,
            asset: 'USDC',
          });
        },
        waitForJob: (participant, uploadPublicKey) => publication.waitForAuthorizedLivepeerJob(
          participant.jobId,
          participant.accountId,
          uploadPublicKey,
        ),
        requestIntent: async (participant) => {
          const value = byAccount.get(participant.accountId)!;
          const intent = await upload.requestLivepeerUploadIntent({
            accountId: participant.accountId,
            jobId: participant.jobId,
            generation: 1,
            expectedSourceBytes: participant.sourceBytes,
            sourceFingerprintSha256: value.fingerprint,
            sourceType: 'mp4',
          });
          return {
            created: intent.created,
            endpointFingerprint: sha256(intent.tus_endpoint),
            value: intent,
          };
        },
        upload: async (participant, intent) => {
          const value = byAccount.get(participant.accountId)!;
          await upload.uploadLivepeerSource(value.file, intent as never, {
            heartbeat: () => upload.heartbeatLivepeerUploadLease({
              accountId: participant.accountId,
              intent: intent as never,
            }),
          });
        },
        readUsdcBalance: async (participant) => (
          await upload.readCreatorFeeBalances(participant.accountId)
        ).usdcBalance,
      });
      for (const participant of participants) {
        upload.clearLivepeerJobSessionKey(participant.accountId, participant.jobId);
      }
      if (recovery.length !== 0 || existsSync(RECOVERY_FILE)) {
        throw new Error('multi_creator_canary_recovery_cleanup_failed');
      }
      console.log(JSON.stringify({
        ...receipt,
        creator_fingerprints: participants.map(({ accountId }) => sha256(accountId)),
        job_fingerprints: participants.map(({ jobId }) => sha256(jobId)),
        media_sha256: LOCKED_INPUTS.map(({ sourceSha256 }) => sourceSha256),
      }));
    } catch {
      throw new Error(`multi_creator_canary_failed_recovery_retained=${existsSync(RECOVERY_FILE)}`);
    } finally {
      restoreFetch();
    }
  },
  20 * 60 * 1000,
);

test.skipIf(
  process.env.YOUTICK_SPONSORED_SECOND_KEY_EXCEPTION_ACK
    !== SPONSORED_SECOND_KEY_EXCEPTION_ACK,
)(
  'runs one exact second-key exception while Preview mutations stay closed',
  async () => {
    if (process.env.CI
      || process.env.YOUTICK_PHASE3_CANARY_ACK === LIVE_ACK
      || process.env.YOUTICK_SPONSORED_CANARY_ACK === SPONSORED_LIVE_ACK
      || process.env.YOUTICK_SPONSORED_RECOVERY_ACK === SPONSORED_RECOVERY_LIVE_ACK) {
      throw new Error('sponsored_second_key_exception_scope_invalid');
    }
    await requireDisabledBridge();
    process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
    process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID = MARKET_ID;
    process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = ACCESS_ID;
    process.env.NEXT_PUBLIC_APP_URL = APP_ORIGIN;
    process.env.NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1 = 'false';
    process.env.NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS = 'false';

    let recoverySha256 = '';
    try { recoverySha256 = sha256(readFileSync(SPONSORED_RECOVERY_FILE)); } catch {}
    if (recoverySha256 !== SPONSORED_SECOND_KEY_INCIDENT_RECOVERY_SHA256) {
      throw new Error('sponsored_second_key_incident_invalid');
    }
    const input = LOCKED_INPUTS[0];
    const recovery = new RecoveryStorage(SPONSORED_RECOVERY_FILE, true);
    const session = sponsoredRecoverySession(recovery, input.accountId);
    Object.defineProperty(globalThis, 'window', {
      value: { location: { origin: APP_ORIGIN } }, configurable: true,
    });
    const near = await import('near-api-js');
    const { getSplitTransactionProvider } = await import('@/lib/rpc-failover');
    const provider = getSplitTransactionProvider();
    const readJob = async () => readFinalView(
      provider, MARKET_ID, 'get_media_job', { job_id: session.jobId },
    ) as Promise<RecoveryJob>;

    try {
      const storedKey = near.KeyPair.fromString(session.secretKey as never);
      if (storedKey.getPublicKey().toString() !== session.publicKey) throw new Error();
      const [governance, publication, firstReplacement] = await Promise.all([
        readFinalView(provider, MARKET_ID, 'get_governance_state'),
        readFinalView(provider, MARKET_ID, 'get_publication', { publication_id: session.jobId }),
        provider.viewTransactionStatus({
          txHash: SPONSORED_SECOND_KEY_INCIDENT_TX_HASH,
          accountId: input.accountId,
          waitUntil: 'FINAL',
        }),
      ]);
      if (!governance || typeof governance !== 'object'
        || (governance as { new_purchases_paused?: unknown }).new_purchases_paused !== true
        || publication !== null) throw new Error();

      const credential = loadCredential(
        join(homedir(), `.near-credentials/testnet/${input.accountId}.json`),
        input.accountId,
        near.KeyPair,
      );
      await requireFinalFullAccessKey(provider, input.accountId, credential.getPublicKey().toString());
      const account = new near.Account(input.accountId, provider, new near.KeyPairSigner(credential));
      let replacementCalls = 0;
      const refreshed = await replaceLostSponsoredRecoveryKey({
        storage: recovery,
        session,
        accountId: input.accountId,
        expectedSourceBytes: input.sourceBytes,
        exceptionAck: process.env.YOUTICK_SPONSORED_SECOND_KEY_EXCEPTION_ACK,
        firstReplacement,
        nowMs: Date.now(),
        createKey: () => {
          const key = near.KeyPair.fromRandom('ed25519');
          return { secretKey: key.toString(), publicKey: key.getPublicKey().toString() };
        },
        readJob,
        replaceKey: async (replacement) => {
          replacementCalls += 1;
          await account.signAndSendTransaction(
            recoveryKeyReplacementTransaction(replacement, near.actions.functionCall),
          );
        },
      });
      const [jobAfter, publicationAfter] = await Promise.all([
        readJob(),
        readFinalView(provider, MARKET_ID, 'get_publication', { publication_id: session.jobId }),
      ]);
      const persisted = sponsoredRecoverySession(
        new RecoveryStorage(SPONSORED_RECOVERY_FILE, true),
        input.accountId,
      );
      if (replacementCalls !== 1
        || !exactRecoveryJob(jobAfter, refreshed, input.accountId, input.sourceBytes)
        || publicationAfter !== null
        || persisted.publicKey !== refreshed.publicKey
        || persisted.uploadKeyExpiresAtMs !== refreshed.uploadKeyExpiresAtMs
        || (lstatSync(SPONSORED_RECOVERY_FILE).mode & 0o777) !== 0o600) throw new Error();
      console.log(JSON.stringify({
        schema: 'youtick.sponsored-second-key-exception.v1',
        status: 'PASS', replacements: 1, payments: 0, jobs: 0,
        provider_resources: 0, publications: 0,
        job_fingerprint: sha256(session.jobId),
        first_replacement_tx_fingerprint: sha256(SPONSORED_SECOND_KEY_INCIDENT_TX_HASH),
      }));
    } catch {
      throw new Error(
        `sponsored_second_key_exception_failed_recovery_retained=${existsSync(SPONSORED_RECOVERY_FILE)}`,
      );
    }
  },
  5 * 60 * 1000,
);

test.skipIf(
  process.env.YOUTICK_SPONSORED_CANARY_ACK !== SPONSORED_LIVE_ACK
  && process.env.YOUTICK_SPONSORED_RECOVERY_ACK !== SPONSORED_RECOVERY_LIVE_ACK,
)(
  'runs one exact sponsored Preview payment or paid-job recovery canary',
  async () => {
    if (process.env.CI) throw new Error('sponsored_canary_local_only');
    const recoveryMode = process.env.YOUTICK_SPONSORED_RECOVERY_ACK
      === SPONSORED_RECOVERY_LIVE_ACK;
    if (recoveryMode && process.env.YOUTICK_SPONSORED_CANARY_ACK === SPONSORED_LIVE_ACK) {
      throw new Error('sponsored_canary_scope_invalid');
    }
    const expectedBridgeVersion = requiredUuid('YOUTICK_EXPECTED_BRIDGE_VERSION');
    const relayerAccountId = recoveryMode
      ? null
      : requiredTestnetAccount('YOUTICK_SPONSOR_RELAYER_ACCOUNT_ID');
    const input = LOCKED_INPUTS[0];
    const media = loadLockedMedia(input);
    const recovery = new RecoveryStorage(SPONSORED_RECOVERY_FILE, recoveryMode);
    let recovered = recoveryMode
      ? sponsoredRecoverySession(recovery, input.accountId)
      : null;
    const jobId = recovered?.jobId ?? requiredJobId('YOUTICK_SPONSORED_JOB_ID');
    await requireEnabledBridge(expectedBridgeVersion, true, jobId);

    process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
    process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID = MARKET_ID;
    process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = ACCESS_ID;
    process.env.NEXT_PUBLIC_APP_URL = APP_ORIGIN;
    process.env.NEXT_PUBLIC_LIVEPEER_BRIDGE_URL = BRIDGE_ORIGIN;
    process.env.NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1 = 'true';
    process.env.NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS = 'true';

    Object.defineProperty(globalThis, 'sessionStorage', { value: recovery, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: recovery, configurable: true });
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: { origin: APP_ORIGIN },
        sessionStorage: recovery,
        localStorage: recovery,
        crypto: globalThis.crypto,
      },
      configurable: true,
    });
    const near = await import('near-api-js');
    const upload = await import('@/lib/livepeer-upload');
    const publication = await import('@/lib/livepeer-publication');
    const { getSplitTransactionProvider } = await import('@/lib/rpc-failover');
    const provider = getSplitTransactionProvider();
    if (recovered) {
      try {
        const recoveryKeyPair = near.KeyPair.fromString(recovered.secretKey as never);
        if (recoveryKeyPair.getPublicKey().toString() !== recovered.publicKey) throw new Error();
      } catch {
        throw new Error('sponsored_recovery_failed:key_refresh');
      }
      if (recovered.refreshRequired
        && process.env.YOUTICK_SPONSORED_RECOVERY_KEY_REFRESH_ACK
          !== SPONSORED_RECOVERY_KEY_REFRESH_ACK) {
        throw new Error('sponsored_recovery_failed:key_refresh');
      }
    }
    let paymentAccount: import('near-api-js').Account | null = null;
    let recoveryAccount: import('near-api-js').Account | null = null;
    if (!recoveryMode) {
      const credentialPath = join(
        homedir(),
        `.near-credentials/testnet/${input.accountId}.json`,
      );
      const keyPair = loadCredential(credentialPath, input.accountId, near.KeyPair);
      await requireFinalFullAccessKey(provider, input.accountId, keyPair.getPublicKey().toString());
      paymentAccount = new near.Account(input.accountId, provider, new near.KeyPairSigner(keyPair));
    }
    const source = upload.validateLivepeerSourceFile(media.file);
    if (!source.ok || source.sourceType !== 'mp4'
      || upload.livepeerUploadFeeUsdc(media.file.size) !== FEE_USDC) {
      throw new Error('sponsored_canary_media_policy_invalid');
    }
    const readRecoveryJob = async () => readFinalView(
      provider,
      MARKET_ID,
      'get_media_job',
      { job_id: jobId },
    ) as Promise<RecoveryJob>;
    const fingerprint = await upload.fingerprintLivepeerSource(media.file);
    const wallet = {
      signAndSendTransaction: async () => {
        throw new Error('sponsored_canary_normal_transaction_forbidden');
      },
      signDelegateActions: async ({ delegateActions, blockHeightTtl = 200 }: {
        delegateActions: Array<{ receiverId: string; actions: unknown[] }>;
        blockHeightTtl?: number;
      }) => ({
        signedDelegateActions: await Promise.all(delegateActions.map(async (delegate) => {
          if (recoveryMode || !paymentAccount) throw new Error('sponsored_recovery_payment_forbidden');
          const signed = await paymentAccount.createSignedMetaTransaction({
            receiverId: delegate.receiverId,
            actions: delegate.actions as never,
            blockHeightTtl,
          });
          return near.base64Encode(near.encodeSignedDelegate(signed.signedDelegate));
        })),
      }),
    };
    const participant = {
      accountId: input.accountId,
      jobId,
      sourceBytes: input.sourceBytes,
      feeUsdc: FEE_USDC,
    };
    const restoreFetch = installBridgeOriginFetch();

    try {
      const receipt = await runSponsoredOne(participant, {
        preflight: async () => {
          const job = recoveryMode
            ? await readRecoveryJob()
            : await publication.readLivepeerMediaJob(jobId);
          if (recoveryMode) {
            if (!recovered || !exactRecoveryJob(job, recovered, input.accountId, input.sourceBytes)) {
              throw new Error('sponsored_recovery_job_invalid');
            }
          } else if (job !== null) {
            throw new Error('sponsored_canary_job_exists');
          }
          const governance = await readFinalView(provider, MARKET_ID, 'get_governance_state');
          if (!governance || typeof governance !== 'object'
            || (governance as { new_purchases_paused?: unknown }).new_purchases_paused
              !== recoveryMode) {
            throw new Error(recoveryMode
              ? 'sponsored_recovery_market_open'
              : 'sponsored_canary_market_paused');
          }
          if (relayerAccountId) {
            const relayer = await provider.query({
              request_type: 'view_account', finality: 'final', account_id: relayerAccountId,
            }) as { amount?: unknown };
            if (typeof relayer.amount !== 'string' || BigInt(relayer.amount) <= 0n) {
              throw new Error('sponsored_canary_relayer_unfunded');
            }
          }
          await upload.preflightLivepeerUpload({
            accountId: input.accountId,
            jobId,
            generation: 1,
            expectedSourceBytes: input.sourceBytes,
          });
          const balances = await upload.readCreatorFeeBalances(input.accountId);
          return {
            usdcBalance: balances.usdcBalance,
            platformBalance: String(await readFinalView(provider, MARKET_ID, 'get_platform_balance')),
            publicationCount: await publication.readLivepeerPublicationsCount(),
          };
        },
        authorize: async () => {
          if (!recoveryMode) {
            return upload.authorizeLivepeerPaidJob(wallet as never, {
              accountId: input.accountId,
              jobId,
              title: 'Sponsored upload canary',
              priceUsdc: '2000000',
              expectedSourceBytes: input.sourceBytes,
              asset: 'USDC',
              allowSponsoredUsdc: true,
            });
          }
          if (!recovered) throw new Error('sponsored_recovery_failed:key_refresh');
          try {
            recovered = await refreshSponsoredRecoverySession({
              storage: recovery,
              session: recovered,
              accountId: input.accountId,
              expectedSourceBytes: input.sourceBytes,
              refreshAck: process.env.YOUTICK_SPONSORED_RECOVERY_KEY_REFRESH_ACK,
              nowMs: Date.now(),
              createKey: () => {
                const keyPair = near.KeyPair.fromRandom('ed25519');
                return {
                  secretKey: keyPair.toString(),
                  publicKey: keyPair.getPublicKey().toString(),
                };
              },
              readJob: readRecoveryJob,
              replaceKey: async (replacement) => {
                if (!recoveryAccount) {
                  const credentialPath = join(
                    homedir(),
                    `.near-credentials/testnet/${input.accountId}.json`,
                  );
                  const keyPair = loadCredential(credentialPath, input.accountId, near.KeyPair);
                  await requireFinalFullAccessKey(
                    provider,
                    input.accountId,
                    keyPair.getPublicKey().toString(),
                  );
                  recoveryAccount = new near.Account(
                    input.accountId,
                    provider,
                    new near.KeyPairSigner(keyPair),
                  );
                }
                await recoveryAccount.signAndSendTransaction(
                  recoveryKeyReplacementTransaction(replacement, near.actions.functionCall),
                );
              },
            });
            return recovered.publicKey;
          } catch {
            throw new Error('sponsored_recovery_failed:key_refresh');
          }
        },
        waitForJob: (uploadPublicKey) => publication.waitForAuthorizedLivepeerJob(
          jobId, input.accountId, uploadPublicKey,
        ),
        requestIntent: async () => {
          const intent = await upload.requestLivepeerUploadIntent({
            accountId: input.accountId,
            jobId,
            generation: 1,
            expectedSourceBytes: input.sourceBytes,
            sourceFingerprintSha256: fingerprint,
            sourceType: 'mp4',
          });
          return {
            created: intent.created,
            endpointFingerprint: sha256(intent.tus_endpoint),
            value: intent,
          };
        },
        upload: (intent) => upload.uploadLivepeerSource(media.file, intent as never, {
          heartbeat: () => upload.heartbeatLivepeerUploadLease({
            accountId: input.accountId,
            intent: intent as never,
          }),
        }),
        waitForPublication: () => waitForPublication(publication, jobId, input.accountId),
        readAfter: async () => ({
          usdcBalance: (await upload.readCreatorFeeBalances(input.accountId)).usdcBalance,
          platformBalance: String(await readFinalView(provider, MARKET_ID, 'get_platform_balance')),
          publicationCount: await publication.readLivepeerPublicationsCount(),
        }),
      }, recoveryMode ? 'recovery' : 'new');
      upload.clearLivepeerJobSessionKey(input.accountId, jobId);
      if (recovery.length !== 0 || existsSync(SPONSORED_RECOVERY_FILE)) {
        throw new Error('sponsored_canary_recovery_cleanup_failed');
      }
      console.log(JSON.stringify({
        ...receipt,
        creator_fingerprint: sha256(input.accountId),
        ...(relayerAccountId ? { relayer_fingerprint: sha256(relayerAccountId) } : {}),
        job_fingerprint: sha256(jobId),
        media_sha256: input.sourceSha256,
      }));
    } catch (error) {
      throw new Error(
        `sponsored_canary_failed_code=${sponsoredCanaryFailureCode(error)}`
        + `_recovery_retained=${existsSync(SPONSORED_RECOVERY_FILE)}`,
      );
    } finally {
      restoreFetch();
    }
  },
  20 * 60 * 1000,
);

function loadLockedMedia(input: (typeof LOCKED_INPUTS)[number]) {
  const filePath = process.env[input.mediaEnv];
  if (!filePath || !isAbsolute(filePath)) throw new Error('multi_creator_canary_media_path_invalid');
  const stat = lstatSync(filePath);
  if (!stat.isFile() || stat.size !== input.sourceBytes) {
    throw new Error('multi_creator_canary_media_invalid');
  }
  const bytes = readFileSync(filePath);
  if (sha256(bytes) !== input.sourceSha256) throw new Error('multi_creator_canary_media_invalid');
  return {
    file: nodeTusFile(bytes, basename(filePath), Math.trunc(stat.mtimeMs)),
  };
}

function nodeTusFile(bytes: Buffer, name: string, lastModified: number): File {
  return Object.assign(bytes, {
    name, type: 'video/mp4', lastModified, size: bytes.length,
  }) as unknown as File;
}

function loadCredential(
  filePath: string,
  accountId: string,
  KeyPair: typeof import('near-api-js').KeyPair,
) {
  const stat = lstatSync(filePath);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0) {
    throw new Error('multi_creator_canary_credential_permissions_invalid');
  }
  const value = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  if (typeof value.private_key !== 'string' || typeof value.public_key !== 'string') {
    throw new Error('multi_creator_canary_credential_invalid');
  }
  const keyPair = KeyPair.fromString(value.private_key as never);
  if (keyPair.getPublicKey().toString() !== value.public_key || !accountId.endsWith('.testnet')) {
    throw new Error('multi_creator_canary_credential_invalid');
  }
  return keyPair;
}

async function requireFinalFullAccessKey(
  provider: { query(input: Record<string, unknown>): Promise<unknown> },
  accountId: string,
  publicKey: string,
) {
  const value = await provider.query({
    request_type: 'view_access_key',
    finality: 'final',
    account_id: accountId,
    public_key: publicKey,
  }) as { permission?: unknown };
  if (value.permission !== 'FullAccess') {
    throw new Error('multi_creator_canary_chain_key_invalid');
  }
}

async function requireEnabledBridge(
  expectedVersion: string,
  sponsored = false,
  expectedOperatorJobId?: string,
) {
  let response: Response;
  let value: Record<string, unknown>;
  try {
    response = await fetch(`${BRIDGE_ORIGIN}/__health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    value = await response.json() as Record<string, unknown>;
  } catch {
    throw new Error('multi_creator_canary_bridge_unavailable');
  }
  if (!response.ok
    || value.versionId !== expectedVersion
    || value.stage !== 'ENABLED'
    || value.providerMutationEnabled !== true
    || value.newUploadReady !== true
    || (sponsored && (value.sponsoredUploadQuoteReady !== true
      || value.sponsoredUploadRelayReady !== true
      || value.operatorMutationEnabled !== true
      || value.operatorJobFingerprint !== sha256(expectedOperatorJobId || '')))) {
    throw new Error('multi_creator_canary_bridge_not_ready');
  }
}

async function requireDisabledBridge() {
  let response: Response;
  let value: Record<string, unknown>;
  try {
    response = await fetch(`${BRIDGE_ORIGIN}/__health`, {
      cache: 'no-store', signal: AbortSignal.timeout(10_000),
    });
    value = await response.json() as Record<string, unknown>;
  } catch {
    throw new Error('sponsored_second_key_preview_unavailable');
  }
  if (!response.ok
    || value.stage !== 'DISABLED'
    || value.providerMutationEnabled !== false
    || value.operatorMutationEnabled !== false
    || (value.operatorJobFingerprint !== null && value.operatorJobFingerprint !== undefined)
    || value.newUploadReady !== false
    || value.controlPlaneReady !== false
    || value.sponsoredUploadQuoteReady !== false
    || value.sponsoredUploadRelayReady !== false
    || value.playbackReady !== false
    || value.playbackV2Ready !== false
    || value.playbackShadowV2Ready !== false
    || value.webhookQueueReady !== false
    || value.uploadJobArchiveReady !== false
    || value.operatorOutboxArchiveReady !== false) {
    throw new Error('sponsored_second_key_preview_not_closed');
  }
}

function requiredUuid(name: string): string {
  const value = process.env[name];
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    throw new Error('multi_creator_canary_expected_version_invalid');
  }
  return value;
}

function requiredJobId(name: string): string {
  const value = process.env[name];
  if (!value || !/^[A-Za-z0-9._:-]{1,128}$/.test(value)) {
    throw new Error('sponsored_canary_job_invalid');
  }
  return value;
}

function requiredTestnetAccount(name: string): string {
  const value = process.env[name];
  if (!value || !/^[a-z0-9][a-z0-9._-]{0,62}\.testnet$/.test(value)) {
    throw new Error('sponsored_canary_relayer_account_invalid');
  }
  return value;
}

function installBridgeOriginFetch(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (input, init = {}) => {
    const url = input instanceof Request ? input.url : String(input);
    if (new URL(url).origin !== BRIDGE_ORIGIN) return original(input, init);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    headers.set('Origin', APP_ORIGIN);
    return original(input, { ...init, headers });
  };
  return () => { globalThis.fetch = original; };
}

async function readFinalView(
  provider: { query(input: Record<string, unknown>): Promise<unknown> },
  accountId: string,
  methodName: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const value = await provider.query({
    request_type: 'call_function',
    finality: 'final',
    account_id: accountId,
    method_name: methodName,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
  }) as { result?: unknown };
  if (!Array.isArray(value.result)) throw new Error('sponsored_canary_view_invalid');
  try {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(value.result)));
  } catch {
    throw new Error('sponsored_canary_view_invalid');
  }
}

async function waitForPublication(
  publication: typeof import('@/lib/livepeer-publication'),
  jobId: string,
  accountId: string,
): Promise<void> {
  const deadline = Date.now() + 18 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const progress = await publication.readLivepeerUploadProgress(jobId);
      if (progress.job.status === 'Published'
        && progress.publication?.creator_id === accountId
        && progress.publication.availability === 'ACTIVE') return;
    } catch {
      // Provider finalization and final chain state can lag during the canary.
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error('sponsored_canary_publication_pending');
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function sponsoredCanaryFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return SPONSORED_RELAY_FAILURE_PATTERN.test(message)
    || SPONSORED_RECOVERY_FAILURE_PATTERN.test(message)
    ? message
    : 'unknown';
}

function sponsoredRecoverySession(
  storage: Storage,
  accountId: string,
  nowMs = Date.now(),
): SponsoredRecoverySession {
  const prefix = `youtick:livepeer-job-session:${accountId}:`;
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => typeof key === 'string' && key.startsWith(prefix));
  if (keys.length !== 1) throw new Error('sponsored_recovery_session_invalid');
  const jobId = keys[0].slice(prefix.length);
  let session: Record<string, unknown>;
  try {
    session = JSON.parse(storage.getItem(keys[0]) || 'null') as Record<string, unknown>;
  } catch {
    throw new Error('sponsored_recovery_session_invalid');
  }
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(jobId)
    || !session || typeof session !== 'object'
    || typeof session.secretKey !== 'string'
    || !session.secretKey.startsWith('ed25519:')
    || typeof session.publicKey !== 'string'
    || !session.publicKey.startsWith('ed25519:')
    || typeof session.uploadKeyExpiresAtMs !== 'string'
    || !/^[1-9][0-9]{0,15}$/.test(session.uploadKeyExpiresAtMs)
    || (session.sponsoredDelegateBase64 !== undefined
      && (typeof session.sponsoredDelegateBase64 !== 'string'
        || session.sponsoredDelegateBase64.length < 64
        || session.sponsoredDelegateBase64.length % 4 !== 0
        || !/^[A-Za-z0-9+/]+={0,2}$/.test(session.sponsoredDelegateBase64)))) {
    throw new Error('sponsored_recovery_session_invalid');
  }
  const expiresAtMs = Number(session.uploadKeyExpiresAtMs);
  return {
    storageKey: keys[0],
    jobId,
    secretKey: session.secretKey,
    publicKey: session.publicKey,
    uploadKeyExpiresAtMs: session.uploadKeyExpiresAtMs,
    refreshRequired: expiresAtMs - nowMs < RECOVERY_KEY_MIN_TTL_MS,
  };
}

function recoveryKeyReplacementTransaction<T>(input: {
  jobId: string;
  newPublicKey: string;
  expiresAtMs: string;
}, functionCall: (
  methodName: string,
  args: Record<string, string>,
  gas: bigint,
  deposit: bigint,
) => T) {
  return {
    receiverId: MARKET_ID,
    waitUntil: 'FINAL' as const,
    retries: 0,
    actions: [functionCall('replace_upload_key', {
      job_id: input.jobId,
      new_public_key: input.newPublicKey,
      expires_at_ms: input.expiresAtMs,
    }, RECOVERY_KEY_REPLACEMENT_GAS, 0n)],
  };
}

async function refreshSponsoredRecoverySession({
  storage,
  session,
  accountId,
  expectedSourceBytes,
  refreshAck,
  nowMs,
  createKey,
  readJob,
  replaceKey,
  wait = (delayMs) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)),
}: {
  storage: Storage;
  session: SponsoredRecoverySession;
  accountId: string;
  expectedSourceBytes: number;
  refreshAck?: string;
  nowMs: number;
  createKey(): { secretKey: string; publicKey: string };
  readJob(): Promise<RecoveryJob>;
  replaceKey(input: { jobId: string; newPublicKey: string; expiresAtMs: string }): Promise<void>;
  wait?(delayMs: number): Promise<void>;
}): Promise<SponsoredRecoverySession> {
  if (!session.refreshRequired) return session;
  if (refreshAck !== SPONSORED_RECOVERY_KEY_REFRESH_ACK) {
    throw new Error('sponsored_recovery_key_refresh_ack_required');
  }
  const before = await readJob();
  if (!exactRecoveryJob(before, session, accountId, expectedSourceBytes)) {
    throw new Error('sponsored_recovery_key_refresh_job_invalid');
  }
  const key = createKey();
  if (!key.secretKey.startsWith('ed25519:') || !key.publicKey.startsWith('ed25519:')) {
    throw new Error('sponsored_recovery_key_refresh_key_invalid');
  }
  const expiresAtMs = String(nowMs + RECOVERY_KEY_TTL_MS);
  const refreshed = {
    ...session,
    secretKey: key.secretKey,
    publicKey: key.publicKey,
    uploadKeyExpiresAtMs: expiresAtMs,
    refreshRequired: false,
  };
  try {
    await replaceKey({ jobId: session.jobId, newPublicKey: key.publicKey, expiresAtMs });
  } catch {
    // Reconcile bounded final reads; never retry the transaction.
    let confirmed = false;
    for (const delayMs of RECOVERY_KEY_RECONCILIATION_DELAYS_MS) {
      if (delayMs > 0) await wait(delayMs);
      try {
        if (exactRecoveryJob(await readJob(), refreshed, accountId, expectedSourceBytes)) {
          confirmed = true;
          break;
        }
      } catch {
        // A later bounded final read may observe the confirmed replacement.
      }
    }
    if (!confirmed) {
      throw new Error('sponsored_recovery_key_refresh_unconfirmed');
    }
  }
  storage.setItem(session.storageKey, JSON.stringify({
    secretKey: key.secretKey,
    publicKey: key.publicKey,
    uploadKeyExpiresAtMs: expiresAtMs,
  }));
  return refreshed;
}

async function replaceLostSponsoredRecoveryKey({
  storage,
  session,
  accountId,
  expectedSourceBytes,
  exceptionAck,
  firstReplacement,
  incidentJobSha256 = SPONSORED_SECOND_KEY_INCIDENT_JOB_SHA256,
  nowMs,
  createKey,
  readJob,
  replaceKey,
}: {
  storage: Storage;
  session: SponsoredRecoverySession;
  accountId: string;
  expectedSourceBytes: number;
  exceptionAck?: string;
  firstReplacement: unknown;
  incidentJobSha256?: string;
  nowMs: number;
  createKey(): { secretKey: string; publicKey: string };
  readJob(): Promise<RecoveryJob>;
  replaceKey(input: { jobId: string; newPublicKey: string; expiresAtMs: string }): Promise<void>;
}): Promise<SponsoredRecoverySession> {
  if (exceptionAck !== SPONSORED_SECOND_KEY_EXCEPTION_ACK) {
    throw new Error('sponsored_second_key_exception_ack_required');
  }
  const job = await readJob();
  assertSponsoredSecondKeyIncident({
    session, accountId, expectedSourceBytes, job,
    transaction: firstReplacement, incidentJobSha256,
  });
  return refreshSponsoredRecoverySession({
    storage,
    session: {
      ...session,
      publicKey: String(job!.upload_public_key),
      uploadKeyExpiresAtMs: String(job!.upload_key_expires_at_ms),
      refreshRequired: true,
    },
    accountId,
    expectedSourceBytes,
    refreshAck: SPONSORED_RECOVERY_KEY_REFRESH_ACK,
    nowMs,
    createKey,
    readJob,
    replaceKey,
  });
}

function assertSponsoredSecondKeyIncident({
  session, accountId, expectedSourceBytes, job, transaction, incidentJobSha256,
}: {
  session: SponsoredRecoverySession;
  accountId: string;
  expectedSourceBytes: number;
  job: RecoveryJob;
  transaction: unknown;
  incidentJobSha256: string;
}) {
  const invalid = (): never => { throw new Error('sponsored_second_key_incident_invalid'); };
  if (sha256(session.jobId) !== incidentJobSha256
    || !job
    || job.job_id !== session.jobId
    || job.generation !== 1
    || job.status !== 'Authorized'
    || job.creator_id !== accountId
    || job.fee_asset !== 'USDC'
    || String(job.expected_source_bytes) !== String(expectedSourceBytes)
    || typeof job.upload_public_key !== 'string'
    || !job.upload_public_key.startsWith('ed25519:')
    || !/^[1-9][0-9]{0,15}$/.test(String(job.upload_key_expires_at_ms))
    || job.upload_public_key === session.publicKey
    || String(job.upload_key_expires_at_ms) === session.uploadKeyExpiresAtMs
    || !transaction || typeof transaction !== 'object' || Array.isArray(transaction)) invalid();

  const current = job as NonNullable<RecoveryJob>;
  const evidence = transaction as Record<string, unknown>;
  const status = evidence.status as Record<string, unknown> | undefined;
  const tx = evidence.transaction as Record<string, unknown> | undefined;
  const actions = tx?.actions;
  if (!status || (!Object.hasOwn(status, 'SuccessValue') && !Object.hasOwn(status, 'SuccessReceiptId'))
    || !tx
    || tx.hash !== SPONSORED_SECOND_KEY_INCIDENT_TX_HASH
    || tx.signer_id !== accountId
    || tx.receiver_id !== MARKET_ID
    || !Array.isArray(actions) || actions.length !== 1) invalid();
  const call = ((actions as unknown[])[0] as Record<string, unknown>)
    ?.FunctionCall as Record<string, unknown> | undefined;
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(Buffer.from(String(call?.args), 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    invalid();
  }
  if (!call
    || call.method_name !== 'replace_upload_key'
    || String(call.gas) !== String(RECOVERY_KEY_REPLACEMENT_GAS)
    || String(call.deposit) !== '0'
    || args!.job_id !== session.jobId
    || args!.new_public_key !== current.upload_public_key
    || String(args!.expires_at_ms) !== String(current.upload_key_expires_at_ms)) invalid();
  const logs = Array.isArray(evidence.receipts_outcome)
    ? evidence.receipts_outcome.flatMap((entry) => {
      const outcome = entry && typeof entry === 'object' && !Array.isArray(entry)
        ? (entry as Record<string, unknown>).outcome as Record<string, unknown> | undefined
        : undefined;
      return Array.isArray(outcome?.logs) ? outcome.logs : [];
    })
    : [];
  if (!logs.some((log) => typeof log === 'string'
    && log.includes('media_job_upload_key_replaced')
    && log.includes(session.jobId)
    && log.includes(sha256(String(current.upload_public_key)))
    && log.includes(String(current.upload_key_expires_at_ms)))) invalid();
}

function exactRecoveryJob(
  job: RecoveryJob,
  session: SponsoredRecoverySession,
  accountId: string,
  expectedSourceBytes: number,
): job is NonNullable<RecoveryJob> {
  return Boolean(job
    && job.job_id === session.jobId
    && job.generation === 1
    && job.status === 'Authorized'
    && job.creator_id === accountId
    && job.fee_asset === 'USDC'
    && String(job.expected_source_bytes) === String(expectedSourceBytes)
    && job.upload_public_key === session.publicKey
    && String(job.upload_key_expires_at_ms) === session.uploadKeyExpiresAtMs);
}

function recoveryJob(
  session: SponsoredRecoverySession,
  accountId: string,
  expectedSourceBytes: number,
): NonNullable<RecoveryJob> {
  return {
    job_id: session.jobId,
    generation: 1,
    status: 'Authorized',
    creator_id: accountId,
    fee_asset: 'USDC',
    expected_source_bytes: String(expectedSourceBytes),
    upload_public_key: session.publicKey,
    upload_key_expires_at_ms: session.uploadKeyExpiresAtMs,
  };
}

function replacementEvidenceFixture(job: NonNullable<RecoveryJob>, accountId: string) {
  const args = {
    job_id: job.job_id,
    new_public_key: job.upload_public_key,
    expires_at_ms: String(job.upload_key_expires_at_ms),
  };
  return {
    status: { SuccessValue: '' },
    transaction: {
      hash: SPONSORED_SECOND_KEY_INCIDENT_TX_HASH,
      signer_id: accountId,
      receiver_id: MARKET_ID,
      actions: [{ FunctionCall: {
        method_name: 'replace_upload_key',
        args: Buffer.from(JSON.stringify(args)).toString('base64'),
        gas: String(RECOVERY_KEY_REPLACEMENT_GAS),
        deposit: '0',
      } }],
    },
    receipts_outcome: [{ outcome: { logs: [
      `EVENT_JSON:${JSON.stringify({
        event: 'media_job_upload_key_replaced',
        data: [{
          account_id: accountId,
          job_id: job.job_id,
          generation: 1,
          upload_public_key_sha256: sha256(String(job.upload_public_key)),
          upload_key_expires_at_ms: String(job.upload_key_expires_at_ms),
        }],
      })}`,
    ] } }],
  };
}

function makeRecoveryFixture(expiresInMs: number, includeDelegate = false) {
  const nowMs = 1_800_000_000_000;
  const directory = mkdtempSync(join(tmpdir(), 'youtick-sponsored-recovery-'));
  const filePath = join(directory, 'recovery.json');
  const accountId = 'creator.testnet';
  const jobId = 'job-recovery';
  const storageKey = `youtick:livepeer-job-session:${accountId}:${jobId}`;
  const original = JSON.stringify({
    [storageKey]: JSON.stringify({
      secretKey: 'ed25519:fixture-secret',
      publicKey: 'ed25519:fixture-public',
      uploadKeyExpiresAtMs: String(nowMs + expiresInMs),
      ...(includeDelegate ? { sponsoredDelegateBase64: 'A'.repeat(64) } : {}),
    }),
  });
  writeFileSync(filePath, original, { mode: 0o600 });
  const storage = new RecoveryStorage(filePath, true);
  return {
    nowMs,
    directory,
    filePath,
    accountId,
    jobId,
    storageKey,
    original,
    storage,
    session: sponsoredRecoverySession(storage, accountId, nowMs),
    cleanup: () => rmSync(directory, { recursive: true }),
  };
}

class RecoveryStorage implements Storage {
  readonly #values = new Map<string, string>();

  constructor(readonly filePath: string, loadExisting = false) {
    if (!loadExisting) {
      if (existsSync(filePath)) throw new Error('multi_creator_canary_recovery_pending');
      return;
    }
    let values: Record<string, unknown>;
    try {
      const stat = lstatSync(filePath);
      values = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
      if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0
        || !values || typeof values !== 'object' || Array.isArray(values)
        || Object.keys(values).length < 1
        || Object.values(values).some((value) => typeof value !== 'string')) {
        throw new Error('invalid');
      }
    } catch {
      throw new Error('sponsored_recovery_file_invalid');
    }
    Object.entries(values).forEach(([key, value]) => this.#values.set(key, value as string));
  }

  get length() { return this.#values.size; }

  clear() {
    this.#values.clear();
    this.#persist();
  }

  getItem(key: string) { return this.#values.get(String(key)) ?? null; }

  key(index: number) { return Array.from(this.#values.keys())[index] ?? null; }

  removeItem(key: string) {
    this.#values.delete(String(key));
    this.#persist();
  }

  setItem(key: string, value: string) {
    this.#values.set(String(key), String(value));
    this.#persist();
  }

  #persist() {
    if (this.#values.size === 0) {
      if (existsSync(this.filePath)) unlinkSync(this.filePath);
      return;
    }
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(Object.fromEntries(this.#values)), {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      renameSync(temporary, this.filePath);
      chmodSync(this.filePath, 0o600);
    } catch (error) {
      if (existsSync(temporary)) unlinkSync(temporary);
      throw error;
    }
  }
}
