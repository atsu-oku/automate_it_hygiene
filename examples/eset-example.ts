/**
 * ESET Manager Usage Examples
 *
 * Demonstrates programmatic usage of ESET Manager components
 */

import { EsetProtectClient } from '../src/core/eset-client';
import { EsetManager } from '../src/features/eset-manager';
import { MultiChannelNotifier } from '../src/features/eset-notifier';
import { EsetConfig, MonitoringConfig } from '../src/core/eset-types';

// ============================================================================
// Example 1: Basic Health Check
// ============================================================================

async function example1_basicHealthCheck() {
  console.log('=== Example 1: Basic Health Check ===\n');

  const config: EsetConfig = {
    apiEndpoint: 'https://your-tenant.eset.systems/api/v1',
    auth: {
      clientId: 'YOUR_CLIENT_ID',
      clientSecret: 'YOUR_CLIENT_SECRET',
    },
  };

  const client = new EsetProtectClient(config);
  const manager = new EsetManager(client);

  try {
    const result = await manager.performHealthCheck({
      thresholds: {
        offlineDeviceHours: 24,
        outdatedDefinitionDays: 7,
        threatCountCritical: 5,
        moduleErrorThreshold: 2,
      },
    });

    console.log(`Total Devices: ${result.summary.totalDevices}`);
    console.log(`Healthy: ${result.summary.healthyDevices}`);
    console.log(`Critical: ${result.summary.criticalDevices}`);
    console.log(`Issues Found: ${result.issues.length}\n`);

    // Display top 5 issues
    result.issues.slice(0, 5).forEach((issue) => {
      console.log(`[${issue.severity.toUpperCase()}] ${issue.deviceName}: ${issue.description}`);
    });
  } catch (error) {
    console.error('Health check failed:', error);
  }
}

// ============================================================================
// Example 2: Health Check with Notifications
// ============================================================================

async function example2_healthCheckWithNotifications() {
  console.log('\n=== Example 2: Health Check with Notifications ===\n');

  const config: EsetConfig & { monitoring: MonitoringConfig } = {
    apiEndpoint: 'https://your-tenant.eset.systems/api/v1',
    auth: {
      clientId: 'YOUR_CLIENT_ID',
      clientSecret: 'YOUR_CLIENT_SECRET',
    },
    monitoring: {
      healthCheckInterval: 60,
      thresholds: {
        offlineDeviceHours: 24,
        outdatedDefinitionDays: 7,
        threatCountCritical: 5,
        moduleErrorThreshold: 2,
      },
      notifications: {
        slack: {
          enabled: true,
          webhookUrl: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
          channel: '#eset-alerts',
        },
        email: {
          enabled: true,
          smtpConfig: {
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
              user: 'alerts@example.com',
              pass: 'your-app-password',
            },
          },
          recipients: ['admin@example.com'],
        },
      },
    },
  };

  const client = new EsetProtectClient(config);
  const manager = new EsetManager(client);
  const notifier = new MultiChannelNotifier(config.monitoring.notifications);

  try {
    const result = await manager.performHealthCheck(config.monitoring.thresholds);

    console.log(`Health check complete. Found ${result.issues.length} issues.`);

    // Send notifications
    await notifier.sendHealthCheckAlert(result);
    console.log('Notifications sent to Slack and Email.');
  } catch (error) {
    console.error('Health check with notifications failed:', error);
  }
}

// ============================================================================
// Example 3: Remote Uninstall
// ============================================================================

async function example3_remoteUninstall() {
  console.log('\n=== Example 3: Remote Uninstall ===\n');

  const config: EsetConfig = {
    apiEndpoint: 'https://your-tenant.eset.systems/api/v1',
    auth: {
      clientId: 'YOUR_CLIENT_ID',
      clientSecret: 'YOUR_CLIENT_SECRET',
    },
  };

  const client = new EsetProtectClient(config);
  const manager = new EsetManager(client);

  const deviceIds = ['device-uuid-1', 'device-uuid-2'];

  try {
    console.log(`Creating uninstall task for ${deviceIds.length} devices...`);

    const task = await manager.uninstallEset({
      deviceIds,
      forceReboot: false,
      rebootDelay: 5,
    });

    console.log(`Task created: ${task.taskId}`);
    console.log(`Status: ${task.status}`);

    // Monitor task completion
    console.log('\nMonitoring task...');
    const finalStatus = await manager.monitorTask(task.taskId, (status) => {
      console.log(`Progress: ${status.progress?.completed || 0}/${status.progress?.total || 0}`);
    });

    console.log(`\nTask ${finalStatus.status}`);
  } catch (error) {
    console.error('Uninstall failed:', error);
  }
}

// ============================================================================
// Example 4: Remote Reinstall
// ============================================================================

async function example4_remoteReinstall() {
  console.log('\n=== Example 4: Remote Reinstall ===\n');

  const config: EsetConfig = {
    apiEndpoint: 'https://your-tenant.eset.systems/api/v1',
    auth: {
      clientId: 'YOUR_CLIENT_ID',
      clientSecret: 'YOUR_CLIENT_SECRET',
    },
  };

  const client = new EsetProtectClient(config);
  const manager = new EsetManager(client);

  const deviceIds = ['device-uuid-1', 'device-uuid-2'];
  const packageUrl = 'https://your-server.com/eset-installer.exe';

  try {
    console.log(`Creating reinstall task for ${deviceIds.length} devices...`);

    const task = await manager.reinstallEset({
      deviceIds,
      esetPackageUrl: packageUrl,
      forceReboot: true,
      rebootDelay: 5,
    });

    console.log(`Task created: ${task.taskId}`);
    console.log(`Status: ${task.status}`);
  } catch (error) {
    console.error('Reinstall failed:', error);
  }
}

