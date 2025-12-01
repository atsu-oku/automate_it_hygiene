#!/usr/bin/env node
/**
 * ESET Manager CLI
 *
 * Command-line interface for ESET PROTECT management
 */

import { Command } from 'commander';
import { EsetProtectClient } from '../core/eset-client';
import { EsetManager } from './eset-manager';
import { MultiChannelNotifier } from './eset-notifier';
import { EsetConfig, MonitoringConfig } from '../core/eset-types';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Configuration Loading
// ============================================================================

function loadConfig(configPath?: string): EsetConfig & { monitoring?: MonitoringConfig } {
  const defaultPath = path.join(process.env.HOME || '~', '.eset-manager-config.json');
  const actualPath = configPath || defaultPath;

  if (!fs.existsSync(actualPath)) {
    throw new Error(`Configuration file not found: ${actualPath}. Please create it using 'eset-manager config init'`);
  }

  const content = fs.readFileSync(actualPath, 'utf-8');
  return JSON.parse(content);
}

function saveConfig(config: unknown, configPath?: string): void {
  const defaultPath = path.join(process.env.HOME || '~', '.eset-manager-config.json');
  const actualPath = configPath || defaultPath;

  fs.writeFileSync(actualPath, JSON.stringify(config, null, 2));
  console.log(`Configuration saved to ${actualPath}`);
}

// ============================================================================
// CLI Program
// ============================================================================

const program = new Command();

program
  .name('eset-manager')
  .description('ESET PROTECT API Management Tool')
  .version('1.0.0');

// ----------------------------------------------------------------------------
// Config Commands
// ----------------------------------------------------------------------------

const configCmd = program.command('config').description('Manage configuration');

configCmd
  .command('init')
  .description('Initialize configuration file')
  .option('-o, --output <path>', 'Configuration file path')
  .action((options) => {
    const config: EsetConfig & { monitoring: MonitoringConfig } = {
      apiEndpoint: 'https://your-tenant.eset.systems/api/v1',
      auth: {
        clientId: 'YOUR_CLIENT_ID',
        clientSecret: 'YOUR_CLIENT_SECRET',
        vaultEnabled: false,
      },
      tlsConfig: {
        minVersion: 'TLS1.2',
        verifyCertificate: true,
      },
      rateLimiting: {
        requestsPerMinute: 60,
        burstSize: 10,
        adaptiveEnabled: true,
      },
      auditLog: {
        enabled: true,
        logPath: '/var/log/eset-manager/audit.log',
        tamperDetection: true,
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
            enabled: false,
            webhookUrl: '',
          },
          teams: {
            enabled: false,
            webhookUrl: '',
          },
          email: {
            enabled: false,
            smtpConfig: {
              host: 'smtp.example.com',
              port: 587,
              secure: false,
              auth: {
                user: 'user@example.com',
                pass: 'password',
              },
            },
            recipients: [],
          },
        },
      },
    };

    saveConfig(config, options.output);
    console.log('Configuration template created. Please edit with your credentials.');
  });

configCmd
  .command('show')
  .description('Show current configuration (secrets masked)')
  .option('-c, --config <path>', 'Configuration file path')
  .action((options) => {
    const config = loadConfig(options.config);
    const masked = {
      ...config,
      auth: {
        ...config.auth,
        clientSecret: '***REDACTED***',
      },
    };
    console.log(JSON.stringify(masked, null, 2));
  });

// ----------------------------------------------------------------------------
// Health Check Commands
// ----------------------------------------------------------------------------

const healthCmd = program.command('health').description('Device health monitoring');

healthCmd
  .command('check')
  .description('Perform health check on all devices')
  .option('-c, --config <path>', 'Configuration file path')
  .option('-n, --notify', 'Send notifications')
  .option('-o, --output <path>', 'Save results to JSON file')
  .action(async (options) => {
    try {
      const config = loadConfig(options.config);
      const client = new EsetProtectClient(config);
      const manager = new EsetManager(client);

      console.log('Performing health check...');
      const result = await manager.performHealthCheck(config.monitoring!.thresholds);

      if (options.output) {
        fs.writeFileSync(options.output, JSON.stringify(result, null, 2));
        console.log(`Results saved to ${options.output}`);
      }

      // Display summary
      console.log('\n=== Health Check Summary ===');
      console.log(`Total Devices: ${result.summary.totalDevices}`);
      console.log(`Healthy: ${result.summary.healthyDevices}`);
      console.log(`Warning: ${result.summary.warningDevices}`);
      console.log(`Critical: ${result.summary.criticalDevices}`);
      console.log(`Offline: ${result.summary.offlineDevices}`);
      console.log(`\nIssues Found: ${result.issues.length}`);

      if (result.issues.length > 0) {
        console.log('\nTop Issues:');
        result.issues.slice(0, 10).forEach((issue) => {
          console.log(`  [${issue.severity.toUpperCase()}] ${issue.deviceName}: ${issue.description}`);
        });
      }

      // Send notifications
      if (options.notify && config.monitoring?.notifications) {
        console.log('\nSending notifications...');
        const notifier = new MultiChannelNotifier(config.monitoring.notifications);
        await notifier.sendHealthCheckAlert(result);
        console.log('Notifications sent.');
      }
    } catch (error) {
      console.error('Health check failed:', error);
      process.exit(1);
    }
  });

