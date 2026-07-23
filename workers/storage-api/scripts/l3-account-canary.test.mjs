import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import l3Vectors from '../../../protocol/l3-verification-v1/golden-vectors.json' with { type: 'json' };
import schema from '../../../protocol/l3-account-canary-v1/schema.json' with { type: 'json' };
import {
  checkL3AccountCanaryEvidence,
  evidenceSchemaSha256,
} from './check-l3-account-canary-evidence.mjs';
import {
  createCanaryInput,
  computeEvidencePayloadSha256,
  parseCanonicalCid,
  presignL3CanaryPut,
  readConfig,
  runL3AccountCanary,
  verifyEvidencePayloadSha256,
  verifyEvidenceDocument,
  writeRecoveryRecord,
} from './l3-account-canary.mjs';

const ACCESS_KEY = 'AKIAIOSFODNN7EXAMPLE';
const SECRET_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
const CID = 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja';
const BODY = new Uint8Array(4 * 1024).fill(7);
const INPUT = createCanaryInput({
  now: new Date('2026-07-23T12:00:00.000Z'),
  body: BODY,
  nonce: 'abcdef123456',
  runId: '12345678-1234-1234-1234-123456789abc',
});
const CONFIG = {
  bucket: 'youtick-canary',
  accessKeyId: ACCESS_KEY,
  secretAccessKey: SECRET_KEY,
  cidGatewayBase: 'https://gateway.example/ipfs',
  recoveryPath: '/private/l3-canary-recovery.json',
  environment: 'DEDICATED_NONPRODUCTION',
};
const SCHEMA_SHA256 = createHash('sha256').update(
  await readFile(
    new URL('../../../protocol/l3-account-canary-v1/schema.json', import.meta.url),
  ),
).digest('hex');
const PROVENANCE = {
  sourceCommit: '0'.repeat(40),
  sourceDirty: true,
  scriptSha256: '1'.repeat(64),
  productionSignerSha256: '3'.repeat(64),
  evidenceSchemaSha256: SCHEMA_SHA256,
  lockfileSha256: '2'.repeat(64),
  runtimeVersion: process.version,
};
const validateSchema = new Ajv2020({
  strict: true,
  formats: {
    uuid: true,
    'date-time': true,
  },
}).compile(schema);

function objectHeaders(ordinal, cid = CID) {
  return {
    'content-length': String(BODY.byteLength),
    'content-type': 'application/octet-stream',
    etag: '"canary-etag"',
    'x-amz-meta-cid': cid,
    'x-amz-meta-youtick-ciphertext-sha256': INPUT.ciphertextSha256,
    'x-amz-meta-youtick-job-id': INPUT.jobId,
    'x-amz-meta-youtick-object-ordinal': String(ordinal),
    location:
      `https://s3.lighthouse.storage/object?X-Amz-Credential=${ACCESS_KEY}`
      + `&X-Amz-Signature=${SECRET_KEY}`,
  };
}

