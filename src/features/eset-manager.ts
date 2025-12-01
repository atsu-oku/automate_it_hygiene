/**
 * ESET Manager
 *
 * High-level operations for managing ESET deployments:
 * - Device health monitoring
 * - Remote uninstall/reinstall
 * - Batch operations with async processing
 */

import { EsetProtectClient } from '../core/eset-client';
import {
  DeviceHealth,
  HealthCheckResult,
  TaskRequest,
  TaskResponse,
  TaskStatusResponse,
  BatchOperationResult,
  EsetTaskError,
} from '../core/eset-types';

export interface UninstallOptions {
  deviceIds: string[];
  forceReboot?: boolean;
  rebootDelay?: number; // minutes
  approvalRequired?: boolean;
  approvers?: string[];
}

export interface ReinstallOptions {
  deviceIds: string[];
  esetPackageUrl: string;
  installParameters?: string;
  forceReboot?: boolean;
  rebootDelay?: number;
  approvalRequired?: boolean;
  approvers?: string[];
}

export interface HealthMonitoringOptions {
  thresholds: {
    offlineDeviceHours: number;
    outdatedDefinitionDays: number;
    threatCountCritical: number;
    moduleErrorThreshold: number;
  };
}

export class EsetManager {
  constructor(private client: EsetProtectClient) {}

  // ==========================================================================
  // Health Monitoring
  // ==========================================================================

  async performHealthCheck(options: HealthMonitoringOptions): Promise<HealthCheckResult> {
    console.log('Starting health check for all devices...');

    // Get all devices
    const devicesResponse = await this.client.getDevices({ pageSize: 1000 });
    const devices = devicesResponse.devices;

    console.log(`Checking health for ${devices.length} devices...`);

    // Check health for each device (with concurrency control)
    const deviceHealthPromises = devices.map((device) =>
      this.client.getDeviceHealth(device.uuid).catch((error) => {
        console.error(`Failed to get health for device ${device.uuid}: ${error.message}`);
        return null;
      })
    );

    const deviceHealthResults = await Promise.all(deviceHealthPromises);
    const deviceDetails = deviceHealthResults.filter((h): h is DeviceHealth => h !== null);

    // Analyze health
    const summary = {
      totalDevices: devices.length,
      healthyDevices: 0,
      warningDevices: 0,
      criticalDevices: 0,
      offlineDevices: 0,
    };

    const issues: HealthCheckResult['issues'] = [];
    const now = new Date();

    for (const health of deviceDetails) {
      // Count by overall health
      if (health.overallHealth === 'healthy') summary.healthyDevices++;
      else if (health.overallHealth === 'warning') summary.warningDevices++;
      else if (health.overallHealth === 'critical') summary.criticalDevices++;

      // Check for specific issues
      const device = devices.find((d) => d.uuid === health.uuid);
      if (!device) continue;

      // Offline check
      const hoursSinceLastSeen =
        (now.getTime() - new Date(device.lastSeen).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastSeen > options.thresholds.offlineDeviceHours) {
        summary.offlineDevices++;
        issues.push({
          deviceId: device.uuid,
          deviceName: device.name,
          issueType: 'offline',
          severity: 'critical',
          description: `Device offline for ${hoursSinceLastSeen.toFixed(1)} hours`,
          detectedAt: now,
        });
      }

      // Outdated definitions check
      if (health.antivirusStatus.lastUpdate) {
        const daysSinceUpdate =
          (now.getTime() - new Date(health.antivirusStatus.lastUpdate).getTime()) /
          (1000 * 60 * 60 * 24);
        if (daysSinceUpdate > options.thresholds.outdatedDefinitionDays) {
          issues.push({
            deviceId: device.uuid,
            deviceName: device.name,
            issueType: 'outdated',
            severity: daysSinceUpdate > options.thresholds.outdatedDefinitionDays * 2 ? 'critical' : 'warning',
            description: `Antivirus definitions ${daysSinceUpdate.toFixed(1)} days old`,
            detectedAt: now,
          });
        }
      }

      // Threat detection check
      if (health.threats.count >= options.thresholds.threatCountCritical) {
        issues.push({
          deviceId: device.uuid,
          deviceName: device.name,
          issueType: 'threat_detected',
          severity: 'critical',
          description: `${health.threats.count} threats detected`,
          detectedAt: now,
        });
      }

      // Protection disabled check
      if (!health.antivirusStatus.enabled) {
        issues.push({
          deviceId: device.uuid,
          deviceName: device.name,
          issueType: 'protection_disabled',
          severity: 'critical',
          description: 'Antivirus protection is disabled',
          detectedAt: now,
        });
      }

      // Module error check
      const errorModules = health.modules.filter((m) => m.status === 'error');
      if (errorModules.length >= options.thresholds.moduleErrorThreshold) {
        issues.push({
          deviceId: device.uuid,
          deviceName: device.name,
          issueType: 'module_error',
          severity: 'warning',
          description: `${errorModules.length} modules in error state: ${errorModules.map((m) => m.name).join(', ')}`,
          detectedAt: now,
        });
      }
    }

    const result: HealthCheckResult = {
      timestamp: now,
      summary,
      deviceDetails,
      issues,
    };

    console.log(`Health check complete. Summary:`, summary);
    console.log(`Found ${issues.length} issues`);

    return result;
  }