healthCmd
  .command('list-issues')
  .description('List devices with issues')
  .option('-c, --config <path>', 'Configuration file path')
  .option('-s, --severity <level>', 'Filter by severity (warning|critical)', 'all')
  .action(async (options) => {
    try {
      const config = loadConfig(options.config);
      const client = new EsetProtectClient(config);
      const manager = new EsetManager(client);

      const result = await manager.performHealthCheck(config.monitoring!.thresholds);

      const filteredIssues = options.severity === 'all'
        ? result.issues
        : result.issues.filter((i) => i.severity === options.severity);

      console.log(`Found ${filteredIssues.length} issues:\n`);
      filteredIssues.forEach((issue) => {
        console.log(`[${issue.severity.toUpperCase()}] ${issue.deviceName}`);
        console.log(`  Type: ${issue.issueType}`);
        console.log(`  Description: ${issue.description}`);
        console.log(`  Detected: ${issue.detectedAt.toLocaleString()}\n`);
      });
    } catch (error) {
      console.error('Failed to list issues:', error);
      process.exit(1);
    }
  });

// ----------------------------------------------------------------------------
// Task Commands
// ----------------------------------------------------------------------------

const taskCmd = program.command('task').description('Manage ESET tasks');

taskCmd
  .command('uninstall')
  .description('Uninstall ESET from devices')
  .option('-c, --config <path>', 'Configuration file path')
  .option('-d, --devices <ids...>', 'Device IDs (space-separated)')
  .option('-f, --file <path>', 'File containing device IDs (one per line)')
  .option('--reboot', 'Force reboot after uninstall')
  .option('--reboot-delay <minutes>', 'Reboot delay in minutes', '5')
  .option('--approval', 'Require approval before execution')
  .action(async (options) => {
    try {
      const config = loadConfig(options.config);
      const client = new EsetProtectClient(config);
      const manager = new EsetManager(client);

      let deviceIds: string[] = [];

      if (options.devices) {
        deviceIds = options.devices;
      } else if (options.file) {
        deviceIds = fs.readFileSync(options.file, 'utf-8').split('\n').filter((id) => id.trim());
      } else {
        console.error('Please specify devices using --devices or --file');
        process.exit(1);
      }

      console.log(`Creating uninstall task for ${deviceIds.length} devices...`);

      const task = await manager.uninstallEset({
        deviceIds,
        forceReboot: options.reboot,
        rebootDelay: parseInt(options.rebootDelay, 10),
        approvalRequired: options.approval,
      });

      console.log(`Task created: ${task.taskId}`);
      console.log(`Status: ${task.status}`);

      if (task.status === 'pending_approval') {
        console.log('Task requires approval. Use "eset-manager task approve" to proceed.');
      }
    } catch (error) {
      console.error('Uninstall task failed:', error);
      process.exit(1);
    }
  });

taskCmd
  .command('reinstall')
  .description('Reinstall ESET on devices')
  .option('-c, --config <path>', 'Configuration file path')
  .option('-d, --devices <ids...>', 'Device IDs (space-separated)')
  .option('-f, --file <path>', 'File containing device IDs (one per line)')
  .option('-p, --package <url>', 'ESET package URL (required)')
  .option('--reboot', 'Force reboot after install')
  .option('--reboot-delay <minutes>', 'Reboot delay in minutes', '5')
  .option('--approval', 'Require approval before execution')
  .action(async (options) => {
    try {
      if (!options.package) {
        console.error('Package URL is required (--package)');
        process.exit(1);
      }

      const config = loadConfig(options.config);
      const client = new EsetProtectClient(config);
      const manager = new EsetManager(client);

      let deviceIds: string[] = [];

      if (options.devices) {
        deviceIds = options.devices;
      } else if (options.file) {
        deviceIds = fs.readFileSync(options.file, 'utf-8').split('\n').filter((id) => id.trim());
      } else {
        console.error('Please specify devices using --devices or --file');
        process.exit(1);
      }

      console.log(`Creating reinstall task for ${deviceIds.length} devices...`);

      const task = await manager.reinstallEset({
        deviceIds,
        esetPackageUrl: options.package,
        forceReboot: options.reboot,
        rebootDelay: parseInt(options.rebootDelay, 10),
        approvalRequired: options.approval,
      });

      console.log(`Task created: ${task.taskId}`);
      console.log(`Status: ${task.status}`);

      if (task.status === 'pending_approval') {
        console.log('Task requires approval. Use "eset-manager task approve" to proceed.');
      }
    } catch (error) {
      console.error('Reinstall task failed:', error);
      process.exit(1);
    }
  });