function fakeProvider({
  cid = CID,
  acceptWrongLength = false,
  failReplayRequests = false,
  throwDuringFirstGetBody = false,
  ambiguousInitialPut = false,
  wrongLengthStatus = null,
  postDeleteReplayStatus = null,
  expiredReplayStatus = 403,
  expiredReplayNoResponse = false,
  expiryInitialPutStatus = 200,
  ambiguousExpiryInitialPut = false,
  failExpiryCleanupAuth = false,
  lateExpiryCleanupCommit = false,
} = {}) {
  const requests = [];
  const stored = new Map();
  let positivePutCount = 0;
  let expiryPutCount = 0;
  let positiveGetCount = 0;
  let deleteCount = 0;
  let latePositivePath = null;
  let expiryReplayObserved = false;
  let expiryCleanupDeleteSeen = false;
  let expiryCleanupHeadCount = 0;
  const fetch = async (input, init) => {
    const url = new URL(input);
    const method = init.method;
    const path = url.pathname;
    const requestHeaders = new Headers(init.headers);
    requests.push({
      method,
      path,
      headers: Object.fromEntries(requestHeaders),
      bodyByteLength: init.body?.byteLength ?? null,
      expires: url.searchParams.get('X-Amz-Expires'),
      amzDate: url.searchParams.get('X-Amz-Date'),
    });

    if (url.hostname === 'gateway.example') {
      return new Response(BODY, {
        status: 200,
        headers: {
          'content-length': String(BODY.byteLength),
          'content-type': 'application/octet-stream',
        },
      });
    }
    const ordinal = path.includes('/objects/1-')
      ? 1
      : path.includes('/objects/2-') ? 2 : 0;
    if (ordinal === 2
      && expiryReplayObserved
      && failExpiryCleanupAuth
      && ['HEAD', 'GET', 'DELETE'].includes(method)) {
      return new Response(null, { status: 403 });
    }
    if (method === 'HEAD') {
      if (ordinal === 2 && expiryCleanupDeleteSeen) {
        expiryCleanupHeadCount += 1;
        if (lateExpiryCleanupCommit && expiryCleanupHeadCount === 2) {
          stored.set(path, BODY);
        }
      }
      return stored.has(path)
        ? new Response(null, { status: 200, headers: objectHeaders(ordinal, cid) })
        : new Response(null, { status: 404 });
    }
    if (method === 'GET') {
      positiveGetCount += 1;
      if (throwDuringFirstGetBody && positiveGetCount === 1) {
        return new Response(new ReadableStream({
          pull(controller) {
            controller.error(new Error('synthetic body read failure'));
          },
        }), { status: 200, headers: objectHeaders(ordinal, cid) });
      }
      return stored.has(path)
        ? new Response(BODY, { status: 200, headers: objectHeaders(ordinal, cid) })
        : new Response(null, { status: 404 });
    }
    if (method === 'DELETE') {
      deleteCount += 1;
      stored.delete(path);
      if (ordinal === 2 && expiryReplayObserved) {
        expiryCleanupDeleteSeen = true;
      }
      return new Response(null, { status: 204 });
    }
    if (method === 'PUT' && ordinal === 1) {
      const status = wrongLengthStatus ?? (acceptWrongLength ? 200 : 403);
      if (isSuccessful(status)) stored.set(path, BODY.subarray(0, -1));
      return new Response(null, { status });
    }
    if (method === 'PUT' && ordinal === 2) {
      expiryPutCount += 1;
      if (expiryPutCount > 1) {
        expiryReplayObserved = true;
        if (expiredReplayNoResponse) {
          throw new Error('synthetic expired replay transport failure');
        }
        if (isSuccessful(expiredReplayStatus)) stored.set(path, BODY);
        return new Response(null, { status: expiredReplayStatus });
      }
      if (isSuccessful(expiryInitialPutStatus)) stored.set(path, BODY);
      if (ambiguousExpiryInitialPut) {
        throw new Error('synthetic ambiguous expiry PUT');
      }
      return new Response(null, {
        status: expiryInitialPutStatus,
        headers: objectHeaders(2, cid),
      });
    }
    if (method === 'PUT') {
      positivePutCount += 1;
      if (ambiguousInitialPut && positivePutCount === 1) {
        latePositivePath = path;
        throw new Error('synthetic ambiguous initial PUT');
      }
      if (failReplayRequests && positivePutCount > 1) {
        throw new Error('synthetic replay transport failure');
      }
      if (positivePutCount === 4 && postDeleteReplayStatus !== null) {
        return new Response(null, { status: postDeleteReplayStatus });
      }
      stored.set(path, BODY);
      return new Response(null, { status: 200, headers: objectHeaders(0, cid) });
    }
    throw new Error('unexpected request');
  };
  return {
    fetch,
    requests,
    positivePutCount: () => positivePutCount,
    expiryPutCount: () => expiryPutCount,
    deleteCount: () => deleteCount,
    storedCount: () => stored.size,
    commitLatePositivePut: () => {
      if (latePositivePath) stored.set(latePositivePath, BODY);
    },
  };
}

