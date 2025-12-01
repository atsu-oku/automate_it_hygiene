/**
 * ESET PROTECT API Types
 *
 * Type definitions for ESET PROTECT Cloud and On-Premise API
 */

// ============================================================================
// Authentication & Configuration
// ============================================================================

export interface EsetConfig {
  apiEndpoint: string; // e.g., "https://your-tenant.eset.systems/api/v1" or on-prem URL
  auth: {
    clientId: string;
    clientSecret: string;
    // For Vault integration
    vaultEnabled?: boolean;
    vaultPath?: string;
  };
  tlsConfig?: {
    minVersion: 'TLS1.2' | 'TLS1.3';
    verifyCertificate: boolean;
    caCertPath?: string;
  };
  rateLimiting?: {
    requestsPerMinute: number;
    burstSize: number;
    adaptiveEnabled: boolean;
  };
  auditLog?: {
    enabled: boolean;
    logPath: string;
    tamperDetection: boolean;
  };
}

export interface OAuth2Token {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

// ============================================================================
// Device Management
// ============================================================================

export interface EsetDevice {
  uuid: string;
  name: string;
  os: {
    name: string;
    version: string;
    platform: string;
  };
  status: 'online' | 'offline' | 'idle';
  lastSeen: Date;
  ipAddress?: string;
  macAddress?: string;
  groupId?: string;
  tags?: string[];
}

export interface DeviceHealth {
  uuid: string;
  deviceName: string;
  antivirusStatus: {
    enabled: boolean;
    upToDate: boolean;
    lastUpdate?: Date;
    protectionStatus: 'protected' | 'at_risk' | 'critical';
  };
  threats: {
    count: number;
    lastDetection?: Date;
    severity?: 'low' | 'medium' | 'high' | 'critical';
  };
  firewall: {
    enabled: boolean;
    status: 'active' | 'inactive' | 'error';
  };
  modules: {
    name: string;
    version: string;
    enabled: boolean;
    status: 'ok' | 'warning' | 'error';
  }[];
  overallHealth: 'healthy' | 'warning' | 'critical';
}

export interface DeviceListResponse {
  devices: EsetDevice[];
  totalCount: number;
  page: number;
  pageSize: number;
}

// ============================================================================
// Task Management (Software Install/Uninstall)
// ============================================================================

export interface TaskRequest {
  name: string;
  description?: string;
  targets: {
    type: 'device' | 'group';
    ids: string[];
  };
  taskType: 'software_install' | 'software_uninstall' | 'scan' | 'update';
  parameters: SoftwareTaskParameters | ScanTaskParameters;
  schedule?: TaskSchedule;
  approval?: {
    required: boolean;
    approvers: string[];
  };
}

export interface SoftwareTaskParameters {
  softwareId?: string;
  packageUrl?: string;
  installParameters?: string;
  uninstallParameters?: string;
  rebootRequired?: boolean;
  rebootDelay?: number; // minutes
}

export interface ScanTaskParameters {
  scanType: 'quick' | 'full' | 'custom';
  scanTargets?: string[];
  cleanThreats?: boolean;
}

export interface TaskSchedule {
  type: 'immediate' | 'scheduled' | 'recurring';
  startTime?: Date;
  recurrence?: {
    pattern: 'daily' | 'weekly' | 'monthly';
    interval: number;
    endDate?: Date;
  };
}

export interface TaskResponse {
  taskId: string;
  status: 'created' | 'pending_approval' | 'approved' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  progress?: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
  };
  errors?: TaskError[];
}

export interface TaskError {
  deviceId: string;
  deviceName: string;
  errorCode: string;
  errorMessage: string;
  timestamp: Date;
}

export interface TaskStatusResponse {
  taskId: string;
  status: TaskResponse['status'];
  progress: TaskResponse['progress'];
  results: {
    deviceId: string;
    deviceName: string;
    status: 'success' | 'failed' | 'pending';
    message?: string;
    startedAt?: Date;
    completedAt?: Date;
  }[];
}

// ============================================================================
// Monitoring & Alerts
// ============================================================================

