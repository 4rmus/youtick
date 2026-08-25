import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { homedir } from 'node:os';
import { File as NodeFile } from 'node:buffer';
import { expect, test } from 'vitest';

const LIVE_ACK = 'two-nonrefundable-usdc-payments-and-two-uploads';
const MARKET_ID = 'lp-arch-market-v2-260809.youtick-dev-v3.testnet';
const ACCESS_ID = 'lp-arch-access-v2-260809.youtick-dev-v3.testnet';
const APP_ORIGIN = 'https://preview.youtick.net';
const BRIDGE_ORIGIN = 'https://bridge-preview.youtick.net';
const STARTING_USDC = '20000000';
const FEE_USDC = '500000';
const RECOVERY_FILE = join(
  homedir(),
  '.near-credentials/testnet/.youtick-phase3-multi-creator-recovery.json',
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
    Object.defineProperty(globalThis, 'window', {
      value: { location: { origin: APP_ORIGIN }, sessionStorage: recovery, crypto: globalThis.crypto },
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

async function requireEnabledBridge(expectedVersion: string) {
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
    || value.newUploadReady !== true) {
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

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

class RecoveryStorage implements Storage {
  readonly #values = new Map<string, string>();

  constructor(readonly filePath: string) {
    if (existsSync(filePath)) throw new Error('multi_creator_canary_recovery_pending');
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