taskCmd
  .command('uninstall-reinstall')
  .description('Uninstall and reinstall ESET (combined operation)')
  .option('-c, --config <path>', 'Configuration file path')
  .option('-d, --devices <ids...>', 'Device IDs (space-separated)')
  .option('-f, --file <path>', 'File containing device IDs (one per line)')
  .option('-p, --package <url>', 'ESET package URL (required)')
  .option('--reboot-delay <minutes>', 'Reboot delay in minutes', '5')
  .option('--approval', 'Require approval before execution')
  .action(async (options) => {
    try {
      if (!options.package) {
        console.error('Package URL is required (--package)');
        process.exit(1);
      }

      const config = loadConfig(options.config);
      const client = new EsetProtectClient(config);
      const manager = new EsetManager(client);

      let deviceIds: string[] = [];

      if (options.devices) {
        deviceIds = options.devices;
      } else if (options.file) {
        deviceIds = fs.readFileSync(options.file, 'utf-8').split('\n').filter((id) => id.trim());
      } else {
        console.error('Please specify devices using --devices or --file');
        process.exit(1);
      }

      console.log(`Starting uninstall and reinstall for ${deviceIds.length} devices...`);

      const result = await manager.uninstallAndReinstall(deviceIds, options.package, {
        approvalRequired: options.approval,
        rebootDelay: parseInt(options.rebootDelay, 10),
      });

      console.log(`\nUninstall task: ${result.uninstallTask.taskId} (${result.uninstallTask.status})`);
      if (result.reinstallTask) {
        console.log(`Reinstall task: ${result.reinstallTask.taskId} (${result.reinstallTask.status})`);
      } else {
        console.log('Reinstall was not performed due to uninstall failures.');
      }
    } catch (error) {
      console.error('Uninstall-reinstall failed:', error);
      process.exit(1);
    }
  });

taskCmd
  .command('status')
  .description('Get task status')
  .option('-c, --config <path>', 'Configuration file path')
  .argument('<taskId>', 'Task ID')
  .action(async (taskId, options) => {
    try {
      const config = loadConfig(options.config);
      const client = new EsetProtectClient(config);

      const status = await client.getTaskStatus(taskId);

      console.log(`Task ID: ${status.taskId}`);
      console.log(`Status: ${status.status}`);
      console.log(`Progress: ${status.progress?.completed || 0}/${status.progress?.total || 0}`);
      console.log(`\nResults:`);

      status.results.forEach((r) => {
        console.log(`  ${r.deviceName} (${r.deviceId}): ${r.status}`);
        if (r.message) {
          console.log(`    ${r.message}`);
        }
      });
    } catch (error) {
      console.error('Failed to get task status:', error);
      process.exit(1);
    }
  });

taskCmd
  .command('monitor')
  .description('Monitor task execution in real-time')
  .option('-c, --config <path>', 'Configuration file path')
  .argument('<taskId>', 'Task ID')
  .action(async (taskId, options) => {
    try {
      const config = loadConfig(options.config);
      const client = new EsetProtectClient(config);
      const manager = new EsetManager(client);

      console.log(`Monitoring task ${taskId}...\n`);

      await manager.monitorTask(taskId, (status) => {
        console.clear();
        console.log(`Task ID: ${status.taskId}`);
        console.log(`Status: ${status.status}`);
        console.log(`Progress: ${status.progress?.completed || 0}/${status.progress?.total || 0} (${((status.progress?.completed || 0) / (status.progress?.total || 1) * 100).toFixed(1)}%)`);
        console.log(`\nLatest Results:`);
        status.results.slice(0, 20).forEach((r) => {
          console.log(`  ${r.deviceName}: ${r.status}`);
        });
      });

      console.log('\nTask monitoring complete.');
    } catch (error) {
      console.error('Failed to monitor task:', error);
      process.exit(1);
    }
  });

// ----------------------------------------------------------------------------
// Device Commands
// ----------------------------------------------------------------------------

const deviceCmd = program.command('device').description('Device management');

deviceCmd
  .command('list')
  .description('List all devices')
  .option('-c, --config <path>', 'Configuration file path')
  .option('-f, --filter <query>', 'Filter query')
  .option('--page <number>', 'Page number', '1')
  .option('--page-size <number>', 'Page size', '100')
  .action(async (options) => {
    try {
      const config = loadConfig(options.config);
      const client = new EsetProtectClient(config);

      const response = await client.getDevices({
        page: parseInt(options.page, 10),
        pageSize: parseInt(options.pageSize, 10),
        filter: options.filter,
      });

      console.log(`Total Devices: ${response.totalCount}\n`);

      response.devices.forEach((device) => {
        console.log(`${device.name} (${device.uuid})`);
        console.log(`  OS: ${device.os.name} ${device.os.version}`);
        console.log(`  Status: ${device.status}`);
        console.log(`  Last Seen: ${new Date(device.lastSeen).toLocaleString()}\n`);
      });
    } catch (error) {
      console.error('Failed to list devices:', error);
      process.exit(1);
    }
  });

// ============================================================================
// Execute
// ============================================================================

program.parse();