  // ==========================================================================
  // Remote Uninstall
  // ==========================================================================

  async uninstallEset(options: UninstallOptions): Promise<TaskResponse> {
    console.log(`Creating uninstall task for ${options.deviceIds.length} devices...`);

    const taskRequest: TaskRequest = {
      name: `ESET Uninstall - ${new Date().toISOString()}`,
      description: `Uninstall ESET from ${options.deviceIds.length} devices`,
      targets: {
        type: 'device',
        ids: options.deviceIds,
      },
      taskType: 'software_uninstall',
      parameters: {
        // ESET-specific uninstall parameters
        uninstallParameters: '/quiet /norestart',
        rebootRequired: options.forceReboot ?? false,
        rebootDelay: options.rebootDelay ?? 5,
      },
      schedule: {
        type: 'immediate',
      },
      approval: options.approvalRequired
        ? {
            required: true,
            approvers: options.approvers || [],
          }
        : undefined,
    };

    const response = await this.client.createTask(taskRequest);

    console.log(`Uninstall task created: ${response.taskId}, status: ${response.status}`);

    return response;
  }

  // ==========================================================================
  // Remote Reinstall
  // ==========================================================================

  async reinstallEset(options: ReinstallOptions): Promise<TaskResponse> {
    console.log(`Creating reinstall task for ${options.deviceIds.length} devices...`);

    const taskRequest: TaskRequest = {
      name: `ESET Reinstall - ${new Date().toISOString()}`,
      description: `Reinstall ESET on ${options.deviceIds.length} devices`,
      targets: {
        type: 'device',
        ids: options.deviceIds,
      },
      taskType: 'software_install',
      parameters: {
        packageUrl: options.esetPackageUrl,
        installParameters: options.installParameters || '/quiet /norestart',
        rebootRequired: options.forceReboot ?? true,
        rebootDelay: options.rebootDelay ?? 5,
      },
      schedule: {
        type: 'immediate',
      },
      approval: options.approvalRequired
        ? {
            required: true,
            approvers: options.approvers || [],
          }
        : undefined,
    };

    const response = await this.client.createTask(taskRequest);

    console.log(`Reinstall task created: ${response.taskId}, status: ${response.status}`);

    return response;
  }

  // ==========================================================================
  // Uninstall and Reinstall (Combined Operation)
  // ==========================================================================

