#!/usr/bin/env node
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { AwsV4Signer } from 'aws4fetch';

const execFileAsync = promisify(execFile);
const ACK = 'write-three-small-immutable-l3-canary-objects';
const ENVIRONMENT = 'DEDICATED_NONPRODUCTION';
const ENDPOINT = 'https://s3.lighthouse.storage';
const REGION = 'auto';
const BODY_BYTES = 4 * 1024;
const PRESIGN_TTL_SECONDS = 10 * 60;
const EXPIRY_PRESIGN_TTL_SECONDS = 60;
const EXPIRY_SAFETY_MARGIN_MS = 15 * 1000;
const REQUEST_TIMEOUT_MS = 30 * 1000;
const HEAD_RETRY_MS = [0, 250, 1_000, 3_000];
const CLEANUP_RETRY_MS = [0, 250, 1_000, 3_000, 5_000];
const CID_V1_PATTERN = /^b[a-z2-7]{58}$/;
const CID_V0_PATTERN = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const SIGNED_HEADER_NAMES = [
  'content-length',
  'content-type',
  'host',
  'x-amz-meta-youtick-ciphertext-sha256',
  'x-amz-meta-youtick-job-id',
  'x-amz-meta-youtick-object-ordinal',
];

export function readConfig(env = process.env) {
  if (env.L3_CANARY_ACK !== ACK) {
    throw new Error(`L3_CANARY_ACK must equal ${ACK}`);
  }
  if (env.L3_CANARY_ENVIRONMENT !== ENVIRONMENT) {
    throw new Error(`L3_CANARY_ENVIRONMENT must equal ${ENVIRONMENT}`);
  }
  if (env.CONFIRM_L3_CANARY_PERSISTENT_CIPHERTEXT !== 'YES') {
    throw new Error('CONFIRM_L3_CANARY_PERSISTENT_CIPHERTEXT must equal YES');
  }
  const bucket = env.LIGHTHOUSE_L3_BUCKET?.trim();
  const accessKeyId = env.LIGHTHOUSE_L3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.LIGHTHOUSE_L3_SECRET_ACCESS_KEY?.trim();
  const cidGatewayBase = validateGatewayBase(env.L3_CANARY_CID_GATEWAY_BASE);
  const recoveryPath = env.L3_CANARY_RECOVERY_PATH?.trim();
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'LIGHTHOUSE_L3_BUCKET, LIGHTHOUSE_L3_ACCESS_KEY_ID and '
      + 'LIGHTHOUSE_L3_SECRET_ACCESS_KEY are required',
    );
  }
  if (env.CONFIRM_L3_CANARY_BUCKET !== bucket) {
    throw new Error('CONFIRM_L3_CANARY_BUCKET must equal LIGHTHOUSE_L3_BUCKET');
  }
  if (!BUCKET_PATTERN.test(bucket)
    || bucket.includes('..')
    || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(bucket)) {
    throw new Error('Invalid LIGHTHOUSE_L3_BUCKET');
  }
  if (!recoveryPath || !isAbsolute(recoveryPath)) {
    throw new Error('L3_CANARY_RECOVERY_PATH must be an absolute path');
  }
  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    cidGatewayBase,
    recoveryPath,
    environment: ENVIRONMENT,
  };
}

export function createCanaryInput({
  now = new Date(),
  body = randomBytes(BODY_BYTES),
  nonce = randomBytes(6).toString('hex'),
  runId = randomUUID(),
} = {}) {
  if (!(body instanceof Uint8Array) || body.byteLength !== BODY_BYTES) {
    throw new Error(`Canary body must be exactly ${BODY_BYTES} bytes`);
  }
  if (!/^[0-9a-f]{12}$/.test(nonce)
    || !/^[0-9a-f-]{36}$/.test(runId)
    || !Number.isFinite(now.getTime())) {
    throw new Error('Invalid canary identity');
  }
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  const jobId = `canary-${date}-${nonce}`;
  const ciphertextSha256 = sha256(body);
  const wrongLengthCiphertextSha256 = sha256(body.subarray(0, -1));
  return {
    body,
    now,
    runId,
    jobId,
    ciphertextSha256,
    wrongLengthCiphertextSha256,
    positiveProviderKey: `jobs/${jobId}/objects/0-${ciphertextSha256}`,
    wrongLengthProviderKey:
      `jobs/${jobId}/objects/1-${wrongLengthCiphertextSha256}`,
    expiryProviderKey: `jobs/${jobId}/objects/2-${ciphertextSha256}`,
  };
}

export async function readProvenance() {
  const repoRoot = new URL('../../../', import.meta.url);
  const [scriptBytes, signerBytes, schemaBytes, lockfileBytes, commit, status]
    = await Promise.all([
    readFile(new URL('./l3-account-canary.mjs', import.meta.url)),
    readFile(new URL('../src/l3-sigv4.ts', import.meta.url)),
    readFile(new URL('../../../protocol/l3-account-canary-v1/schema.json', import.meta.url)),
    readFile(new URL('../package-lock.json', import.meta.url)),
    execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: fileURLToPath(repoRoot),
      encoding: 'utf8',
    }),
    execFileAsync('git', ['status', '--short', '--untracked-files=all'], {
      cwd: fileURLToPath(repoRoot),
      encoding: 'utf8',
    }),
  ]);
  return {
    sourceCommit: commit.stdout.trim(),
    sourceDirty: status.stdout.trim().length > 0,
    scriptSha256: sha256(scriptBytes),
    productionSignerSha256: sha256(signerBytes),
    evidenceSchemaSha256: sha256(schemaBytes),
    lockfileSha256: sha256(lockfileBytes),
    runtimeVersion: process.version,
  };
}

export function buildRecoveryRecord(config, input) {
  return {
    schema: 'youtick.l3-account-canary-recovery.v1',
    runId: input.runId,
    bucket: config.bucket,
    providerKeys: [
      input.positiveProviderKey,
      input.wrongLengthProviderKey,
      input.expiryProviderKey,
    ],
    contentErasedByDelete: false,
  };
}