export interface MonitoringConfig {
  healthCheckInterval: number; // minutes
  thresholds: {
    offlineDeviceHours: number;
    outdatedDefinitionDays: number;
    threatCountCritical: number;
    moduleErrorThreshold: number;
  };
  notifications: {
    slack?: {
      enabled: boolean;
      webhookUrl: string;
      channel?: string;
    };
    teams?: {
      enabled: boolean;
      webhookUrl: string;
    };
    email?: {
      enabled: boolean;
      smtpConfig: {
        host: string;
        port: number;
        secure: boolean;
        auth: {
          user: string;
          pass: string;
        };
      };
      recipients: string[];
    };
  };
}

export interface HealthCheckResult {
  timestamp: Date;
  summary: {
    totalDevices: number;
    healthyDevices: number;
    warningDevices: number;
    criticalDevices: number;
    offlineDevices: number;
  };
  deviceDetails: DeviceHealth[];
  issues: {
    deviceId: string;
    deviceName: string;
    issueType: 'offline' | 'outdated' | 'threat_detected' | 'module_error' | 'protection_disabled';
    severity: 'warning' | 'critical';
    description: string;
    detectedAt: Date;
  }[];
}

// ============================================================================
// Reporting
// ============================================================================

export interface ReportRequest {
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  startDate: Date;
  endDate: Date;
  includeDeviceList?: boolean;
  includeThreats?: boolean;
  includeTasks?: boolean;
  format: 'json' | 'html' | 'pdf';
}

export interface Report {
  id: string;
  type: ReportRequest['type'];
  generatedAt: Date;
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalDevices: number;
    averageHealth: number;
    threatsDetected: number;
    threatsResolved: number;
    tasksExecuted: number;
    tasksSucceeded: number;
    tasksFailed: number;
  };
  deviceHealth: {
    healthy: number;
    warning: number;
    critical: number;
    offline: number;
  };
  topIssues: {
    issueType: string;
    count: number;
    affectedDevices: string[];
  }[];
  threatSummary?: {
    totalThreats: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    topThreats: {
      name: string;
      count: number;
      severity: string;
    }[];
  };
  taskSummary?: {
    totalTasks: number;
    byType: Record<string, number>;
    successRate: number;
  };
}

// ============================================================================
// Audit Logging
// ============================================================================

export interface AuditLogEntry {
  timestamp: Date;
  eventType: 'api_call' | 'task_created' | 'task_executed' | 'configuration_changed' | 'authentication';
  user: string;
  ipAddress: string;
  action: string;
  resourceType: 'device' | 'task' | 'config' | 'auth';
  resourceId?: string;
  status: 'success' | 'failure';
  details: Record<string, unknown>;
  hash?: string; // For tamper detection
}

export interface AuditLogQuery {
  startDate?: Date;
  endDate?: Date;
  eventTypes?: AuditLogEntry['eventType'][];
  user?: string;
  resourceType?: AuditLogEntry['resourceType'];
  status?: AuditLogEntry['status'];
  limit?: number;
  offset?: number;
}

// ============================================================================
// Batch Operations
// ============================================================================

export interface BatchOperationRequest {
  operation: 'health_check' | 'deploy_task' | 'update_config';
  deviceIds: string[];
  batchSize: number;
  maxConcurrency: number;
  parameters?: unknown;
}

export interface BatchOperationResult {
  operationId: string;
  status: 'running' | 'completed' | 'partial_failure' | 'failed';
  progress: {
    total: number;
    processed: number;
    succeeded: number;
    failed: number;
  };
  startedAt: Date;
  completedAt?: Date;
  results: {
    deviceId: string;
    status: 'success' | 'failed';
    result?: unknown;
    error?: string;
  }[];
}

// ============================================================================
// Error Types
// ============================================================================

export class EsetApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errorCode?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'EsetApiError';
  }
}

export class EsetAuthenticationError extends EsetApiError {
  constructor(message: string, details?: unknown) {
    super(message, 401, 'AUTHENTICATION_FAILED', details);
    this.name = 'EsetAuthenticationError';
  }
}

export class EsetRateLimitError extends EsetApiError {
  constructor(
    message: string,
    public retryAfter?: number
  ) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', { retryAfter });
    this.name = 'EsetRateLimitError';
  }
}

export class EsetTaskError extends EsetApiError {
  constructor(
    message: string,
    public taskId?: string,
    details?: unknown
  ) {
    super(message, undefined, 'TASK_EXECUTION_FAILED', details);
    this.name = 'EsetTaskError';
  }
}
