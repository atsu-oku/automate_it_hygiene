/**
 * ESET PROTECT API Client
 *
 * Production-ready client with:
 * - OAuth2 authentication with token caching
 * - Rate limiting (token bucket + adaptive)
 * - Retry logic with exponential backoff
 * - TLS 1.2+ enforcement
 * - Audit logging
 */

import https from 'https';
import crypto from 'crypto';
import {
  EsetConfig,
  OAuth2Token,
  EsetDevice,
  DeviceListResponse,
  DeviceHealth,
  TaskRequest,
  TaskResponse,
  TaskStatusResponse,
  EsetApiError,
  EsetAuthenticationError,
  EsetRateLimitError,
  AuditLogEntry,
} from './eset-types';

// ============================================================================
// Rate Limiter (Token Bucket with Adaptive Limiting)
// ============================================================================

class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private adaptiveMultiplier: number = 1.0;

  constructor(
    private maxTokens: number,
    private refillRate: number // tokens per second
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(cost: number = 1): Promise<void> {
    this.refill();

    const effectiveCost = cost * this.adaptiveMultiplier;

    if (this.tokens >= effectiveCost) {
      this.tokens -= effectiveCost;
      return;
    }

    // Wait until enough tokens are available
    const waitTime = ((effectiveCost - this.tokens) / this.refillRate) * 1000;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
    this.refill();
    this.tokens -= effectiveCost;
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000;
    const tokensToAdd = timePassed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  adjustForRateLimit(retryAfter: number): void {
    // Reduce rate adaptively when encountering 429
    this.adaptiveMultiplier = Math.min(2.0, this.adaptiveMultiplier * 1.5);
    console.warn(`Rate limit hit. Adaptive multiplier increased to ${this.adaptiveMultiplier}`);
  }

  resetAdaptive(): void {
    // Gradually recover adaptive multiplier
    this.adaptiveMultiplier = Math.max(1.0, this.adaptiveMultiplier * 0.9);
  }
}

// ============================================================================
// Audit Logger
// ============================================================================

class AuditLogger {
  private logStream: NodeJS.WritableStream | null = null;

  constructor(
    private config: EsetConfig['auditLog'],
    private enableTamperDetection: boolean = true
  ) {
    if (config?.enabled) {
      // In production, use proper file stream
      // For now, use stdout
      this.logStream = process.stdout;
    }
  }

  async log(entry: Partial<AuditLogEntry>): Promise<void> {
    if (!this.config?.enabled || !this.logStream) return;

    const fullEntry: AuditLogEntry = {
      timestamp: new Date(),
      eventType: entry.eventType || 'api_call',
      user: entry.user || 'system',
      ipAddress: entry.ipAddress || 'localhost',
      action: entry.action || '',
      resourceType: entry.resourceType || 'device',
      resourceId: entry.resourceId,
      status: entry.status || 'success',
      details: entry.details || {},
      hash: undefined,
    };

    if (this.enableTamperDetection) {
      fullEntry.hash = this.calculateHash(fullEntry);
    }

    this.logStream.write(JSON.stringify(fullEntry) + '\n');
  }

  private calculateHash(entry: AuditLogEntry): string {
    const data = JSON.stringify({
      timestamp: entry.timestamp,
      eventType: entry.eventType,
      user: entry.user,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      status: entry.status,
    });
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

// ============================================================================
// ESET PROTECT Client
// ============================================================================

export class EsetProtectClient {
  private token: OAuth2Token | null = null;
  private tokenExpiresAt: number = 0;
  private rateLimiter: TokenBucketRateLimiter;
  private auditLogger: AuditLogger;
  private httpsAgent: https.Agent;

  constructor(private config: EsetConfig) {
    // Initialize rate limiter
    const rpm = config.rateLimiting?.requestsPerMinute || 60;
    const burst = config.rateLimiting?.burstSize || 10;
    this.rateLimiter = new TokenBucketRateLimiter(burst, rpm / 60);

    // Initialize audit logger
    this.auditLogger = new AuditLogger(
      config.auditLog,
      config.auditLog?.tamperDetection ?? true
    );

    // Configure HTTPS agent for TLS 1.2+
    this.httpsAgent = new https.Agent({
      minVersion: config.tlsConfig?.minVersion || 'TLSv1.2',
      rejectUnauthorized: config.tlsConfig?.verifyCertificate ?? true,
      ca: config.tlsConfig?.caCertPath ? [require('fs').readFileSync(config.tlsConfig.caCertPath)] : undefined,
    });
  }

  // ==========================================================================
  // Authentication
  // ==========================================================================

  private async authenticate(): Promise<void> {
    // Check if token is still valid
    if (this.token && Date.now() < this.tokenExpiresAt - 60000) {
      return; // Token valid for at least 1 more minute
    }

    const credentials = await this.getCredentials();

    const tokenUrl = `${this.config.apiEndpoint}/oauth2/token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    });

    try {
      const response = await this.makeHttpRequest<OAuth2Token>(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        skipAuth: true,
      });

      this.token = response;
      this.tokenExpiresAt = Date.now() + response.expires_in * 1000;

      await this.auditLogger.log({
        eventType: 'authentication',
        action: 'oauth2_token_acquired',
        resourceType: 'auth',
        status: 'success',
        details: { expiresIn: response.expires_in },
      });
    } catch (error) {
      await this.auditLogger.log({
        eventType: 'authentication',
        action: 'oauth2_token_failed',
        resourceType: 'auth',
        status: 'failure',
        details: { error: String(error) },
      });
      throw new EsetAuthenticationError('Failed to authenticate with ESET PROTECT API', { error });
    }
  }

  private async getCredentials(): Promise<{ clientId: string; clientSecret: string }> {
    if (this.config.auth.vaultEnabled) {
      // Integrate with HashiCorp Vault
      // For now, return from config
      console.warn('Vault integration not implemented, using config credentials');
    }

    return {
      clientId: this.config.auth.clientId,
      clientSecret: this.config.auth.clientSecret,
    };
  }

  // ==========================================================================
  // HTTP Request with Retry Logic
  // ==========================================================================

  private async makeHttpRequest<T>(
    url: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      skipAuth?: boolean;
      skipRateLimit?: boolean;
    } = {}
  ): Promise<T> {
    const maxRetries = 3;
    const baseDelay = 1000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Rate limiting
        if (!options.skipRateLimit) {
          await this.rateLimiter.acquire();
        }

        // Authentication
        if (!options.skipAuth) {
          await this.authenticate();
        }

        // Prepare request
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...options.headers,
        };

        if (this.token && !options.skipAuth) {
          headers['Authorization'] = `Bearer ${this.token.access_token}`;
        }

        // Make request using native https
        const response = await this.httpRequest(url, {
          method: options.method || 'GET',
          headers,
          body: options.body,
        });

        // Success - gradually recover rate limiter
        this.rateLimiter.resetAdaptive();

        return response as T;
      } catch (error) {
        if (error instanceof EsetRateLimitError) {
          this.rateLimiter.adjustForRateLimit(error.retryAfter || 60);
          const delay = error.retryAfter ? error.retryAfter * 1000 : baseDelay * Math.pow(2, attempt);
          console.warn(`Rate limited. Retrying after ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (error instanceof EsetApiError && error.statusCode && error.statusCode >= 500) {
          // Retry on 5xx errors
          if (attempt < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempt);
            console.warn(`Server error (${error.statusCode}). Retrying after ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }

        throw error;
      }
    }

    throw new EsetApiError('Max retries exceeded');
  }

  private httpRequest(
    url: string,
    options: { method: string; headers: Record<string, string>; body?: string }
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const req = https.request(
        {
          hostname: urlObj.hostname,
          port: urlObj.port || 443,
          path: urlObj.pathname + urlObj.search,
          method: options.method,
          headers: options.headers,
          agent: this.httpsAgent,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if (res.statusCode === 429) {
              const retryAfter = parseInt(res.headers['retry-after'] as string, 10) || 60;
              reject(new EsetRateLimitError('Rate limit exceeded', retryAfter));
              return;
            }

            if (res.statusCode && res.statusCode >= 400) {
              reject(
                new EsetApiError(
                  `HTTP ${res.statusCode}: ${data}`,
                  res.statusCode,
                  'HTTP_ERROR',
                  { body: data }
                )
              );
              return;
            }

            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(data);
            }
          });
        }
      );

      req.on('error', (error) => {
        reject(new EsetApiError('Request failed', undefined, 'NETWORK_ERROR', { error }));
      });

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }

  // ==========================================================================
  // Device Management API
  // ==========================================================================

  async getDevices(params?: {
    page?: number;
    pageSize?: number;
    filter?: string;
  }): Promise<DeviceListResponse> {
    const queryParams = new URLSearchParams({
      page: String(params?.page || 1),
      pageSize: String(params?.pageSize || 100),
      ...(params?.filter && { filter: params.filter }),
    });

    const url = `${this.config.apiEndpoint}/devices?${queryParams}`;

    const response = await this.makeHttpRequest<DeviceListResponse>(url);

    await this.auditLogger.log({
      eventType: 'api_call',
      action: 'list_devices',
      resourceType: 'device',
      status: 'success',
      details: { count: response.devices.length },
    });

    return response;
  }

  async getDeviceHealth(deviceId: string): Promise<DeviceHealth> {
    const url = `${this.config.apiEndpoint}/devices/${deviceId}/health`;

    const response = await this.makeHttpRequest<DeviceHealth>(url);

    await this.auditLogger.log({
      eventType: 'api_call',
      action: 'get_device_health',
      resourceType: 'device',
      resourceId: deviceId,
      status: 'success',
    });

    return response;
  }

  // ==========================================================================
  // Task Management API
  // ==========================================================================

  async createTask(request: TaskRequest): Promise<TaskResponse> {
    const url = `${this.config.apiEndpoint}/tasks`;

    const response = await this.makeHttpRequest<TaskResponse>(url, {
      method: 'POST',
      body: JSON.stringify(request),
    });

    await this.auditLogger.log({
      eventType: 'task_created',
      action: `create_task_${request.taskType}`,
      resourceType: 'task',
      resourceId: response.taskId,
      status: 'success',
      details: { taskName: request.name, targets: request.targets },
    });

    return response;
  }

  async getTaskStatus(taskId: string): Promise<TaskStatusResponse> {
    const url = `${this.config.apiEndpoint}/tasks/${taskId}/status`;

    const response = await this.makeHttpRequest<TaskStatusResponse>(url);

    await this.auditLogger.log({
      eventType: 'api_call',
      action: 'get_task_status',
      resourceType: 'task',
      resourceId: taskId,
      status: 'success',
      details: { taskStatus: response.status },
    });

    return response;
  }

  async approveTask(taskId: string, approver: string): Promise<void> {
    const url = `${this.config.apiEndpoint}/tasks/${taskId}/approve`;

    await this.makeHttpRequest<void>(url, {
      method: 'POST',
      body: JSON.stringify({ approver }),
    });

    await this.auditLogger.log({
      eventType: 'task_executed',
      action: 'approve_task',
      resourceType: 'task',
      resourceId: taskId,
      user: approver,
      status: 'success',
    });
  }

  async cancelTask(taskId: string): Promise<void> {
    const url = `${this.config.apiEndpoint}/tasks/${taskId}/cancel`;

    await this.makeHttpRequest<void>(url, {
      method: 'POST',
    });

    await this.auditLogger.log({
      eventType: 'task_executed',
      action: 'cancel_task',
      resourceType: 'task',
      resourceId: taskId,
      status: 'success',
    });
  }
}