export async function writeRecoveryRecord(config, input) {
  await writeFile(
    config.recoveryPath,
    `${JSON.stringify(buildRecoveryRecord(config, input), null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx', mode: 0o600 },
  );
}

export async function runL3AccountCanary({
  config,
  input = createCanaryInput(),
  provenance,
  fetchImpl = fetch,
  waitImpl = wait,
  wallNowImpl = () => new Date(),
  monotonicNowImpl = () => performance.now(),
}) {
  const startedAt = new Date().toISOString();
  const credentials = {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  };
  const expected = {
    jobId: input.jobId,
    ciphertextSha256: input.ciphertextSha256,
    byteLength: input.body.byteLength,
  };
  const positiveMetadata = expectedMetadata(input, 0);
  const negativeMetadata = expectedMetadata(input, 1);
  const expiryMetadata = expectedMetadata(input, 2);
  const grants = await createGrants({
    config,
    input,
    credentials,
  });
  const request = (url, init) => safeFetch(fetchImpl, url, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const preflightPositive = summarizeResponse(
    await request(grants.positiveHead, { method: 'HEAD' }),
    positiveMetadata,
  );
  const preflightNegative = summarizeResponse(
    await request(grants.negativeHead, { method: 'HEAD' }),
    negativeMetadata,
  );
  const preflightExpiry = summarizeResponse(
    await request(grants.expiryHead, { method: 'HEAD' }),
    expiryMetadata,
  );
  const preflightAbsent = preflightPositive.status === 404
    && preflightNegative.status === 404
    && preflightExpiry.status === 404;

  let wrongLength = emptyResponse();
  let wrongLengthHead = emptyResponse();
  let expiryPut = emptyResponse();
  let expiryHead = emptyResponse();
  let expiryGet = emptyResponse();
  let expiryGetBody = emptyBody();
  let expiryDelete = emptyResponse();
  let expiredReplay = emptyResponse();
  let postExpiryFreshHead = emptyResponse();
  let postExpiryFreshGet = emptyResponse();
  let expiryCleanupDelete = emptyResponse();
  let finalExpiryHead = emptyResponse();
  let finalExpiryGet = emptyResponse();
  let expiryCleanupSafetyScans = 0;
  let expiryCleanupRepairDeleteAttempts = 0;
  let expirySignedAt = null;
  let expiryReplayedAt = null;
  let expiryMonotonicElapsedMs = null;
  let expiryPutGrant = null;
  let expiryMonotonicStartedAtMs = null;
  let expiryCidDetails = null;
  let put = emptyResponse();
  let head = emptyResponse();
  let get = emptyResponse();
  let getBody = emptyBody();
  let cidGet = emptyResponse();
  let cidGetBody = emptyBody();
  let headAfterReplay = emptyResponse();
  let getAfterReplay = emptyResponse();
  let getAfterReplayBody = emptyBody();
  let deletePositive = emptyResponse();
  let deleteNegative = emptyResponse();
  let postDeletePositiveHead = emptyResponse();
  let postDeletePositiveGet = emptyResponse();
  let postDeleteNegativeHead = emptyResponse();
  let postDeleteReplay = emptyResponse();
  let postDeleteReplayHead = emptyResponse();
  let postDeleteReplayGet = emptyResponse();
  let postDeleteReplayGetBody = emptyBody();
  let finalDeletePositive = emptyResponse();
  let finalPositiveHead = emptyResponse();
  let finalPositiveGet = emptyResponse();
  let finalNegativeHead = emptyResponse();
  let cleanupSafetyScans = 0;
  let cleanupRepairDeleteAttempts = 0;
  let cidAfterDelete = emptyResponse();
  let cidAfterDeleteBody = emptyBody();
  const replays = [];
  let sharedCid = null;
  let sharedCidDetails = null;
  let positiveMutationAttempted = false;
  let negativeMutationAttempted = false;
  let expiryMutationAttempted = false;
  let expiredReplayAttempted = false;
  let expiryCleanupDeleteAttempts = 0;
  let postDeleteReplayAttempted = false;
  let executionCompleted = true;

  if (preflightAbsent) {
    try {
      negativeMutationAttempted = true;
      const wrongLengthHeaders = { ...grants.wrongLengthPut.headers };
      delete wrongLengthHeaders['Content-Length'];
      wrongLength = summarizeResponse(
        await request(grants.wrongLengthPut.url, {
          method: 'PUT',
          headers: wrongLengthHeaders,
          body: input.body.subarray(0, -1),
        }),
        negativeMetadata,
      );
      wrongLengthHead = summarizeResponse(
        await request(grants.negativeHead, { method: 'HEAD' }),
        negativeMetadata,
      );

      const expirySignedAtDate = validNow(wallNowImpl());
      expirySignedAt = expirySignedAtDate.toISOString();
      expiryMonotonicStartedAtMs = validMonotonicNow(monotonicNowImpl());
      expiryPutGrant = await presignL3CanaryPut({
        bucket: config.bucket,
        providerKey: input.expiryProviderKey,
        jobId: input.jobId,
        ordinal: 2,
        ciphertextSha256: input.ciphertextSha256,
        byteLength: input.body.byteLength,
        credentials,
        now: expirySignedAtDate,
        expiresInSeconds: EXPIRY_PRESIGN_TTL_SECONDS,
      });
      expiryMutationAttempted = true;
      expiryPut = summarizeResponse(
        await request(expiryPutGrant.url, {
          method: 'PUT',
          headers: expiryPutGrant.headers,
          body: input.body,
        }),
        expiryMetadata,
      );
      expiryHead = await pollHead({
        request,
        url: grants.expiryHead,
        expectedMetadata: expiryMetadata,
        waitImpl,
      });
      if (expiryHead.status === 200) {
        const expiryGetResult = await request(grants.expiryGet, { method: 'GET' });
        expiryGet = summarizeResponse(expiryGetResult, expiryMetadata);
        expiryGetBody = await readBoundedBody(
          expiryGetResult.response,
          input.body.byteLength + 1,
        );
        expiryCidDetails = commonCid(
          input.ciphertextSha256,
          expiryPut.cidCandidates,
          expiryHead.cidCandidates,
          expiryGet.cidCandidates,
        );
      }
      expiryDelete = summarizeResponse(
        await request(grants.expiryDelete, { method: 'DELETE' }),
      );

      positiveMutationAttempted = true;
      put = summarizeResponse(
        await request(grants.positivePut.url, {
          method: 'PUT',
          headers: grants.positivePut.headers,
          body: input.body,
        }),
        positiveMetadata,
      );
      head = await pollHead({
        request,
        url: grants.positiveHead,
        expectedMetadata: positiveMetadata,
        waitImpl,
      });
      if (head.status === 200) {
        const getResult = await request(grants.positiveGet, { method: 'GET' });
        get = summarizeResponse(getResult, positiveMetadata);
        getBody = await readBoundedBody(
          getResult.response,
          input.body.byteLength + 1,
        );
        sharedCidDetails = commonCid(
          input.ciphertextSha256,
          put.cidCandidates,
          head.cidCandidates,
          get.cidCandidates,
        );
        sharedCid = sharedCidDetails?.cid ?? null;
        if (sharedCid) {
          const cidResult = await request(cidUrl(config.cidGatewayBase, sharedCid), {
            method: 'GET',
          });
          cidGet = summarizeResponse(cidResult);
          cidGetBody = await readBoundedBody(
            cidResult.response,
            input.body.byteLength + 1,
          );
        }
        for (let attempt = 0; attempt < 2; attempt += 1) {
          replays.push(summarizeResponse(
            await request(grants.positivePut.url, {
              method: 'PUT',
              headers: grants.positivePut.headers,
              body: input.body,
            }),
            positiveMetadata,
          ));
        }
        headAfterReplay = summarizeResponse(
          await request(grants.positiveHead, { method: 'HEAD' }),
          positiveMetadata,
        );
        const getAfterReplayResult = await request(
          grants.positiveGet,
          { method: 'GET' },
        );
        getAfterReplay = summarizeResponse(
          getAfterReplayResult,
          positiveMetadata,
        );
        getAfterReplayBody = await readBoundedBody(
          getAfterReplayResult.response,
          input.body.byteLength + 1,
        );
      }
    } catch {
      executionCompleted = false;
    } finally {
      if (positiveMutationAttempted) {
        try {
          deletePositive = summarizeResponse(
            await request(grants.positiveDelete, { method: 'DELETE' }),
          );
        } catch {
          executionCompleted = false;
        }
      }
      if (negativeMutationAttempted) {
        try {
          deleteNegative = summarizeResponse(
            await request(grants.negativeDelete, { method: 'DELETE' }),
          );
        } catch {
          executionCompleted = false;
        }
      }
      if (positiveMutationAttempted) {
        try {
          postDeletePositiveHead = summarizeResponse(
            await request(grants.positiveHead, { method: 'HEAD' }),
          );
        } catch {
          executionCompleted = false;
        }
      }
      if (negativeMutationAttempted) {
        try {
          postDeleteNegativeHead = summarizeResponse(
            await request(grants.negativeHead, { method: 'HEAD' }),
          );
        } catch {
          executionCompleted = false;
        }
      }
      if (positiveMutationAttempted) {
        try {
          postDeletePositiveGet = summarizeResponse(
            await request(grants.positiveGet, { method: 'GET' }),
          );
        } catch {
          executionCompleted = false;
        }
      }
      if (executionCompleted && sharedCid) {
        try {
          postDeleteReplayAttempted = true;
          postDeleteReplay = summarizeResponse(
            await request(grants.positivePut.url, {
              method: 'PUT',
              headers: grants.positivePut.headers,
              body: input.body,
            }),
            positiveMetadata,
          );
          postDeleteReplayHead = summarizeResponse(
            await request(grants.positiveHead, { method: 'HEAD' }),
            positiveMetadata,
          );
          const postDeleteReplayGetResult = await request(
            grants.positiveGet,
            { method: 'GET' },
          );
          postDeleteReplayGet = summarizeResponse(
            postDeleteReplayGetResult,
            positiveMetadata,
          );
          if (postDeleteReplayGet.status === 200) {
            postDeleteReplayGetBody = await readBoundedBody(
              postDeleteReplayGetResult.response,
              input.body.byteLength + 1,
            );
          }
        } catch {
          executionCompleted = false;
        }
      }
      if (positiveMutationAttempted) {
        try {
          finalDeletePositive = summarizeResponse(
            await request(grants.positiveDelete, { method: 'DELETE' }),
          );
        } catch {
          executionCompleted = false;
        }
      }
      if (positiveMutationAttempted || negativeMutationAttempted) {
        try {
          const cleanupResult = await convergeKeyMappingsAbsent({
            request,
            grants,
            positiveMetadata,
            negativeMetadata,
            positiveMutationAttempted,
            negativeMutationAttempted,
            waitImpl,
          });
          finalPositiveHead = cleanupResult.positiveHead;
          finalPositiveGet = cleanupResult.positiveGet;
          finalNegativeHead = cleanupResult.negativeHead;
          cleanupSafetyScans = cleanupResult.scanCount;
          cleanupRepairDeleteAttempts = cleanupResult.repairDeleteAttempts;
        } catch {
          executionCompleted = false;
        }
      }
      if (expiryMutationAttempted && expiryPutGrant !== null) {
        try {
          const requiredElapsedMs = (
            EXPIRY_PRESIGN_TTL_SECONDS * 1000
          ) + EXPIRY_SAFETY_MARGIN_MS;
          const beforeWaitWall = validNow(wallNowImpl());
          const beforeWaitMonotonic = validMonotonicNow(monotonicNowImpl());
          const wallRemainingMs = new Date(expirySignedAt).getTime()
            + requiredElapsedMs
            - beforeWaitWall.getTime();
          const monotonicRemainingMs = expiryMonotonicStartedAtMs
            + requiredElapsedMs
            - beforeWaitMonotonic;
          const waitMs = Math.max(0, wallRemainingMs, monotonicRemainingMs);
          if (waitMs > 0) await waitImpl(Math.ceil(waitMs) + 25);

          const replayedAtDate = validNow(wallNowImpl());
          expiryReplayedAt = replayedAtDate.toISOString();
          expiryMonotonicElapsedMs = Math.floor(
            validMonotonicNow(monotonicNowImpl())
              - expiryMonotonicStartedAtMs,
          );
          const freshExpiryGrants = await createExpiryCleanupGrants({
            config,
            input,
            credentials,
            now: replayedAtDate,
          });
          expiredReplayAttempted = true;
          expiredReplay = summarizeResponse(
            await request(expiryPutGrant.url, {
              method: 'PUT',
              headers: expiryPutGrant.headers,
              body: input.body,
            }),
            expiryMetadata,
          );
          postExpiryFreshHead = summarizeResponse(
            await request(freshExpiryGrants.head, { method: 'HEAD' }),
            expiryMetadata,
          );
          postExpiryFreshGet = summarizeResponse(
            await request(freshExpiryGrants.get, { method: 'GET' }),
            expiryMetadata,
          );
          expiryCleanupDeleteAttempts += 1;
          expiryCleanupDelete = summarizeResponse(
            await request(freshExpiryGrants.delete, { method: 'DELETE' }),
          );
          const expiryCleanupResult = await convergeExpiryKeyAbsent({
            request,
            grants: freshExpiryGrants,
            expectedMetadata: expiryMetadata,
            waitImpl,
          });
          finalExpiryHead = expiryCleanupResult.head;
          finalExpiryGet = expiryCleanupResult.get;
          expiryCleanupSafetyScans = expiryCleanupResult.scanCount;
          expiryCleanupRepairDeleteAttempts =
            expiryCleanupResult.repairDeleteAttempts;
          expiryCleanupDeleteAttempts +=
            expiryCleanupResult.repairDeleteAttempts;
        } catch {
          executionCompleted = false;
        }
      }
      if (sharedCid) {
        try {
          const cidAfterDeleteResult = await request(
            cidUrl(config.cidGatewayBase, sharedCid),
            { method: 'GET' },
          );
          cidAfterDelete = summarizeResponse(cidAfterDeleteResult);
          cidAfterDeleteBody = await readBoundedBody(
            cidAfterDeleteResult.response,
            input.body.byteLength + 1,
          );
        } catch {
          executionCompleted = false;
        }
      }
    }
  }

  const expiryRequiredElapsedMs = (
    EXPIRY_PRESIGN_TTL_SECONDS * 1000
  ) + EXPIRY_SAFETY_MARGIN_MS;
  const checks = {
    executionCompleted,
    preflightAbsent,
    wrongLengthRejected: wrongLength.providerOutcome === 'RESPONSE'
      && !wrongLength.redirected
      && (wrongLength.status === 400 || wrongLength.status === 403)
      && wrongLengthHead.status === 404,
    putAccepted: put.status === 200 && !put.redirected,
    headExact: responseMatchesObject(head, expected),
    getExact: responseMatchesObject(get, expected)
      && bodyMatches(getBody, input),
    cidConsistent: sharedCidDetails !== null,
    cidGetExact: responseMatchesBody(cidGet, expected)
      && bodyMatches(cidGetBody, input),
    replayMeasured: replays.length === 2
      && replays.every((result) => (
        result.providerOutcome === 'RESPONSE'
        && Number.isInteger(result.status)
        && result.status === 200
      )),
    replayStable: responseMatchesObject(headAfterReplay, expected)
      && headAfterReplay.cidCandidates.includes(sharedCid)
      && headAfterReplay.etagSha256 === head.etagSha256
      && responseMatchesObject(getAfterReplay, expected)
      && getAfterReplay.cidCandidates.includes(sharedCid)
      && bodyMatches(getAfterReplayBody, input),
    deleteAccepted: deletePositive.status === 204
      && deleteNegative.status === 204,
    initialKeyReadsAbsent: postDeletePositiveHead.status === 404
      && postDeletePositiveGet.status === 404
      && postDeleteNegativeHead.status === 404,
    postDeleteReplayMeasured: responseMatchesReplayOutcome({
      put: postDeleteReplay,
      head: postDeleteReplayHead,
      get: postDeleteReplayGet,
      getBody: postDeleteReplayGetBody,
      expected,
      input,
      expectedCid: sharedCid,
    }),
    finalDeleteAccepted: finalDeletePositive.status === 204,
    finalKeyReadsAbsent: finalPositiveHead.status === 404
      && finalPositiveGet.status === 404
      && finalNegativeHead.status === 404,
    expiryObjectVerified: expiryPut.status === 200
      && !expiryPut.redirected
      && responseMatchesObject(expiryHead, expected)
      && responseMatchesObject(expiryGet, expected)
      && bodyMatches(expiryGetBody, input)
      && expiryCidDetails !== null
      && expiryDelete.status === 204,
    expiryWindowElapsed: expiryTimingSatisfied({
      signedAt: expirySignedAt,
      replayedAt: expiryReplayedAt,
      monotonicElapsedMs: expiryMonotonicElapsedMs,
      requiredElapsedMs: expiryRequiredElapsedMs,
    }),
    expiredPutRejected: expiredReplay.providerOutcome === 'RESPONSE'
      && !expiredReplay.redirected
      && expiredReplay.status === 403,
    expiryMappingAbsent: postExpiryFreshHead.status === 404
      && postExpiryFreshGet.status === 404,
    expiryCleanupConverged: expiryCleanupDelete.status === 204
      && finalExpiryHead.status === 404
      && finalExpiryGet.status === 404
      && expiryCleanupSafetyScans === CLEANUP_RETRY_MS.length + 1
      && expiryCleanupRepairDeleteAttempts === 0,
    cidPersistsAfterDelete: responseMatchesBody(cidAfterDelete, expected)
      && bodyMatches(cidAfterDeleteBody, input),
  };
  const technicalPass = Object.values(checks).every(Boolean);
  const cleanupKeyReadsAbsent = (
    positiveMutationAttempted
      ? finalPositiveHead.status === 404 && finalPositiveGet.status === 404
      : preflightPositive.status === 404
  ) && (
    negativeMutationAttempted
      ? finalNegativeHead.status === 404
      : preflightNegative.status === 404
  ) && (
    expiryMutationAttempted
      ? finalExpiryHead.status === 404 && finalExpiryGet.status === 404
      : preflightExpiry.status === 404
  );
  const completedAt = new Date().toISOString();
  const evidence = {
    schema: 'youtick.l3-real-account-canary-evidence.v1',
    payloadCanonicalization: 'RFC8785_JCS',
    verdict: technicalPass ? 'EVIDENCE_MISSING' : 'NO_GO',
    technicalResult: technicalPass ? 'PASS' : 'NO_GO',
    run: {
      runId: input.runId,
      environment: config.environment,
      startedAt,
      completedAt,
    },
    provenance,
    target: {
      endpointOrigin: ENDPOINT,
      region: REGION,
      bucketSha256: sha256(new TextEncoder().encode(config.bucket)),
      cidGatewayBaseSha256: sha256(
        new TextEncoder().encode(config.cidGatewayBase),
      ),
    },
    vector: {
      vectorId: sha256(new TextEncoder().encode([
        input.body.byteLength,
        input.ciphertextSha256,
        ...SIGNED_HEADER_NAMES,
      ].join('\0'))),
      byteLength: input.body.byteLength,
      ciphertextSha256: input.ciphertextSha256,
      positiveProviderKeySha256: sha256(
        new TextEncoder().encode(input.positiveProviderKey),
      ),
      wrongLengthProviderKeySha256: sha256(
        new TextEncoder().encode(input.wrongLengthProviderKey),
      ),
      expiryProviderKeySha256: sha256(
        new TextEncoder().encode(input.expiryProviderKey),
      ),
      wrongLengthBodySha256: input.wrongLengthCiphertextSha256,
      wrongLengthSignedByteLength: input.body.byteLength,
      wrongLengthSentByteLength: input.body.byteLength - 1,
      wrongLengthDelta: -1,
      signedHeaderNames: SIGNED_HEADER_NAMES,
    },
    requestPolicy: {
      presignTtlSeconds: PRESIGN_TTL_SECONDS,
      timeoutMs: REQUEST_TIMEOUT_MS,
      headRetryMs: HEAD_RETRY_MS,
      cleanupRetryMs: CLEANUP_RETRY_MS,
      expiryPutTtlSeconds: EXPIRY_PRESIGN_TTL_SECONDS,
      expirySafetyMarginMs: EXPIRY_SAFETY_MARGIN_MS,
      positivePutAttempts: positiveMutationAttempted ? 1 : 0,
      postDeleteReplayPutAttempts: postDeleteReplayAttempted ? 1 : 0,
      expiryPutAttempts: expiryMutationAttempted ? 1 : 0,
      expiredReplayPutAttempts: expiredReplayAttempted ? 1 : 0,
      expiryCleanupDeleteAttempts,
    },
    observations: {
      preflightPositive,
      preflightNegative,
      preflightExpiry,
      wrongLength,
      wrongLengthHead,
      expiryPut,
      expiryHead,
      expiryGet,
      expiryGetBody,
      expiryDelete,
      expirySignedAt,
      expiryReplayedAt,
      expiryMonotonicElapsedMs,
      expiredReplay,
      postExpiryFreshHead,
      postExpiryFreshGet,
      expiryCleanupDelete,
      finalExpiryHead,
      finalExpiryGet,
      put,
      head,
      get,
      getBody,
      cidGet,
      cidGetBody,
      replays,
      headAfterReplay,
      getAfterReplay,
      getAfterReplayBody,
      deletePositive,
      deleteNegative,
      postDeletePositiveHead,
      postDeletePositiveGet,
      postDeleteNegativeHead,
      postDeleteReplay,
      postDeleteReplayHead,
      postDeleteReplayGet,
      postDeleteReplayGetBody,
      finalDeletePositive,
      finalPositiveHead,
      finalPositiveGet,
      finalNegativeHead,
      cidAfterDelete,
      cidAfterDeleteBody,
    },
    checks,
    observedCid: sharedCid,
    observedCidDetails: sharedCidDetails,
    cleanup: {
      keyReadsAbsent: cleanupKeyReadsAbsent,
      contentErased: false,
      cidMayRemainReachable: checks.cidPersistsAfterDelete,
      oldPutUrlRecreatedMapping:
        isSuccess(postDeleteReplay.status)
        && responseMatchesObject(postDeleteReplayHead, expected),
      safetyScans: cleanupSafetyScans,
      repairDeleteAttempts: cleanupRepairDeleteAttempts,
      expirySafetyScans: expiryCleanupSafetyScans,
      expiryRepairDeleteAttempts: expiryCleanupRepairDeleteAttempts,
    },
    redaction: {
      mode: 'ALLOWLIST_V1',
      rawUrlPresent: false,
      queryValuePresent: false,
      rawHeaderMapPresent: false,
      rawErrorMessagePresent: false,
      forbiddenSubstringMatches: 0,
    },
    limitations: [
      'REPLAY_BILLING_AND_QUOTA_DELTA_UNOBSERVABLE',
      ...(technicalPass ? [] : ['PRESIGNED_URL_EXPIRY_NOT_VERIFIED']),
      'AWS_CHUNKED_NOT_TESTED',
      'KEY_ROTATION_NOT_TESTED',
      'EXACT_20GB_RESUME_NOT_TESTED',
      'FILECOIN_DEAL_NOT_VERIFIED',
      'CDN_AND_PLAYBACK_NOT_VERIFIED',
    ],
  };
  const serialized = canonicalizeJson(evidence);
  const forbiddenMatches = countForbidden(serialized, config);
  if (forbiddenMatches !== 0) {
    throw new Error('EVIDENCE_REDACTION_FAILED');
  }
  if (!verifyEvidenceSemantics(evidence)) {
    throw new Error('EVIDENCE_SEMANTICS_FAILED');
  }
  evidence.evidencePayloadSha256 = computeEvidencePayloadSha256(evidence);
  return evidence;
}

export function computeEvidencePayloadSha256(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return null;
  }
  const { evidencePayloadSha256: _ignored, ...payload } = evidence;
  return sha256(new TextEncoder().encode(canonicalizeJson(payload)));
}

export function verifyEvidencePayloadSha256(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return false;
  }
  const { evidencePayloadSha256 } = evidence;
  return typeof evidencePayloadSha256 === 'string'
    && evidencePayloadSha256 === computeEvidencePayloadSha256(evidence);
}

export function verifyEvidenceDocument(evidence, expectedSchemaSha256) {
  return /^[0-9a-f]{64}$/.test(expectedSchemaSha256 ?? '')
    && evidence?.schema === 'youtick.l3-real-account-canary-evidence.v1'
    && evidence?.payloadCanonicalization === 'RFC8785_JCS'
    && evidence?.provenance?.evidenceSchemaSha256 === expectedSchemaSha256
    && verifyEvidencePayloadSha256(evidence)
    && verifyEvidenceSemantics(evidence);
}

export function verifyEvidenceSemantics(evidence) {
  try {
    const vector = evidence.vector;
    const observations = evidence.observations;
    const checks = evidence.checks;
    const expected = { byteLength: vector.byteLength };
    const input = {
      body: { byteLength: vector.byteLength },
      ciphertextSha256: vector.ciphertextSha256,
    };
    if (evidence.requestPolicy.expiryPutTtlSeconds
        !== EXPIRY_PRESIGN_TTL_SECONDS
      || evidence.requestPolicy.expirySafetyMarginMs
        !== EXPIRY_SAFETY_MARGIN_MS) {
      return false;
    }
    const parsedCid = parseCanonicalCid(
      evidence.observedCid,
      vector.ciphertextSha256,
    );
    const cidDetailsMatch = parsedCid !== null
      && canonicalizeJson(parsedCid) === canonicalizeJson(evidence.observedCidDetails);
    const cidAppearsEverywhere = parsedCid !== null
      && [observations.put, observations.head, observations.get]
        .every((response) => response.cidCandidates.includes(parsedCid.cid));
    const expiryCidDetails = commonCid(
      vector.ciphertextSha256,
      observations.expiryPut.cidCandidates,
      observations.expiryHead.cidCandidates,
      observations.expiryGet.cidCandidates,
    );
    const expiryRequiredElapsedMs = (
      evidence.requestPolicy.expiryPutTtlSeconds * 1000
    ) + evidence.requestPolicy.expirySafetyMarginMs;
    const expectedChecks = {
      executionCompleted: checks.executionCompleted === true,
      preflightAbsent: observations.preflightPositive.status === 404
        && observations.preflightNegative.status === 404
        && observations.preflightExpiry.status === 404,
      wrongLengthRejected:
        observations.wrongLength.providerOutcome === 'RESPONSE'
        && !observations.wrongLength.redirected
        && (observations.wrongLength.status === 400
          || observations.wrongLength.status === 403)
        && observations.wrongLengthHead.status === 404,
      putAccepted: observations.put.status === 200
        && !observations.put.redirected,
      headExact: responseMatchesObject(observations.head, expected),
      getExact: responseMatchesObject(observations.get, expected)
        && bodyMatches(observations.getBody, input),
      cidConsistent: cidDetailsMatch && cidAppearsEverywhere,
      cidGetExact: responseMatchesBody(observations.cidGet, expected)
        && bodyMatches(observations.cidGetBody, input),
      replayMeasured: observations.replays.length === 2
        && observations.replays.every((result) => (
          result.providerOutcome === 'RESPONSE'
          && Number.isInteger(result.status)
          && result.status === 200
        )),
      replayStable: responseMatchesObject(
        observations.headAfterReplay,
        expected,
      )
        && observations.headAfterReplay.cidCandidates.includes(
          evidence.observedCid,
        )
        && observations.headAfterReplay.etagSha256
          === observations.head.etagSha256
        && responseMatchesObject(observations.getAfterReplay, expected)
        && observations.getAfterReplay.cidCandidates.includes(
          evidence.observedCid,
        )
        && bodyMatches(observations.getAfterReplayBody, input),
      deleteAccepted: observations.deletePositive.status === 204
        && observations.deleteNegative.status === 204,
      initialKeyReadsAbsent:
        observations.postDeletePositiveHead.status === 404
        && observations.postDeletePositiveGet.status === 404
        && observations.postDeleteNegativeHead.status === 404,
      postDeleteReplayMeasured: responseMatchesReplayOutcome({
        put: observations.postDeleteReplay,
        head: observations.postDeleteReplayHead,
        get: observations.postDeleteReplayGet,
        getBody: observations.postDeleteReplayGetBody,
        expected,
        input,
        expectedCid: evidence.observedCid,
      }),
      finalDeleteAccepted: observations.finalDeletePositive.status === 204,
      finalKeyReadsAbsent: observations.finalPositiveHead.status === 404
        && observations.finalPositiveGet.status === 404
        && observations.finalNegativeHead.status === 404,
      expiryObjectVerified: observations.expiryPut.status === 200
        && !observations.expiryPut.redirected
        && responseMatchesObject(observations.expiryHead, expected)
        && responseMatchesObject(observations.expiryGet, expected)
        && bodyMatches(observations.expiryGetBody, input)
        && expiryCidDetails !== null
        && observations.expiryDelete.status === 204,
      expiryWindowElapsed: expiryTimingSatisfied({
        signedAt: observations.expirySignedAt,
        replayedAt: observations.expiryReplayedAt,
        monotonicElapsedMs: observations.expiryMonotonicElapsedMs,
        requiredElapsedMs: expiryRequiredElapsedMs,
      }),
      expiredPutRejected:
        observations.expiredReplay.providerOutcome === 'RESPONSE'
        && !observations.expiredReplay.redirected
        && observations.expiredReplay.status === 403,
      expiryMappingAbsent: observations.postExpiryFreshHead.status === 404
        && observations.postExpiryFreshGet.status === 404,
      expiryCleanupConverged:
        observations.expiryCleanupDelete.status === 204
        && observations.finalExpiryHead.status === 404
        && observations.finalExpiryGet.status === 404
        && evidence.cleanup.expirySafetyScans
          === evidence.requestPolicy.cleanupRetryMs.length + 1
        && evidence.cleanup.expiryRepairDeleteAttempts === 0,
      cidPersistsAfterDelete: responseMatchesBody(
        observations.cidAfterDelete,
        expected,
      ) && bodyMatches(observations.cidAfterDeleteBody, input),
    };
    if (!Object.entries(expectedChecks)
      .every(([name, result]) => checks[name] === result)) {
      return false;
    }
    const technicalPass = Object.values(checks).every((value) => value === true);
    if (evidence.technicalResult !== (technicalPass ? 'PASS' : 'NO_GO')
      || evidence.verdict
        !== (technicalPass ? 'EVIDENCE_MISSING' : 'NO_GO')) {
      return false;
    }
    if (technicalPass
      && (evidence.requestPolicy.positivePutAttempts !== 1
        || evidence.requestPolicy.postDeleteReplayPutAttempts !== 1
        || evidence.requestPolicy.expiryPutAttempts !== 1
        || evidence.requestPolicy.expiredReplayPutAttempts !== 1
        || evidence.requestPolicy.expiryCleanupDeleteAttempts !== 1)) {
      return false;
    }
    if (evidence.requestPolicy.expiryCleanupDeleteAttempts !== (
      evidence.requestPolicy.expiredReplayPutAttempts
        + evidence.cleanup.expiryRepairDeleteAttempts
    )) {
      return false;
    }
    const cleanupKeyReadsAbsent = (
      evidence.requestPolicy.positivePutAttempts > 0
        ? observations.finalPositiveHead.status === 404
          && observations.finalPositiveGet.status === 404
        : observations.preflightPositive.status === 404
    ) && (
      checks.preflightAbsent
        ? observations.finalNegativeHead.status === 404
        : observations.preflightNegative.status === 404
    ) && (
      evidence.requestPolicy.expiryPutAttempts > 0
        ? observations.finalExpiryHead.status === 404
          && observations.finalExpiryGet.status === 404
        : observations.preflightExpiry.status === 404
    );
    if (evidence.cleanup.keyReadsAbsent !== cleanupKeyReadsAbsent
      || evidence.cleanup.cidMayRemainReachable
        !== checks.cidPersistsAfterDelete
      || evidence.cleanup.contentErased !== false
      || evidence.cleanup.oldPutUrlRecreatedMapping !== (
        isSuccess(observations.postDeleteReplay.status)
        && responseMatchesObject(observations.postDeleteReplayHead, expected)
      )) {
      return false;
    }
    const expiryLimitation =
      evidence.limitations.includes('PRESIGNED_URL_EXPIRY_NOT_VERIFIED');
    if (expiryLimitation === technicalPass) return false;
    const responses = [
      observations.preflightPositive,
      observations.preflightNegative,
      observations.preflightExpiry,
      observations.wrongLength,
      observations.wrongLengthHead,
      observations.expiryPut,
      observations.expiryHead,
      observations.expiryGet,
      observations.expiryDelete,
      observations.expiredReplay,
      observations.postExpiryFreshHead,
      observations.postExpiryFreshGet,
      observations.expiryCleanupDelete,
      observations.finalExpiryHead,
      observations.finalExpiryGet,
      observations.put,
      observations.head,
      observations.get,
      observations.cidGet,
      ...observations.replays,
      observations.headAfterReplay,
      observations.getAfterReplay,
      observations.deletePositive,
      observations.deleteNegative,
      observations.postDeletePositiveHead,
      observations.postDeletePositiveGet,
      observations.postDeleteNegativeHead,
      observations.postDeleteReplay,
      observations.postDeleteReplayHead,
      observations.postDeleteReplayGet,
      observations.finalDeletePositive,
      observations.finalPositiveHead,
      observations.finalPositiveGet,
      observations.finalNegativeHead,
      observations.cidAfterDelete,
    ];
    return responses.every((response) => {
      if (response.providerOutcome === 'RESPONSE') {
        return Number.isInteger(response.status);
      }
      return response.providerOutcome === 'NO_RESPONSE'
        && canonicalizeJson(response) === canonicalizeJson(emptyResponse());
    });
  } catch {
    return false;
  }
}

async function createGrants({ config, input, credentials }) {
  const common = {
    bucket: config.bucket,
    jobId: input.jobId,
    ciphertextSha256: input.ciphertextSha256,
    byteLength: input.body.byteLength,
    credentials,
    now: input.now,
  };
  const [positivePut, wrongLengthPut, positiveHead, negativeHead,
    expiryHead, positiveGet, expiryGet, positiveDelete, negativeDelete,
    expiryDelete] = await Promise.all([
    presignL3CanaryPut({
      ...common,
      ordinal: 0,
      providerKey: input.positiveProviderKey,
    }),
    presignL3CanaryPut({
      ...common,
      ciphertextSha256: input.wrongLengthCiphertextSha256,
      ordinal: 1,
      providerKey: input.wrongLengthProviderKey,
    }),
    presignRequest({
      method: 'HEAD',
      bucket: config.bucket,
      providerKey: input.positiveProviderKey,
      credentials,
      now: input.now,
    }),
    presignRequest({
      method: 'HEAD',
      bucket: config.bucket,
      providerKey: input.wrongLengthProviderKey,
      credentials,
      now: input.now,
    }),
    presignRequest({
      method: 'HEAD',
      bucket: config.bucket,
      providerKey: input.expiryProviderKey,
      credentials,
      now: input.now,
    }),
    presignRequest({
      method: 'GET',
      bucket: config.bucket,
      providerKey: input.positiveProviderKey,
      credentials,
      now: input.now,
    }),
    presignRequest({
      method: 'GET',
      bucket: config.bucket,
      providerKey: input.expiryProviderKey,
      credentials,
      now: input.now,
    }),
    presignRequest({
      method: 'DELETE',
      bucket: config.bucket,
      providerKey: input.positiveProviderKey,
      credentials,
      now: input.now,
    }),
    presignRequest({
      method: 'DELETE',
      bucket: config.bucket,
      providerKey: input.wrongLengthProviderKey,
      credentials,
      now: input.now,
    }),
    presignRequest({
      method: 'DELETE',
      bucket: config.bucket,
      providerKey: input.expiryProviderKey,
      credentials,
      now: input.now,
    }),
  ]);
  return {
    positivePut,
    wrongLengthPut,
    positiveHead,
    negativeHead,
    expiryHead,
    positiveGet,
    expiryGet,
    positiveDelete,
    negativeDelete,
    expiryDelete,
  };
}

export async function presignL3CanaryPut({
  bucket,
  providerKey,
  jobId,
  ordinal,
  ciphertextSha256,
  byteLength,
  credentials,
  now,
  expiresInSeconds = PRESIGN_TTL_SECONDS,
}) {
  validatePresignTtl(expiresInSeconds);
  const headers = {
    'content-length': String(byteLength),
    'content-type': 'application/octet-stream',
    'x-amz-meta-youtick-ciphertext-sha256': ciphertextSha256,
    'x-amz-meta-youtick-job-id': jobId,
    'x-amz-meta-youtick-object-ordinal': String(ordinal),
  };
  const url = objectUrl(bucket, providerKey);
  url.searchParams.set('X-Amz-Expires', String(expiresInSeconds));
  const signed = await new AwsV4Signer({
    method: 'PUT',
    url: url.toString(),
    headers,
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    service: 's3',
    region: REGION,
    datetime: awsDate(now),
    signQuery: true,
    allHeaders: true,
  }).sign();
  return {
    url: signed.url.toString(),
    headers: {
      'Content-Length': headers['content-length'],
      'Content-Type': headers['content-type'],
      'x-amz-meta-youtick-ciphertext-sha256':
        headers['x-amz-meta-youtick-ciphertext-sha256'],
      'x-amz-meta-youtick-job-id': headers['x-amz-meta-youtick-job-id'],
      'x-amz-meta-youtick-object-ordinal':
        headers['x-amz-meta-youtick-object-ordinal'],
    },
  };
}

async function presignRequest({
  method,
  bucket,
  providerKey,
  credentials,
  now,
  expiresInSeconds = PRESIGN_TTL_SECONDS,
}) {
  validatePresignTtl(expiresInSeconds);
  const url = objectUrl(bucket, providerKey);
  url.searchParams.set('X-Amz-Expires', String(expiresInSeconds));
  const signed = await new AwsV4Signer({
    method,
    url: url.toString(),
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    service: 's3',
    region: REGION,
    datetime: awsDate(now),
    signQuery: true,
    allHeaders: true,
  }).sign();
  return signed.url.toString();
}

async function createExpiryCleanupGrants({
  config,
  input,
  credentials,
  now,
}) {
  const common = {
    bucket: config.bucket,
    providerKey: input.expiryProviderKey,
    credentials,
    now,
  };
  const [head, get, deleteGrant] = await Promise.all([
    presignRequest({ ...common, method: 'HEAD' }),
    presignRequest({ ...common, method: 'GET' }),
    presignRequest({ ...common, method: 'DELETE' }),
  ]);
  return { head, get, delete: deleteGrant };
}

async function pollHead({ request, url, expectedMetadata, waitImpl }) {
  let result = emptyResponse();
  for (const delay of HEAD_RETRY_MS) {
    if (delay > 0) await waitImpl(delay);
    result = summarizeResponse(
      await request(url, { method: 'HEAD' }),
      expectedMetadata,
    );
    if (result.status === 200 || result.status === null) break;
  }
  return result;
}

async function convergeKeyMappingsAbsent({
  request,
  grants,
  positiveMetadata,
  negativeMetadata,
  positiveMutationAttempted,
  negativeMutationAttempted,
  waitImpl,
}) {
  let positiveHead = emptyResponse();
  let positiveGet = emptyResponse();
  let negativeHead = emptyResponse();
  let scanCount = 0;
  let repairDeleteAttempts = 0;

  const scan = async () => {
    if (positiveMutationAttempted) {
      positiveHead = summarizeResponse(
        await request(grants.positiveHead, { method: 'HEAD' }),
        positiveMetadata,
      );
      positiveGet = summarizeResponse(
        await request(grants.positiveGet, { method: 'GET' }),
        positiveMetadata,
      );
    }
    if (negativeMutationAttempted) {
      negativeHead = summarizeResponse(
        await request(grants.negativeHead, { method: 'HEAD' }),
        negativeMetadata,
      );
    }
    scanCount += 1;
  };

  for (const delay of CLEANUP_RETRY_MS) {
    if (delay > 0) await waitImpl(delay);
    await scan();
    const positiveAbsent = !positiveMutationAttempted
      || (positiveHead.status === 404 && positiveGet.status === 404);
    const negativeAbsent = !negativeMutationAttempted
      || negativeHead.status === 404;
    if (positiveAbsent && negativeAbsent) continue;
    if (positiveMutationAttempted) {
      await request(grants.positiveDelete, { method: 'DELETE' });
      repairDeleteAttempts += 1;
    }
    if (negativeMutationAttempted) {
      await request(grants.negativeDelete, { method: 'DELETE' });
      repairDeleteAttempts += 1;
    }
  }
  await scan();
  return {
    positiveHead,
    positiveGet,
    negativeHead,
    scanCount,
    repairDeleteAttempts,
  };
}

async function convergeExpiryKeyAbsent({
  request,
  grants,
  expectedMetadata,
  waitImpl,
}) {
  let head = emptyResponse();
  let get = emptyResponse();
  let scanCount = 0;
  let repairDeleteAttempts = 0;

  for (const delay of CLEANUP_RETRY_MS) {
    if (delay > 0) await waitImpl(delay);
    head = summarizeResponse(
      await request(grants.head, { method: 'HEAD' }),
      expectedMetadata,
    );
    get = summarizeResponse(
      await request(grants.get, { method: 'GET' }),
      expectedMetadata,
    );
    scanCount += 1;
    if (head.status === 404 && get.status === 404) continue;
    await request(grants.delete, { method: 'DELETE' });
    repairDeleteAttempts += 1;
  }
  head = summarizeResponse(
    await request(grants.head, { method: 'HEAD' }),
    expectedMetadata,
  );
  get = summarizeResponse(
    await request(grants.get, { method: 'GET' }),
    expectedMetadata,
  );
  scanCount += 1;
  return { head, get, scanCount, repairDeleteAttempts };
}

async function safeFetch(fetchImpl, url, init) {
  try {
    return { response: await fetchImpl(url, init), providerOutcome: 'RESPONSE' };
  } catch {
    return { response: null, providerOutcome: 'NO_RESPONSE' };
  }
}

function summarizeResponse(result, expectedMetadata = null) {
  const response = result.response;
  if (!response) return emptyResponse();
  const headerNames = [...response.headers.keys()].map((name) => name.toLowerCase()).sort();
  const cidHeader = response.headers.get('x-amz-meta-cid');
  const cidCandidates = cidHeader !== null
    && (CID_V0_PATTERN.test(cidHeader) || CID_V1_PATTERN.test(cidHeader))
    ? [cidHeader]
    : [];
  const etag = response.headers.get('etag');
  return {
    providerOutcome: result.providerOutcome,
    status: response.status,
    redirected: response.redirected,
    headerNames,
    contentLength: parseContentLength(response.headers.get('content-length')),
    contentRangePresent: response.headers.has('content-range'),
    contentEncodingPresent: response.headers.has('content-encoding'),
    metadataMatches: expectedMetadata === null
      ? null
      : Object.entries(expectedMetadata)
        .every(([name, value]) => response.headers.get(name) === value),
    cidCandidates,
    etagPresent: etag !== null,
    etagSha256: etag === null ? null : sha256(new TextEncoder().encode(etag)),
    requestIdPresent: response.headers.has('x-amz-request-id'),
  };
}

async function readBoundedBody(response, maximumBytes) {
  if (!response?.body) return emptyBody();
  const reader = response.body.getReader();
  const digest = createHash('sha256');
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maximumBytes) {
      await reader.cancel('bounded canary read exceeded');
      return { byteLength, sha256: null, overflow: true };
    }
    digest.update(value);
  }
  return { byteLength, sha256: digest.digest('hex'), overflow: false };
}

function responseMatchesObject(response, expected) {
  return response.status === 200
    && !response.redirected
    && response.contentLength === expected.byteLength
    && !response.contentRangePresent
    && !response.contentEncodingPresent
    && response.metadataMatches === true;
}

function responseMatchesBody(response, expected) {
  return response.status === 200
    && !response.redirected
    && response.contentLength === expected.byteLength
    && !response.contentRangePresent
    && !response.contentEncodingPresent;
}

function responseMatchesReplayOutcome({
  put,
  head,
  get,
  getBody,
  expected,
  input,
  expectedCid,
}) {
  if (put.providerOutcome !== 'RESPONSE' || !Number.isInteger(put.status)) {
    return false;
  }
  return put.status === 200
    && responseMatchesObject(head, expected)
    && responseMatchesObject(get, expected)
    && head.cidCandidates.includes(expectedCid)
    && get.cidCandidates.includes(expectedCid)
    && bodyMatches(getBody, input);
}

function bodyMatches(body, input) {
  return body.byteLength === input.body.byteLength
    && body.sha256 === input.ciphertextSha256
    && body.overflow === false;
}

function expiryTimingSatisfied({
  signedAt,
  replayedAt,
  monotonicElapsedMs,
  requiredElapsedMs,
}) {
  const signedAtMs = Date.parse(signedAt);
  const replayedAtMs = Date.parse(replayedAt);
  return Number.isFinite(signedAtMs)
    && Number.isFinite(replayedAtMs)
    && Number.isSafeInteger(monotonicElapsedMs)
    && Number.isSafeInteger(requiredElapsedMs)
    && requiredElapsedMs > 0
    && replayedAtMs - signedAtMs >= requiredElapsedMs
    && monotonicElapsedMs >= requiredElapsedMs;
}

function expectedMetadata(input, ordinal) {
  return {
    'x-amz-meta-youtick-ciphertext-sha256': ordinal === 1
      ? input.wrongLengthCiphertextSha256
      : input.ciphertextSha256,
    'x-amz-meta-youtick-job-id': input.jobId,
    'x-amz-meta-youtick-object-ordinal': String(ordinal),
  };
}

function commonCid(expectedCiphertextSha256, ...collections) {
  const cid = collections[0]?.find((candidate) => (
    collections.slice(1).every((values) => values.includes(candidate))
  )) ?? null;
  return parseCanonicalCid(cid, expectedCiphertextSha256);
}

export function parseCanonicalCid(value, expectedCiphertextSha256) {
  if (!/^[0-9a-f]{64}$/.test(expectedCiphertextSha256 ?? '')) {
    return null;
  }
  if (CID_V0_PATTERN.test(value ?? '')) {
    const bytes = decodeBase58(value);
    if (bytes === null
      || bytes.byteLength !== 34
      || bytes[0] !== 0x12
      || bytes[1] !== 0x20) {
      return null;
    }
    return {
      cid: value,
      version: 0,
      codec: 'dag-pb',
      multihash: 'sha2-256-32',
      rawDigestMatchesCiphertext: null,
    };
  }
  if (!CID_V1_PATTERN.test(value ?? '')) return null;
  const bytes = decodeBase32(value.slice(1));
  if (bytes === null
    || bytes.byteLength !== 36
    || bytes[0] !== 0x01
    || (bytes[1] !== 0x55 && bytes[1] !== 0x70)
    || bytes[2] !== 0x12
    || bytes[3] !== 0x20) {
    return null;
  }
  const codec = bytes[1] === 0x55 ? 'raw' : 'dag-pb';
  const digest = Buffer.from(bytes.subarray(4)).toString('hex');
  const rawDigestMatchesCiphertext = codec === 'raw'
    ? digest === expectedCiphertextSha256
    : null;
  if (rawDigestMatchesCiphertext === false) return null;
  return {
    cid: value,
    version: 1,
    codec,
    multihash: 'sha2-256-32',
    rawDigestMatchesCiphertext,
  };
}

function decodeBase58(value) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let number = 0n;
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) return null;
    number = number * 58n + BigInt(digit);
  }
  const output = [];
  while (number > 0n) {
    output.push(Number(number & 0xffn));
    number >>= 8n;
  }
  output.reverse();
  return Uint8Array.from(output);
}

function decodeBase32(value) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  const output = [];
  let buffer = 0;
  let bits = 0;
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) return null;
    buffer = (buffer << 5) | digit;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      output.push((buffer >> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }
  if (bits > 0 && buffer !== 0) return null;
  return Uint8Array.from(output);
}

function objectUrl(bucket, providerKey) {
  return new URL(`${ENDPOINT}/${bucket}/${providerKey}`);
}

function cidUrl(base, cid) {
  return `${base}/${cid}`;
}

function awsDate(now) {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function parseContentLength(value) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function validNow(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error('Invalid wall clock');
  }
  return value;
}

function validMonotonicNow(value) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Invalid monotonic clock');
  }
  return value;
}

function validatePresignTtl(value) {
  if (!Number.isInteger(value) || value < 1 || value > 7 * 24 * 60 * 60) {
    throw new Error('Invalid presign TTL');
  }
}

function validateGatewayBase(value) {
  if (!value) throw new Error('L3_CANARY_CID_GATEWAY_BASE is required');
  const url = new URL(value);
  if (url.protocol !== 'https:'
    || url.username
    || url.password
    || url.search
    || url.hash
    || url.pathname === '/') {
    throw new Error('Invalid L3_CANARY_CID_GATEWAY_BASE');
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

function countForbidden(serialized, config) {
  return [
    config.accessKeyId,
    config.secretAccessKey,
    'X-Amz-Signature=',
    'X-Amz-Credential=',
    'X-Amz-Security-Token=',
  ].filter((value) => value && serialized.includes(value)).length;
}

function emptyResponse() {
  return {
    providerOutcome: 'NO_RESPONSE',
    status: null,
    redirected: false,
    headerNames: [],
    contentLength: null,
    contentRangePresent: false,
    contentEncodingPresent: false,
    metadataMatches: null,
    cidCandidates: [],
    etagPresent: false,
    etagSha256: null,
    requestIdPresent: false,
  };
}

function emptyBody() {
  return { byteLength: null, sha256: null, overflow: false };
}

function isSuccess(status) {
  return status >= 200 && status < 300;
}

export function canonicalizeJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite JSON number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`
    )).join(',')}}`;
  }
  throw new Error('Unsupported JSON value');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  let config;
  try {
    config = readConfig();
    const input = createCanaryInput();
    const provenance = await readProvenance();
    await writeRecoveryRecord(config, input);
    console.error(JSON.stringify({
      recovery: 'WRITTEN_TO_OPERATOR_PATH',
      runId: input.runId,
    }));
    const evidence = await runL3AccountCanary({
      config,
      input,
      provenance,
    });
    console.log(JSON.stringify(evidence, null, 2));
    process.exitCode = evidence.technicalResult === 'PASS' ? 0 : 2;
  } catch {
    console.error('[l3-account-canary] CANARY_EXECUTION_FAILED');
    process.exitCode = 1;
  }
}

if (fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main();
}