// ============================================================================
// Example 5: Uninstall and Reinstall (Combined)
// ============================================================================

async function example5_uninstallAndReinstall() {
  console.log('\n=== Example 5: Uninstall and Reinstall ===\n');

  const config: EsetConfig = {
    apiEndpoint: 'https://your-tenant.eset.systems/api/v1',
    auth: {
      clientId: 'YOUR_CLIENT_ID',
      clientSecret: 'YOUR_CLIENT_SECRET',
    },
  };

  const client = new EsetProtectClient(config);
  const manager = new EsetManager(client);

  const deviceIds = ['device-uuid-1', 'device-uuid-2'];
  const packageUrl = 'https://your-server.com/eset-installer.exe';

  try {
    console.log(`Starting uninstall and reinstall for ${deviceIds.length} devices...`);

    const result = await manager.uninstallAndReinstall(deviceIds, packageUrl, {
      rebootDelay: 5,
    });

    console.log(`\nUninstall task: ${result.uninstallTask.taskId} (${result.uninstallTask.status})`);
    if (result.reinstallTask) {
      console.log(`Reinstall task: ${result.reinstallTask.taskId} (${result.reinstallTask.status})`);
    } else {
      console.log('Reinstall was not performed due to uninstall failures.');
    }
  } catch (error) {
    console.error('Uninstall and reinstall failed:', error);
  }
}

// ============================================================================
// Example 6: Batch Health Check (Large Scale)
// ============================================================================

async function example6_batchHealthCheck() {
  console.log('\n=== Example 6: Batch Health Check (Large Scale) ===\n');

  const config: EsetConfig = {
    apiEndpoint: 'https://your-tenant.eset.systems/api/v1',
    auth: {
      clientId: 'YOUR_CLIENT_ID',
      clientSecret: 'YOUR_CLIENT_SECRET',
    },
  };

  const client = new EsetProtectClient(config);
  const manager = new EsetManager(client);

  try {
    // Get all devices
    const devicesResponse = await client.getDevices({ pageSize: 1000 });
    const deviceIds = devicesResponse.devices.map((d) => d.uuid);

    console.log(`Found ${deviceIds.length} devices. Starting batch health check...`);

    // Batch health check with concurrency control
    const result = await manager.batchHealthCheck(deviceIds, {
      batchSize: 100,
      maxConcurrency: 10,
    });

    console.log(`\nBatch operation ${result.status}`);
    console.log(`Processed: ${result.progress.processed}/${result.progress.total}`);
    console.log(`Succeeded: ${result.progress.succeeded}`);
    console.log(`Failed: ${result.progress.failed}`);
  } catch (error) {
    console.error('Batch health check failed:', error);
  }
}

// ============================================================================
// Example 7: Custom Health Check and Auto-Remediation
// ============================================================================

async function example7_autoRemediation() {
  console.log('\n=== Example 7: Auto-Remediation ===\n');

  const config: EsetConfig = {
    apiEndpoint: 'https://your-tenant.eset.systems/api/v1',
    auth: {
      clientId: 'YOUR_CLIENT_ID',
      clientSecret: 'YOUR_CLIENT_SECRET',
    },
  };

  const client = new EsetProtectClient(config);
  const manager = new EsetManager(client);

  try {
    // Perform health check
    const result = await manager.performHealthCheck({
      thresholds: {
        offlineDeviceHours: 24,
        outdatedDefinitionDays: 7,
        threatCountCritical: 5,
        moduleErrorThreshold: 2,
      },
    });

    // Find devices with critical issues
    const criticalDevices = result.issues
      .filter((issue) => issue.severity === 'critical')
      .map((issue) => issue.deviceId);

    if (criticalDevices.length > 0) {
      console.log(`Found ${criticalDevices.length} devices with critical issues.`);
      console.log('Initiating auto-remediation (uninstall and reinstall)...');

      const remediationResult = await manager.uninstallAndReinstall(
        criticalDevices,
        'https://your-server.com/eset-installer.exe',
        {
          rebootDelay: 10,
        }
      );

      console.log(`Remediation initiated.`);
      console.log(`Uninstall task: ${remediationResult.uninstallTask.taskId}`);
      if (remediationResult.reinstallTask) {
        console.log(`Reinstall task: ${remediationResult.reinstallTask.taskId}`);
      }
    } else {
      console.log('No critical issues found. All systems healthy.');
    }
  } catch (error) {
    console.error('Auto-remediation failed:', error);
  }
}

// ============================================================================
// Run Examples
// ============================================================================

async function main() {
  console.log('ESET Manager - Usage Examples\n');
  console.log('Note: Replace placeholder credentials with actual values before running.\n');

  // Uncomment the example you want to run:

  // await example1_basicHealthCheck();
  // await example2_healthCheckWithNotifications();
  // await example3_remoteUninstall();
  // await example4_remoteReinstall();
  // await example5_uninstallAndReinstall();
  // await example6_batchHealthCheck();
  // await example7_autoRemediation();

  console.log('\nNote: All examples are commented out by default.');
  console.log('Uncomment the example you want to run in the main() function.');
}

if (require.main === module) {
  main().catch(console.error);
}
