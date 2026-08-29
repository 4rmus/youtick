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
import { File as NodeFile } from 'node:buffer';
import { expect, test } from 'vitest';

const LIVE_ACK = 'two-nonrefundable-usdc-payments-and-two-uploads';
const SPONSORED_LIVE_ACK = 'one-sponsored-usdc-payment-upload-and-publication';
const SPONSORED_RECOVERY_LIVE_ACK = 'resume-one-paid-job-without-a-second-payment';
const SPONSORED_RELAY_FAILURE_PATTERN = /^invalid_sponsored_upload_relay:(delegate_decode|delegate_shape|quote_validation|signature_validation|freshness|access_key)$/;
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
  const before = await steps.preflight();
  if (mode === 'new' && BigInt(before.usdcBalance) < BigInt(SPONSORED_TOTAL_FEE_USDC)) {
    throw new Error('sponsored_canary_balance_insufficient');
  }
  const uploadPublicKey = await steps.authorize();
  await steps.waitForJob(uploadPublicKey);
  const intent = await steps.requestIntent();
  if (mode === 'new' && intent.created !== true) throw new Error('sponsored_canary_intent_invalid');
  await steps.upload(intent.value);
  await steps.waitForPublication();
  const after = await steps.readAfter();
  const expectedPaymentDelta = mode === 'new' ? BigInt(SPONSORED_TOTAL_FEE_USDC) : 0n;
  if (BigInt(before.usdcBalance) - BigInt(after.usdcBalance)
      !== expectedPaymentDelta
    || BigInt(after.platformBalance) - BigInt(before.platformBalance)
      !== expectedPaymentDelta
    || after.publicationCount !== before.publicationCount + 1) {
    throw new Error('sponsored_canary_settlement_invalid');
  }
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

test('loads one exact sponsored recovery session without exposing its keys', () => {
  const directory = mkdtempSync(join(tmpdir(), 'youtick-sponsored-recovery-'));
  const filePath = join(directory, 'recovery.json');
  const accountId = 'creator.testnet';
  const jobId = 'job-recovery';
  const publicKey = 'ed25519:11111111111111111111111111111111';
  try {
    writeFileSync(filePath, JSON.stringify({
      [`youtick:livepeer-job-session:${accountId}:${jobId}`]: JSON.stringify({
        secretKey: 'ed25519:secret',
        publicKey,
        uploadKeyExpiresAtMs: String(Date.now() + 60_000),
        sponsoredDelegateBase64: 'A'.repeat(64),
      }),
    }), { mode: 0o600 });

    const recovery = new RecoveryStorage(filePath, true);

    expect(sponsoredRecoverySession(recovery, accountId)).toEqual({ jobId, publicKey });
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test('reports only allowlisted sponsored relay rejection stages', () => {
  expect(sponsoredCanaryFailureCode(new Error(
    'invalid_sponsored_upload_relay:access_key',
  ))).toBe('invalid_sponsored_upload_relay:access_key');
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
    await requireEnabledBridge(expectedBridgeVersion, true);

    process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
    process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID = MARKET_ID;
    process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = ACCESS_ID;
    process.env.NEXT_PUBLIC_APP_URL = APP_ORIGIN;
    process.env.NEXT_PUBLIC_LIVEPEER_BRIDGE_URL = BRIDGE_ORIGIN;
    process.env.NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1 = 'true';
    process.env.NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS = 'true';

    const recovery = new RecoveryStorage(SPONSORED_RECOVERY_FILE, recoveryMode);
    const recovered = recoveryMode
      ? sponsoredRecoverySession(recovery, input.accountId)
      : null;
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
    let account: import('near-api-js').Account | null = null;
    if (!recoveryMode) {
      const credentialPath = join(
        homedir(),
        `.near-credentials/testnet/${input.accountId}.json`,
      );
      const keyPair = loadCredential(credentialPath, input.accountId, near.KeyPair);
      await requireFinalFullAccessKey(provider, input.accountId, keyPair.getPublicKey().toString());
      account = new near.Account(input.accountId, provider, new near.KeyPairSigner(keyPair));
    }
    const source = upload.validateLivepeerSourceFile(media.file);
    if (!source.ok || source.sourceType !== 'mp4'
      || upload.livepeerUploadFeeUsdc(media.file.size) !== FEE_USDC) {
      throw new Error('sponsored_canary_media_policy_invalid');
    }
    const jobId = recovered?.jobId ?? upload.createLivepeerJobId();
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
          if (!account) throw new Error('sponsored_recovery_payment_forbidden');
          const signed = await account.createSignedMetaTransaction({
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
          const job = await publication.readLivepeerMediaJob(jobId);
          if (recoveryMode) {
            if (!job
              || job.status !== 'Authorized'
              || job.creator_id !== input.accountId
              || job.upload_public_key !== recovered?.publicKey) {
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
        authorize: () => recoveryMode
          ? Promise.resolve(recovered!.publicKey)
          : upload.authorizeLivepeerPaidJob(wallet as never, {
            accountId: input.accountId,
            jobId,
            title: 'Sponsored upload canary',
            priceUsdc: '2000000',
            expectedSourceBytes: input.sourceBytes,
            asset: 'USDC',
            allowSponsoredUsdc: true,
          }),
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
    file: new NodeFile([bytes], basename(filePath), {
      type: 'video/mp4',
      lastModified: Math.trunc(stat.mtimeMs),
    }) as unknown as File,
  };
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

async function requireEnabledBridge(expectedVersion: string, sponsored = false) {
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
      || value.sponsoredUploadRelayReady !== true))) {
    throw new Error('multi_creator_canary_bridge_not_ready');
  }
}

function requiredUuid(name: string): string {
  const value = process.env[name];
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    throw new Error('multi_creator_canary_expected_version_invalid');
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
): Promise<unknown> {
  const value = await provider.query({
    request_type: 'call_function',
    finality: 'final',
    account_id: accountId,
    method_name: methodName,
    args_base64: 'e30=',
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
  return SPONSORED_RELAY_FAILURE_PATTERN.test(message) ? message : 'unknown';
}

function sponsoredRecoverySession(storage: Storage, accountId: string) {
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
    || typeof session.publicKey !== 'string'
    || !session.publicKey.startsWith('ed25519:')
    || typeof session.uploadKeyExpiresAtMs !== 'string'
    || !/^[1-9][0-9]{0,15}$/.test(session.uploadKeyExpiresAtMs)
    || BigInt(session.uploadKeyExpiresAtMs) <= BigInt(Date.now())
    || typeof session.sponsoredDelegateBase64 !== 'string') {
    throw new Error('sponsored_recovery_session_invalid');
  }
  return { jobId, publicKey: session.publicKey };
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
