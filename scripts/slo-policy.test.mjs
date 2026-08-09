import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('SLO policy locks report thresholds to emitted bounded events', async () => {
    const policy = JSON.parse(await readFile(new URL('observability/slo-policy.json', root), 'utf8'));
    const runbook = await readFile(new URL('docs/testnet-pilot-runbook.md', root), 'utf8');
    const sources = await Promise.all([
        'workers/livepeer-bridge/src/index.ts',
        'read-model/api.mjs',
        'contracts/nft-ticket/src/lib.rs',
        'workers/livepeer-bridge/scripts/near-finality-canary.mjs',
        'workers/livepeer-bridge/scripts/tus-resume-canary.mjs',
        'workers/livepeer-bridge/wrangler.toml',
        'workers/livepeer-bridge/src/durable-object-capacity.ts',
    ].map((path) => readFile(new URL(path, root), 'utf8')));
    const source = sources.join('\n');
    assert.equal(policy.schema, 'youtick.slo-policy.v1');
    assert.equal(policy.status, 'SOURCE_ONLY');
    assert.deepEqual(policy.incident_response, {
        status: 'SOURCE_ONLY',
        execution: 'MANUAL_APPROVAL_REQUIRED',
        runbook: 'docs/testnet-pilot-runbook.md#incident-ilk-mudahale',
        owner_assignment: 'ROLE_ONLY',
        named_on_call: 'EXTERNAL_EVIDENCE_REQUIRED',
        notification_delivery: 'EXTERNAL_EVIDENCE_REQUIRED',
        drill_evidence: 'EXTERNAL_EVIDENCE_REQUIRED',
    });
    assert.deepEqual(policy.domain_controls.map(({ id, source_status: sourceStatus }) => (
        [id, sourceStatus]
    )), [
        ['playback_issuance', 'SOURCE_READY'],
        ['new_purchases', 'SOURCE_READY'],
        ['new_uploads', 'SOURCE_READY'],
        ['provider_mutation', 'SOURCE_READY'],
        ['multi_asset_quote', 'SOURCE_READY'],
        ['contract_operator_operations', 'SOURCE_READY'],
    ]);
    const sourceControls = Object.fromEntries(policy.domain_controls
        .filter(({ control }) => control)
        .map(({ id, control, closed_value: closedValue }) => [id, [control, closedValue]]));
    assert.deepEqual(sourceControls, {
        playback_issuance: ['LIVEPEER_PLAYBACK_ISSUANCE_ENABLED', 'false'],
        new_uploads: ['LIVEPEER_NEW_UPLOADS_ENABLED', 'false'],
        provider_mutation: ['LIVEPEER_PROVIDER_MUTATIONS_ENABLED', 'false'],
        multi_asset_quote: ['MULTI_ASSET_PAYMENTS_MODE', 'off'],
        contract_operator_operations: ['LIVEPEER_OPERATOR_MUTATIONS_ENABLED', 'false'],
    });
    for (const [control, closedValue] of Object.values(sourceControls)) {
        assert.ok(source.includes(control), control);
        assert.ok(source.includes(`${control} = "${closedValue}"`), `${control}: default`);
    }
    assert.deepEqual(policy.domain_controls.find(({ id }) => id === 'new_purchases'), {
        id: 'new_purchases',
        source_status: 'SOURCE_READY',
        contract_control: 'pause_new_purchases',
        closed_value: 'paused',
        reopen_control: 'unpause_new_purchases',
        authority: 'guardian_pause_admin_unpause',
        state_view: 'get_governance_state.new_purchases_paused',
    });
    assert.ok(source.includes('pub fn pause_new_purchases('));
    assert.ok(source.includes('pub fn unpause_new_purchases('));
    assert.ok(source.includes('"new_purchases_paused"'));
    assert.ok(source.includes('"new_purchases_unpaused"'));
    assert.deepEqual(
        policy.acceptance_gates.map(({
            id, source_status: sourceStatus, operator, threshold, unit,
        }) => [id, sourceStatus, operator, threshold, unit]),
        [
            ['legacy_v2_shadow_mismatch_ratio', 'SOURCE_READY', '=', 0, 'ratio'],
            ['upload_resume_success_ratio', 'SOURCE_PARTIAL', '>=', 0.99, 'ratio'],
            ['upload_recovery_duplicate_payment_count', 'EXTERNAL_EVIDENCE_REQUIRED', '=', 0, 'count'],
            ['upload_recovery_duplicate_provider_asset_count', 'SOURCE_PARTIAL', '=', 0, 'count'],
            ['durable_object_max_persistent_records', 'SOURCE_READY', '<=', 256, 'records_per_object'],
        ],
    );
    assert.ok(source.includes(`'${policy.acceptance_gates[0].source_event}'`));
    assert.ok(source.includes(policy.acceptance_gates[1].source_receipt));
    const durableObjectGate = policy.acceptance_gates.find(
        ({ id }) => id === 'durable_object_max_persistent_records',
    );
    assert.equal(durableObjectGate.source_event, 'durable_object_storage_observed');
    assert.equal(durableObjectGate.field, 'projectedRecordCount');
    assert.ok(source.includes(`'${durableObjectGate.source_event}'`));
    assert.ok(source.includes(durableObjectGate.field));
    assert.deepEqual(
        Object.fromEntries(policy.objectives.map(({ id, threshold }) => [id, threshold])),
        {
            playback_cache_hit_p95_ms: 500,
            playback_internal_error_ratio: 0.005,
            webhook_queue_ack_p95_ms: 500,
            upload_intent_control_p95_ms: 750,
            read_model_discover_p95_ms: 300,
        },
    );
    for (const objective of policy.objectives) {
        assert.ok(source.includes(`'${objective.source_event}'`), objective.source_event);
        for (const event of objective.denominator_events ?? []) {
            assert.ok(source.includes(`'${event}'`), event);
        }
    }
    for (const alert of policy.alerts.filter(({ source_event }) => source_event)) {
        assert.ok(source.includes(`'${alert.source_event}'`), alert.source_event);
    }
    for (const alert of policy.alerts.filter(({ source_method }) => source_method)) {
        assert.ok(source.includes(`fn ${alert.source_method}(`), alert.source_method);
    }
    for (const alert of policy.alerts.filter(({ source_probe }) => source_probe)) {
        assert.ok(source.includes(`function ${alert.source_probe}(`), alert.source_probe);
    }
    assert.deepEqual(policy.alerts.map(({ id }) => id), [
        'bridge_config_mismatch',
        'provider_public_playback_exposure',
        'takedown_token_issuance_attempt',
        'queue_backlog',
        'operator_nonce_stuck',
        'admission_budget_threshold',
        'contract_storage_reserve_threshold',
        'rpc_finality_lag',
        'elevated_playback_error',
    ]);
    const allowedOwnerRoles = new Set(['PLATFORM_SRE', 'SECURITY', 'CONTRACT_OPERATIONS']);
    for (const alert of policy.alerts) {
        assert.ok(allowedOwnerRoles.has(alert.owner_role), `${alert.id}: owner_role`);
        assert.match(alert.first_action, /^[a-z][a-z0-9_]+$/, `${alert.id}: first_action`);
        assert.ok(runbook.includes(`\`${alert.first_action}\``), `${alert.id}: runbook action`);
    }
    assert.deepEqual(
        Object.fromEntries(policy.alerts
            .filter(({ control }) => control)
            .map(({ id, control }) => [id, control])),
        {
            provider_public_playback_exposure: 'LIVEPEER_PLAYBACK_ISSUANCE_ENABLED',
            queue_backlog: 'LIVEPEER_NEW_UPLOADS_ENABLED',
            elevated_playback_error: 'LIVEPEER_PLAYBACK_ISSUANCE_ENABLED',
        },
    );
    assert.doesNotMatch(JSON.stringify(policy), /control_gap|MISSING_DOMAIN_CONTROL/);
    assert.equal(
        policy.alerts.find(({ id }) => id === 'takedown_token_issuance_attempt').source_status,
        'SOURCE_READY',
    );
    assert.equal(
        policy.alerts.find(({ id }) => id === 'operator_nonce_stuck').source_status,
        'SOURCE_PARTIAL',
    );
    assert.deepEqual(
        policy.alerts.find(({ id }) => id === 'queue_backlog'),
        {
            id: 'queue_backlog',
            source_status: 'SOURCE_PARTIAL',
            source_event: 'webhook_queue_delivery_completed',
            source_field: 'queueLagMs',
            missing: 'deployed_queue_depth_aggregation_approved_lag_threshold_and_alert_delivery',
            owner_role: 'PLATFORM_SRE',
            first_action: 'close_new_uploads_and_inspect_dlq',
            control: 'LIVEPEER_NEW_UPLOADS_ENABLED',
        },
    );
    assert.equal(
        policy.alerts.find(({ id }) => id === 'contract_storage_reserve_threshold').source_status,
        'SOURCE_PARTIAL',
    );
    assert.equal(
        policy.alerts.find(({ id }) => id === 'rpc_finality_lag').source_status,
        'SOURCE_PARTIAL',
    );
    assert.doesNotMatch(JSON.stringify(policy), /MISSING_SIGNAL|EXTERNAL_METRIC_REQUIRED/);
    assert.doesNotMatch(
        JSON.stringify(policy),
        /private_key|authorization_header|provider_token|signed_transaction|tus_url/i,
    );
});
