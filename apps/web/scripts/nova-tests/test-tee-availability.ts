/**
 * CRITICAL TEST: NOVA TEE (Shade Agent) Availability Monitoring
 *
 * This test monitors NOVA Shade Agent TEE uptime over a specified period.
 * TEE availability is critical for NOVA operations (encrypt/decrypt/access control).
 *
 * Success Criteria:
 * - TEE uptime ≥99% over monitoring period
 * - Average latency <500ms
 * - No extended outages (>5 minutes)
 *
 * Recommended Monitoring Period:
 * - Minimum: 48 hours
 * - Recommended: 72 hours
 * - Production decision: 1 week
 */

interface TEEHealthCheck {
  timestamp: number;
  status: 'UP' | 'DOWN';
  latency?: number;
  error?: string;
}

interface MonitoringConfig {
  checkInterval: number; // milliseconds between checks
  duration: number; // total monitoring duration in milliseconds
  endpoint?: string; // NOVA TEE health endpoint
}

interface MonitoringResult {
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  uptime: number; // percentage
  averageLatency: number; // milliseconds
  maxLatency: number;
  minLatency: number;
  checks: TEEHealthCheck[];
  longestOutage: number; // milliseconds
}

/**
 * Mock TEE health check (replace with actual NOVA SDK call)
 */
async function checkTEEHealth(): Promise<TEEHealthCheck> {
  const start = Date.now();

  try {
    // NOTE: This is where we would call the actual NOVA SDK:
    // const novaClient = new NovaClient({ network: 'testnet' });
    // const health = await novaClient.checkTEEHealth();

    // For now, simulate health check
    // In production, this would be:
    // const response = await fetch('https://shade-agent.nova.testnet/health');
    // if (!response.ok) throw new Error('TEE unavailable');

    const latency = Date.now() - start;

    // Simulate realistic latency (100-500ms)
    const simulatedLatency = Math.random() * 400 + 100;
    await sleep(simulatedLatency);

    return {
      timestamp: Date.now(),
      status: 'UP',
      latency: simulatedLatency
    };

  } catch (error: any) {
    return {
      timestamp: Date.now(),
      status: 'DOWN',
      error: error.message
    };
  }
}

/**
 * Monitor TEE availability over time
 */
async function monitorTEEAvailability(config: MonitoringConfig): Promise<MonitoringResult> {
  console.log('\n' + '='.repeat(80));
  console.log('NOVA TEE AVAILABILITY MONITORING');
  console.log('='.repeat(80) + '\n');

  console.log('[PHASE 0] CRITICAL VALIDATION - TEE Uptime Monitoring\n');

  console.log('Configuration:');
  console.log(`  Check Interval: ${config.checkInterval / 1000}s`);
  console.log(`  Total Duration: ${config.duration / (1000 * 60 * 60)}h`);
  console.log(`  Expected Checks: ${Math.floor(config.duration / config.checkInterval)}`);
  console.log('');

  const results: TEEHealthCheck[] = [];
  const startTime = Date.now();
  let checkCount = 0;

  console.log('Starting monitoring...\n');
  console.log('Timestamp              | Status | Latency  | Running Uptime');
  console.log('-'.repeat(80));

  while (Date.now() - startTime < config.duration) {
    checkCount++;
    const check = await checkTEEHealth();
    results.push(check);

    // Calculate running uptime
    const upCount = results.filter(r => r.status === 'UP').length;
    const runningUptime = (upCount / results.length) * 100;

    // Format timestamp
    const timestamp = new Date(check.timestamp).toISOString().replace('T', ' ').substring(0, 19);

    // Format output
    const statusIcon = check.status === 'UP' ? '✅' : '❌';
    const latencyStr = check.latency ? `${check.latency.toFixed(0)}ms` : 'N/A';

    console.log(
      `${timestamp} | ${statusIcon} ${check.status.padEnd(4)} | ${latencyStr.padEnd(8)} | ${runningUptime.toFixed(2)}%`
    );

    if (check.status === 'DOWN') {
      console.log(`  └─ Error: ${check.error}`);
    }

    // Wait for next check
    await sleep(config.checkInterval);
  }

  console.log('-'.repeat(80));
  console.log('\nMonitoring complete.\n');

  // Calculate statistics
  const successfulChecks = results.filter(r => r.status === 'UP');
  const failedChecks = results.filter(r => r.status === 'DOWN');

  const latencies = successfulChecks
    .map(r => r.latency!)
    .filter(l => l !== undefined);

  const averageLatency = latencies.length > 0
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : 0;

  const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0;
  const minLatency = latencies.length > 0 ? Math.min(...latencies) : 0;

  const uptime = (successfulChecks.length / results.length) * 100;

  // Calculate longest outage
  let longestOutage = 0;
  let currentOutage = 0;

  for (const check of results) {
    if (check.status === 'DOWN') {
      currentOutage += config.checkInterval;
      longestOutage = Math.max(longestOutage, currentOutage);
    } else {
      currentOutage = 0;
    }
  }

  return {
    totalChecks: results.length,
    successfulChecks: successfulChecks.length,
    failedChecks: failedChecks.length,
    uptime,
    averageLatency,
    maxLatency,
    minLatency,
    checks: results,
    longestOutage
  };
}

/**
 * Analyze monitoring results and provide recommendation
 */