function fakeClock(
  onWait = async () => {},
  wallAdvanceImpl = (milliseconds) => milliseconds,
  monotonicAdvanceImpl = wallAdvanceImpl,
) {
  let wallMs = Date.parse('2026-07-23T12:00:00.000Z');
  let monotonicMs = 0;
  return {
    wallNowImpl: () => new Date(wallMs),
    monotonicNowImpl: () => monotonicMs,
    waitImpl: async (milliseconds) => {
      wallMs += wallAdvanceImpl(milliseconds);
      monotonicMs += monotonicAdvanceImpl(milliseconds);
      await onWait(milliseconds);
    },
  };
}

test('requires explicit isolated-bucket and persistent-ciphertext confirmations', () => {
  assert.throws(() => readConfig({}), /L3_CANARY_ACK/);
  assert.throws(
    () => readConfig({
      L3_CANARY_ACK: 'write-three-small-immutable-l3-canary-objects',
      L3_CANARY_ENVIRONMENT: 'DEDICATED_NONPRODUCTION',
      CONFIRM_L3_CANARY_PERSISTENT_CIPHERTEXT: 'YES',
    }),
    /L3_CANARY_CID_GATEWAY_BASE/,
  );
});

test('runs the fail-closed CLI main through a symlinked entrypoint', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'youtick-l3-canary-entry-'));
  const entrypoint = join(directory, 'l3-account-canary.mjs');
  try {
    await symlink(
      fileURLToPath(new URL('./l3-account-canary.mjs', import.meta.url)),
      entrypoint,
    );
    const result = spawnSync(process.execPath, [entrypoint], {
      encoding: 'utf8',
      env: {},
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /CANARY_EXECUTION_FAILED/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('captures readback, replay and cleanup evidence without serializing credentials', async () => {
  const provider = fakeProvider();
  const evidence = await runL3AccountCanary({
    config: CONFIG,
    input: INPUT,
    provenance: PROVENANCE,
    fetchImpl: provider.fetch,
    ...fakeClock(),
  });

  assert.equal(evidence.verdict, 'EVIDENCE_MISSING');
  assert.equal(evidence.technicalResult, 'PASS');
  assert.equal(Object.values(evidence.checks).every(Boolean), true);
  assert.equal(provider.positivePutCount(), 4);
  assert.equal(provider.expiryPutCount(), 2);
  assert.equal(evidence.cleanup.keyReadsAbsent, true);
  assert.equal(evidence.cleanup.contentErased, false);
  assert.equal(evidence.cleanup.cidMayRemainReachable, true);
  assert.equal(evidence.cleanup.oldPutUrlRecreatedMapping, true);
  assert.equal(evidence.cleanup.safetyScans, 6);
  assert.equal(evidence.cleanup.expirySafetyScans, 6);
  assert.equal(evidence.checks.expiryWindowElapsed, true);
  assert.equal(evidence.checks.expiredPutRejected, true);
  assert.equal(
    evidence.limitations.includes('PRESIGNED_URL_EXPIRY_NOT_VERIFIED'),
    false,
  );
  assert.equal(evidence.observedCid, CID);
  assert.equal(evidence.observations.put.headerNames.includes('location'), true);
  assert.equal(Object.hasOwn(evidence.observations.put, 'headers'), false);
  assert.equal(
    validateSchema(evidence),
    true,
    JSON.stringify(validateSchema.errors),
  );
  assert.equal(verifyEvidencePayloadSha256(evidence), true);
  assert.equal(verifyEvidenceDocument(evidence, SCHEMA_SHA256), true);
  assert.equal(evidenceSchemaSha256, SCHEMA_SHA256);
  assert.equal(checkL3AccountCanaryEvidence(evidence), true);
  assert.equal(
    verifyEvidencePayloadSha256({ ...evidence, verdict: 'NO_GO' }),
    false,
  );
  assert.equal(
    verifyEvidencePayloadSha256(
      Object.fromEntries(Object.entries(evidence).reverse()),
    ),
    true,
  );
  assert.equal(verifyEvidenceDocument(evidence, '4'.repeat(64)), false);

  const inconsistent = structuredClone(evidence);
  inconsistent.observations.replays = inconsistent.observations.replays.map(
    (response) => ({
      ...response,
      providerOutcome: 'NO_RESPONSE',
      status: null,
    }),
  );
  inconsistent.evidencePayloadSha256 =
    computeEvidencePayloadSha256(inconsistent);
  assert.equal(validateSchema(inconsistent), true);
  assert.equal(verifyEvidencePayloadSha256(inconsistent), true);
  assert.equal(verifyEvidenceDocument(inconsistent, SCHEMA_SHA256), false);
  assert.equal(checkL3AccountCanaryEvidence(inconsistent), false);

  const tamperedExpiryTiming = structuredClone(evidence);
  tamperedExpiryTiming.observations.expiryMonotonicElapsedMs = 0;
  tamperedExpiryTiming.evidencePayloadSha256 =
    computeEvidencePayloadSha256(tamperedExpiryTiming);
  assert.equal(validateSchema(tamperedExpiryTiming), true);
  assert.equal(
    verifyEvidenceDocument(tamperedExpiryTiming, SCHEMA_SHA256),
    false,
  );

  const tamperedExpiryPolicy = structuredClone(evidence);
  tamperedExpiryPolicy.requestPolicy.expiryPutTtlSeconds = 1;
  tamperedExpiryPolicy.evidencePayloadSha256 =
    computeEvidencePayloadSha256(tamperedExpiryPolicy);
  assert.equal(
    verifyEvidenceDocument(tamperedExpiryPolicy, SCHEMA_SHA256),
    false,
  );

  const tamperedExpiryRepairCount = structuredClone(evidence);
  tamperedExpiryRepairCount.cleanup.expiryRepairDeleteAttempts = 1;
  tamperedExpiryRepairCount.evidencePayloadSha256 =
    computeEvidencePayloadSha256(tamperedExpiryRepairCount);
  assert.equal(
    verifyEvidenceDocument(tamperedExpiryRepairCount, SCHEMA_SHA256),
    false,
  );

  const inconsistentAttempts = structuredClone(evidence);
  inconsistentAttempts.requestPolicy.positivePutAttempts = 0;
  inconsistentAttempts.requestPolicy.postDeleteReplayPutAttempts = 0;
  inconsistentAttempts.evidencePayloadSha256 =
    computeEvidencePayloadSha256(inconsistentAttempts);
  assert.equal(validateSchema(inconsistentAttempts), false);
  assert.equal(checkL3AccountCanaryEvidence(inconsistentAttempts), false);

  const wrongLengthRequest = provider.requests.find(
    (request) => request.method === 'PUT'
      && request.path.includes('/objects/1-'),
  );
  assert.equal(wrongLengthRequest.bodyByteLength, BODY.byteLength - 1);
  assert.equal(Object.hasOwn(wrongLengthRequest.headers, 'content-length'), false);
  assert.equal(evidence.vector.wrongLengthSignedByteLength, BODY.byteLength);
  assert.equal(evidence.vector.wrongLengthSentByteLength, BODY.byteLength - 1);
  assert.equal(evidence.vector.wrongLengthDelta, -1);
  const expiryPutRequest = provider.requests.find(
    (request) => request.method === 'PUT'
      && request.path.includes('/objects/2-'),
  );
  assert.equal(expiryPutRequest.expires, '60');
  assert.equal(
    expiryPutRequest.amzDate,
    evidence.observations.expirySignedAt.replace(/[:-]|\.\d{3}/g, ''),
  );

  const serialized = JSON.stringify(evidence);
  assert.equal(serialized.includes(ACCESS_KEY), false);
  assert.equal(serialized.includes(SECRET_KEY), false);
  assert.equal(serialized.includes('X-Amz-Signature='), false);
  assert.equal(serialized.includes('X-Amz-Credential='), false);
  assert.equal(serialized.includes('https://s3.lighthouse.storage/object?'), false);
});

test('uses the raw Lighthouse provider CID for gateway readback', async () => {
  const provider = fakeProvider({
    cid: l3Vectors.cidNormalization.providerCid,
  });
  const evidence = await runL3AccountCanary({
    config: CONFIG,
    input: INPUT,
    provenance: PROVENANCE,
    fetchImpl: provider.fetch,
    ...fakeClock(),
  });

  assert.equal(evidence.technicalResult, 'PASS');
  assert.equal(evidence.observedCid, l3Vectors.cidNormalization.providerCid);
  assert.equal(evidence.observedCidDetails.version, 0);
  assert.equal(
    provider.requests.some((request) => (
      request.method === 'GET'
      && request.path === `/ipfs/${l3Vectors.cidNormalization.providerCid}`
    )),
    true,
  );
  assert.equal(
    provider.requests.some((request) => (
      request.path === `/ipfs/${l3Vectors.cidNormalization.manifestCid}`
    )),
    false,
  );
});

test('fails closed if the provider accepts the one-byte-short upload', async () => {
  const provider = fakeProvider({ acceptWrongLength: true });
  const evidence = await runL3AccountCanary({
    config: CONFIG,
    input: INPUT,
    provenance: PROVENANCE,
    fetchImpl: provider.fetch,
    ...fakeClock(),
  });

  assert.equal(evidence.verdict, 'NO_GO');
  assert.equal(evidence.checks.wrongLengthRejected, false);
  assert.equal(evidence.cleanup.keyReadsAbsent, true);
});

test('fails closed when replay requests receive no provider response', async () => {
  const provider = fakeProvider({ failReplayRequests: true });
  const evidence = await runL3AccountCanary({
    config: CONFIG,
    input: INPUT,
    provenance: PROVENANCE,
    fetchImpl: provider.fetch,
    ...fakeClock(),
  });

  assert.equal(evidence.technicalResult, 'NO_GO');
  assert.equal(evidence.checks.replayMeasured, false);
  assert.equal(evidence.observations.replays.length, 2);
  assert.equal(
    evidence.observations.replays.every(
      (response) => response.providerOutcome === 'NO_RESPONSE',
    ),
    true,
  );
  assert.equal(evidence.cleanup.keyReadsAbsent, true);
});

test('cleans every attempted mapping after a body-read exception', async () => {
  const provider = fakeProvider({ throwDuringFirstGetBody: true });
  const evidence = await runL3AccountCanary({
    config: CONFIG,
    input: INPUT,
    provenance: PROVENANCE,
    fetchImpl: provider.fetch,
    ...fakeClock(),
  });

  assert.equal(evidence.technicalResult, 'NO_GO');
  assert.equal(evidence.checks.executionCompleted, false);
  assert.equal(provider.deleteCount(), 2);
  assert.equal(provider.storedCount(), 0);
  assert.equal(evidence.cleanup.keyReadsAbsent, true);
});

test('does not treat a transient 503 as wrong-length rejection evidence', async () => {
  const provider = fakeProvider({ wrongLengthStatus: 503 });
  const evidence = await runL3AccountCanary({
    config: CONFIG,
    input: INPUT,
    provenance: PROVENANCE,
    fetchImpl: provider.fetch,
    ...fakeClock(),
  });

  assert.equal(evidence.technicalResult, 'NO_GO');
  assert.equal(evidence.observations.wrongLength.status, 503);
  assert.equal(evidence.checks.wrongLengthRejected, false);
});

test('does not treat a transient 503 as a measured post-delete replay', async () => {
  const provider = fakeProvider({ postDeleteReplayStatus: 503 });
  const evidence = await runL3AccountCanary({
    config: CONFIG,
    input: INPUT,
    provenance: PROVENANCE,
    fetchImpl: provider.fetch,
    ...fakeClock(),
  });

  assert.equal(evidence.technicalResult, 'NO_GO');
  assert.equal(evidence.observations.postDeleteReplay.status, 503);
  assert.equal(evidence.checks.postDeleteReplayMeasured, false);
  assert.equal(evidence.cleanup.keyReadsAbsent, true);
});

test('does not treat a redirect as a measured post-delete replay', async () => {
  const provider = fakeProvider({ postDeleteReplayStatus: 307 });
  const evidence = await runL3AccountCanary({
    config: CONFIG,
    input: INPUT,
    provenance: PROVENANCE,
    fetchImpl: provider.fetch,
    ...fakeClock(),
  });

  assert.equal(evidence.technicalResult, 'NO_GO');
  assert.equal(evidence.observations.postDeleteReplay.status, 307);
  assert.equal(evidence.checks.postDeleteReplayMeasured, false);
  assert.equal(evidence.cleanup.keyReadsAbsent, true);
});

for (const status of [200, 307, 400, 404, 429, 503]) {
  test(`does not treat post-expiry ${status} as expiry rejection`, async () => {
    const provider = fakeProvider({ expiredReplayStatus: status });
    const evidence = await runL3AccountCanary({
      config: CONFIG,
      input: INPUT,
      provenance: PROVENANCE,
      fetchImpl: provider.fetch,
      ...fakeClock(),
    });

    assert.equal(evidence.technicalResult, 'NO_GO');
    assert.equal(evidence.observations.expiredReplay.status, status);
    assert.equal(evidence.checks.expiredPutRejected, false);
    assert.equal(evidence.cleanup.keyReadsAbsent, true);
    assert.equal(
      evidence.limitations.includes('PRESIGNED_URL_EXPIRY_NOT_VERIFIED'),
      true,
    );
  });
}

test('does not treat a post-expiry transport failure as rejection', async () => {
  const provider = fakeProvider({ expiredReplayNoResponse: true });
  const evidence = await runL3AccountCanary({
    config: CONFIG,
    input: INPUT,
    provenance: PROVENANCE,
    fetchImpl: provider.fetch,
    ...fakeClock(),
  });

  assert.equal(evidence.technicalResult, 'NO_GO');
  assert.equal(evidence.observations.expiredReplay.providerOutcome, 'NO_RESPONSE');
  assert.equal(evidence.checks.expiredPutRejected, false);
  assert.equal(evidence.cleanup.keyReadsAbsent, true);
});

test('rejects an expiry 403 observed before both clocks cross the gate', async () => {
  const provider = fakeProvider();
  const evidence = await runL3AccountCanary({
    config: CONFIG,
    input: INPUT,
    provenance: PROVENANCE,
    fetchImpl: provider.fetch,
    ...fakeClock(
      async () => {},
      (milliseconds) => (milliseconds > 60_000 ? milliseconds - 1_000 : milliseconds),
    ),
  });

  assert.equal(evidence.observations.expiredReplay.status, 403);
  assert.equal(evidence.checks.expiredPutRejected, true);
  assert.equal(evidence.checks.expiryWindowElapsed, false);
  assert.equal(evidence.technicalResult, 'NO_GO');
});

test('rejects expiry when only the wall clock crosses the gate', async () => {
  const provider = fakeProvider();
  const evidence = await runL3AccountCanary({
    config: CONFIG,
    input: INPUT,
    provenance: PROVENANCE,
    fetchImpl: provider.fetch,
    ...fakeClock(
      async () => {},
      (milliseconds) => milliseconds,
      (milliseconds) => (milliseconds > 60_000 ? milliseconds - 1_000 : milliseconds),
    ),
  });

  assert.equal(evidence.observations.expiredReplay.status, 403);
  assert.equal(evidence.checks.expiryWindowElapsed, false);
  assert.equal(evidence.technicalResult, 'NO_GO');
});

test('rejects expiry when only the monotonic clock crosses the gate', async () => {
  const provider = fakeProvider();
  const evidence = await runL3AccountCanary({
    config: CONFIG,
    input: INPUT,
    provenance: PROVENANCE,
    fetchImpl: provider.fetch,
    ...fakeClock(
      async () => {},
      (milliseconds) => (milliseconds > 60_000 ? milliseconds - 1_000 : milliseconds),
      (milliseconds) => milliseconds,
    ),
  });

  assert.equal(evidence.observations.expiredReplay.status, 403);
  assert.equal(evidence.checks.expiryWindowElapsed, false);
  assert.equal(evidence.technicalResult, 'NO_GO');
});

test('fails closed if the first short-TTL PUT is rejected', async () => {
  const provider = fakeProvider({ expiryInitialPutStatus: 403 });
  const evidence = await runL3AccountCanary({
    config: CONFIG,
    input: INPUT,
    provenance: PROVENANCE,
    fetchImpl: provider.fetch,
    ...fakeClock(),
  });

  assert.equal(evidence.observations.expiryPut.status, 403);
  assert.equal(evidence.checks.expiryObjectVerified, false);
  assert.equal(evidence.technicalResult, 'NO_GO');
  assert.equal(evidence.cleanup.keyReadsAbsent, true);
});

test('repairs an ambiguous first expiry PUT during final cleanup', async () => {
  const provider = fakeProvider({ ambiguousExpiryInitialPut: true });
  const evidence = await runL3AccountCanary({
    config: CONFIG,
    input: INPUT,
    provenance: PROVENANCE,
    fetchImpl: provider.fetch,
    ...fakeClock(),
  });

  assert.equal(evidence.observations.expiryPut.providerOutcome, 'NO_RESPONSE');
  assert.equal(evidence.checks.expiryObjectVerified, false);
  assert.equal(evidence.technicalResult, 'NO_GO');
  assert.equal(evidence.cleanup.keyReadsAbsent, true);
  assert.equal(provider.storedCount(), 0);
});

test('records a late expiry mapping repair as fail-closed evidence', async () => {
  const provider = fakeProvider({ lateExpiryCleanupCommit: true });
  const evidence = await runL3AccountCanary({
    config: CONFIG,
    input: INPUT,
    provenance: PROVENANCE,
    fetchImpl: provider.fetch,
    ...fakeClock(),
  });

  assert.equal(evidence.cleanup.expiryRepairDeleteAttempts, 1);
  assert.equal(evidence.requestPolicy.expiryCleanupDeleteAttempts, 2);
  assert.equal(evidence.checks.expiryCleanupConverged, false);
  assert.equal(evidence.technicalResult, 'NO_GO');
  assert.equal(evidence.cleanup.keyReadsAbsent, true);
  assert.equal(verifyEvidenceDocument(evidence, SCHEMA_SHA256), true);
  assert.equal(provider.storedCount(), 0);
});

test('fails closed when fresh expiry cleanup signatures are rejected', async () => {
  const provider = fakeProvider({ failExpiryCleanupAuth: true });
  const evidence = await runL3AccountCanary({
    config: CONFIG,
    input: INPUT,
    provenance: PROVENANCE,
    fetchImpl: provider.fetch,
    ...fakeClock(),
  });

  assert.equal(evidence.observations.expiredReplay.status, 403);
  assert.equal(evidence.observations.finalExpiryHead.status, 403);
  assert.equal(evidence.checks.expiryCleanupConverged, false);
  assert.equal(evidence.technicalResult, 'NO_GO');
  assert.equal(evidence.cleanup.keyReadsAbsent, false);
});

test('repairs an ambiguous PUT that commits inside the cleanup safety window', async () => {
  const provider = fakeProvider({ ambiguousInitialPut: true });
  let waits = 0;
  const evidence = await runL3AccountCanary({
    config: CONFIG,
    input: INPUT,
    provenance: PROVENANCE,
    fetchImpl: provider.fetch,
    ...fakeClock(async () => {
      waits += 1;
      if (waits === 4) provider.commitLatePositivePut();
    }),
  });

  assert.equal(evidence.technicalResult, 'NO_GO');
  assert.equal(evidence.observations.put.providerOutcome, 'NO_RESPONSE');
  assert.equal(evidence.cleanup.repairDeleteAttempts > 0, true);
  assert.equal(evidence.cleanup.keyReadsAbsent, true);
  assert.equal(provider.storedCount(), 0);
});

test('accepts canonical CIDv0/v1 sha2-256 and binds raw CIDv1 to ciphertext', () => {
  const rawCid = rawCidForSha256(INPUT.ciphertextSha256);
  assert.deepEqual(
    parseCanonicalCid(rawCid, INPUT.ciphertextSha256),
    {
      cid: rawCid,
      version: 1,
      codec: 'raw',
      multihash: 'sha2-256-32',
      rawDigestMatchesCiphertext: true,
    },
  );
  assert.equal(parseCanonicalCid(rawCid, '0'.repeat(64)), null);
  assert.deepEqual(
    parseCanonicalCid(
      'QmYwAPJzv5CZsnAzt8auVZRnGi2CkT7fVnNf5Wk8m3A9aB',
      INPUT.ciphertextSha256,
    ),
    {
      cid: 'QmYwAPJzv5CZsnAzt8auVZRnGi2CkT7fVnNf5Wk8m3A9aB',
      version: 0,
      codec: 'dag-pb',
      multihash: 'sha2-256-32',
      rawDigestMatchesCiphertext: null,
    },
  );
  assert.equal(parseCanonicalCid(CID, INPUT.ciphertextSha256)?.codec, 'dag-pb');
});

test('matches the production signer fixed PUT vector', async () => {
  const hash = 'ab'.repeat(32);
  const grant = await presignL3CanaryPut({
    bucket: 'youtick-testnet',
    providerKey: `jobs/job-01hxyz/objects/7-${hash}`,
    jobId: 'job-01hxyz',
    ordinal: 7,
    ciphertextSha256: hash,
    byteLength: 1_048_592,
    credentials: {
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
    },
    now: new Date('2026-07-23T10:20:30.000Z'),
  });

  assert.equal(
    new URL(grant.url).searchParams.get('X-Amz-Signature'),
    '82363e798ecde29b138c3250737539a21d87ace6199a4817f491df7c48cf5ec8',
  );
});

test('writes recovery locators to a new operator-only file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'youtick-l3-canary-'));
  const recoveryPath = join(directory, 'recovery.json');
  try {
    await writeRecoveryRecord({ ...CONFIG, recoveryPath }, INPUT);
    const record = JSON.parse(await readFile(recoveryPath, 'utf8'));
    const mode = (await stat(recoveryPath)).mode & 0o777;
    assert.equal(mode, 0o600);
    assert.equal(record.bucket, CONFIG.bucket);
    assert.deepEqual(record.providerKeys, [
      INPUT.positiveProviderKey,
      INPUT.wrongLengthProviderKey,
      INPUT.expiryProviderKey,
    ]);
    await assert.rejects(
      writeRecoveryRecord({ ...CONFIG, recoveryPath }, INPUT),
      { code: 'EEXIST' },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function rawCidForSha256(hexDigest) {
  const bytes = Uint8Array.from([
    0x01,
    0x55,
    0x12,
    0x20,
    ...Buffer.from(hexDigest, 'hex'),
  ]);
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let output = 'b';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += alphabet[(buffer >> bits) & 31];
      buffer &= (1 << bits) - 1;
    }
  }
  if (bits > 0) output += alphabet[(buffer << (5 - bits)) & 31];
  return output;
}

function isSuccessful(status) {
  return status >= 200 && status < 300;
}