  async uninstallAndReinstall(
    deviceIds: string[],
    packageUrl: string,
    options?: {
      approvalRequired?: boolean;
      approvers?: string[];
      rebootDelay?: number;
    }
  ): Promise<{ uninstallTask: TaskResponse; reinstallTask: TaskResponse | null }> {
    console.log(`Starting uninstall and reinstall for ${deviceIds.length} devices...`);

    // Step 1: Uninstall
    const uninstallTask = await this.uninstallEset({
      deviceIds,
      forceReboot: false,
      approvalRequired: options?.approvalRequired,
      approvers: options?.approvers,
    });

    console.log(`Uninstall task ${uninstallTask.taskId} created, waiting for completion...`);

    // Wait for uninstall to complete
    const uninstallCompleted = await this.waitForTaskCompletion(uninstallTask.taskId, {
      timeoutMinutes: 30,
      pollingIntervalSeconds: 10,
    });

    if (!uninstallCompleted) {
      throw new EsetTaskError(
        'Uninstall task did not complete within timeout',
        uninstallTask.taskId
      );
    }

    const uninstallStatus = await this.client.getTaskStatus(uninstallTask.taskId);
    const failedDevices = uninstallStatus.results.filter((r) => r.status === 'failed');

    if (failedDevices.length > 0) {
      console.warn(`${failedDevices.length} devices failed to uninstall, excluding from reinstall`);
      deviceIds = deviceIds.filter(
        (id) => !failedDevices.some((f) => f.deviceId === id)
      );
    }

    if (deviceIds.length === 0) {
      console.error('All devices failed to uninstall, aborting reinstall');
      return { uninstallTask, reinstallTask: null };
    }

    // Step 2: Reinstall
    console.log(`Proceeding with reinstall for ${deviceIds.length} devices...`);

    const reinstallTask = await this.reinstallEset({
      deviceIds,
      esetPackageUrl: packageUrl,
      forceReboot: true,
      rebootDelay: options?.rebootDelay ?? 5,
      approvalRequired: options?.approvalRequired,
      approvers: options?.approvers,
    });

    console.log(`Reinstall task ${reinstallTask.taskId} created`);

    return { uninstallTask, reinstallTask };
  }

  // ==========================================================================
  // Task Status Monitoring
  // ==========================================================================

  async waitForTaskCompletion(
    taskId: string,
    options: { timeoutMinutes: number; pollingIntervalSeconds: number }
  ): Promise<boolean> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMinutes * 60 * 1000;

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.client.getTaskStatus(taskId);

      console.log(
        `Task ${taskId} status: ${status.status} (${status.progress?.completed || 0}/${status.progress?.total || 0})`
      );

      if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
        return status.status === 'completed';
      }

      await new Promise((resolve) => setTimeout(resolve, options.pollingIntervalSeconds * 1000));
    }

    console.warn(`Task ${taskId} timed out after ${options.timeoutMinutes} minutes`);
    return false;
  }

  async monitorTask(
    taskId: string,
    onProgress?: (status: TaskStatusResponse) => void
  ): Promise<TaskStatusResponse> {
    let lastStatus: TaskStatusResponse | null = null;

    while (true) {
      const status = await this.client.getTaskStatus(taskId);

      if (onProgress) {
        onProgress(status);
      }

      lastStatus = status;

      if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 5000)); // Poll every 5 seconds
    }

    return lastStatus!;
  }

  // ==========================================================================
  // Batch Operations with Concurrency Control
  // ==========================================================================

  async batchHealthCheck(
    deviceIds: string[],
    options: { batchSize: number; maxConcurrency: number }
  ): Promise<BatchOperationResult> {
    const operationId = `batch-health-${Date.now()}`;
    const results: BatchOperationResult['results'] = [];
    const startTime = new Date();

    console.log(
      `Starting batch health check for ${deviceIds.length} devices (batch size: ${options.batchSize}, concurrency: ${options.maxConcurrency})`
    );

    for (let i = 0; i < deviceIds.length; i += options.batchSize) {
      const batch = deviceIds.slice(i, i + options.batchSize);

      // Process batch with concurrency control
      const batchPromises = batch.map(async (deviceId) => {
        try {
          const health = await this.client.getDeviceHealth(deviceId);
          results.push({
            deviceId,
            status: 'success',
            result: health,
          });
        } catch (error) {
          results.push({
            deviceId,
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      // Limit concurrency
      const chunks: Promise<void>[][] = [];
      for (let j = 0; j < batchPromises.length; j += options.maxConcurrency) {
        chunks.push(batchPromises.slice(j, j + options.maxConcurrency));
      }

      for (const chunk of chunks) {
        await Promise.all(chunk);
      }

      console.log(`Processed ${Math.min(i + options.batchSize, deviceIds.length)}/${deviceIds.length} devices`);
    }

    const succeeded = results.filter((r) => r.status === 'success').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    const batchResult: BatchOperationResult = {
      operationId,
      status: failed === 0 ? 'completed' : failed < deviceIds.length ? 'partial_failure' : 'failed',
      progress: {
        total: deviceIds.length,
        processed: results.length,
        succeeded,
        failed,
      },
      startedAt: startTime,
      completedAt: new Date(),
      results,
    };

    console.log(
      `Batch health check complete: ${succeeded} succeeded, ${failed} failed`
    );

    return batchResult;
  }
}