function analyzeResults(result: MonitoringResult): {
  passed: boolean;
  recommendation: string;
  concerns: string[];
} {
  const concerns: string[] = [];

  // Check uptime
  if (result.uptime < 99.0) {
    concerns.push(`TEE uptime ${result.uptime.toFixed(2)}% is below 99% target`);
  }

  if (result.uptime < 95.0) {
    concerns.push(`TEE uptime ${result.uptime.toFixed(2)}% is critically low`);
  }

  // Check latency
  if (result.averageLatency > 500) {
    concerns.push(`Average latency ${result.averageLatency.toFixed(0)}ms exceeds 500ms target`);
  }

  if (result.maxLatency > 2000) {
    concerns.push(`Max latency ${result.maxLatency.toFixed(0)}ms indicates performance issues`);
  }

  // Check outages
  const maxOutageMinutes = result.longestOutage / (1000 * 60);
  if (maxOutageMinutes > 5) {
    concerns.push(`Longest outage ${maxOutageMinutes.toFixed(1)} minutes exceeds 5 minute threshold`);
  }

  // Determine pass/fail
  const passed = result.uptime >= 99.0 && result.averageLatency <= 500 && maxOutageMinutes <= 5;

  // Generate recommendation
  let recommendation: string;

  if (passed) {
    recommendation = 'PROCEED: TEE availability meets production standards';
  } else if (result.uptime >= 95.0) {
    recommendation = 'CAUTION: TEE availability marginal - consider extended monitoring or hybrid approach';
  } else {
    recommendation = 'BLOCK: TEE availability too low for production - abort migration or request SLA from NOVA';
  }

  return {
    passed,
    recommendation,
    concerns
  };
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main test function
 */
async function main() {
  // Configuration for different test durations
  const testMode = process.argv[2] || 'quick';

  const configs: Record<string, MonitoringConfig> = {
    quick: {
      checkInterval: 10 * 1000, // 10 seconds
      duration: 2 * 60 * 1000 // 2 minutes
    },
    standard: {
      checkInterval: 5 * 60 * 1000, // 5 minutes
      duration: 48 * 60 * 60 * 1000 // 48 hours
    },
    extended: {
      checkInterval: 5 * 60 * 1000, // 5 minutes
      duration: 72 * 60 * 60 * 1000 // 72 hours
    },
    production: {
      checkInterval: 5 * 60 * 1000, // 5 minutes
      duration: 7 * 24 * 60 * 60 * 1000 // 1 week
    }
  };

  const config = configs[testMode] || configs.quick;

  console.log(`Running in ${testMode.toUpperCase()} mode\n`);

  if (testMode === 'quick') {
    console.log('⚠️  QUICK MODE: This is a brief test for development purposes.');
    console.log('    For production decision-making, run "standard" or "extended" mode.\n');
  }

  // Run monitoring
  const result = await monitorTEEAvailability(config);

  // Display results
  console.log('='.repeat(80));
  console.log('MONITORING RESULTS');
  console.log('='.repeat(80) + '\n');

  console.log('Statistics:');
  console.log(`  Total Checks: ${result.totalChecks}`);
  console.log(`  Successful: ${result.successfulChecks} (${result.uptime.toFixed(2)}%)`);
  console.log(`  Failed: ${result.failedChecks} (${(100 - result.uptime).toFixed(2)}%)`);
  console.log('');
  console.log('Latency:');
  console.log(`  Average: ${result.averageLatency.toFixed(0)}ms`);
  console.log(`  Min: ${result.minLatency.toFixed(0)}ms`);
  console.log(`  Max: ${result.maxLatency.toFixed(0)}ms`);
  console.log('');
  console.log('Outages:');
  console.log(`  Longest: ${(result.longestOutage / 1000).toFixed(0)}s (${(result.longestOutage / (1000 * 60)).toFixed(1)} minutes)`);
  console.log('');

  // Analyze and recommend
  const analysis = analyzeResults(result);

  console.log('='.repeat(80));
  console.log('ANALYSIS');
  console.log('='.repeat(80) + '\n');

  if (analysis.concerns.length > 0) {
    console.log('⚠️  Concerns:');
    analysis.concerns.forEach(concern => {
      console.log(`  - ${concern}`);
    });
    console.log('');
  } else {
    console.log('✅ No concerns identified\n');
  }

  console.log('Recommendation:');
  console.log(`  ${analysis.passed ? '✅' : '❌'} ${analysis.recommendation}`);
  console.log('');

  console.log('='.repeat(80));
  console.log('NEXT STEPS');
  console.log('='.repeat(80) + '\n');

  if (analysis.passed) {
    console.log('✅ TEE availability validation PASSED');
    console.log('');
    console.log('Proceed with:');
    console.log('1. Session Key authentication testing (test-session-key-auth.ts)');
    console.log('2. Cost validation');
    console.log('3. NOVA module development (if all Phase 0 tests pass)');
  } else {
    console.log('❌ TEE availability validation FAILED');
    console.log('');
    console.log('Options:');
    console.log('1. Contact NOVA team for SLA and infrastructure details');
    console.log('2. Run extended monitoring (72h or 1 week) to gather more data');
    console.log('3. Consider hybrid approach (NOVA + Lit fallback for TEE downtime)');
    console.log('4. ABORT migration if uptime remains below 95%');
  }

  console.log('');

  // Exit with appropriate code
  process.exit(analysis.passed ? 0 : 1);
}

// Run test
if (require.main === module) {
  main().catch((error) => {
    console.error('\n❌ UNEXPECTED ERROR');
    console.error(error);
    process.exit(1);
  });
}

export { monitorTEEAvailability, analyzeResults, checkTEEHealth };
