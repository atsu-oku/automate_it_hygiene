/**
 * ESET Notifier
 *
 * Notification and reporting capabilities:
 * - Slack/Teams/Email notifications
 * - Daily/Weekly/Monthly reports
 * - Dashboard data export
 */

import https from 'https';
import { createTransport, Transporter } from 'nodemailer';
import {
  MonitoringConfig,
  HealthCheckResult,
  Report,
  ReportRequest,
} from '../core/eset-types';

// ============================================================================
// Notification Providers
// ============================================================================

export class SlackNotifier {
  constructor(private webhookUrl: string, private channel?: string) {}

  async sendNotification(message: {
    title: string;
    text: string;
    severity: 'info' | 'warning' | 'critical';
    fields?: { title: string; value: string; short?: boolean }[];
  }): Promise<void> {
    const color = message.severity === 'critical' ? '#ff0000' : message.severity === 'warning' ? '#ffaa00' : '#00ff00';

    const payload = {
      channel: this.channel,
      username: 'ESET Monitor',
      icon_emoji: ':shield:',
      attachments: [
        {
          color,
          title: message.title,
          text: message.text,
          fields: message.fields,
          footer: 'ESET PROTECT Monitor',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    await this.sendWebhook(payload);
  }

  async sendHealthCheckAlert(result: HealthCheckResult): Promise<void> {
    const criticalIssues = result.issues.filter((i) => i.severity === 'critical');
    const warningIssues = result.issues.filter((i) => i.severity === 'warning');

    if (criticalIssues.length === 0 && warningIssues.length === 0) {
      // All healthy, send summary
      await this.sendNotification({
        title: 'ESET Health Check - All Clear',
        text: `All ${result.summary.totalDevices} devices are healthy!`,
        severity: 'info',
        fields: [
          { title: 'Healthy', value: String(result.summary.healthyDevices), short: true },
          { title: 'Warning', value: String(result.summary.warningDevices), short: true },
          { title: 'Critical', value: String(result.summary.criticalDevices), short: true },
          { title: 'Offline', value: String(result.summary.offlineDevices), short: true },
        ],
      });
      return;
    }

    // Send alert with issues
    const severity = criticalIssues.length > 0 ? 'critical' : 'warning';
    const issueList = [...criticalIssues.slice(0, 5), ...warningIssues.slice(0, 5)]
      .map((issue) => `• ${issue.deviceName}: ${issue.description}`)
      .join('\n');

    await this.sendNotification({
      title: `ESET Health Check - ${criticalIssues.length} Critical, ${warningIssues.length} Warnings`,
      text: `Found ${result.issues.length} issues:\n${issueList}`,
      severity,
      fields: [
        { title: 'Total Devices', value: String(result.summary.totalDevices), short: true },
        { title: 'Critical Issues', value: String(criticalIssues.length), short: true },
        { title: 'Warning Issues', value: String(warningIssues.length), short: true },
        { title: 'Offline Devices', value: String(result.summary.offlineDevices), short: true },
      ],
    });
  }

  private async sendWebhook(payload: unknown): Promise<void> {
    const url = new URL(this.webhookUrl);

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Slack webhook failed with status ${res.statusCode}`));
          } else {
            resolve();
          }
        }
      );

      req.on('error', reject);
      req.write(JSON.stringify(payload));
      req.end();
    });
  }
}

export class TeamsNotifier {
  constructor(private webhookUrl: string) {}

  async sendNotification(message: {
    title: string;
    text: string;
    severity: 'info' | 'warning' | 'critical';
    facts?: { name: string; value: string }[];
  }): Promise<void> {
    const themeColor = message.severity === 'critical' ? 'FF0000' : message.severity === 'warning' ? 'FFAA00' : '00FF00';

    const payload = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: message.title,
      themeColor,
      sections: [
        {
          activityTitle: message.title,
          activitySubtitle: 'ESET PROTECT Monitor',
          activityImage: 'https://www.eset.com/assets/images/eset-logo.png',
          text: message.text,
          facts: message.facts,
        },
      ],
    };

    await this.sendWebhook(payload);
  }

  async sendHealthCheckAlert(result: HealthCheckResult): Promise<void> {
    const criticalIssues = result.issues.filter((i) => i.severity === 'critical');
    const warningIssues = result.issues.filter((i) => i.severity === 'warning');

    const severity = criticalIssues.length > 0 ? 'critical' : warningIssues.length > 0 ? 'warning' : 'info';

    const issueList = [...criticalIssues.slice(0, 5), ...warningIssues.slice(0, 5)]
      .map((issue) => `${issue.deviceName}: ${issue.description}`)
      .join('<br>');

    await this.sendNotification({
      title: `ESET Health Check - ${criticalIssues.length} Critical, ${warningIssues.length} Warnings`,
      text: issueList || 'All devices are healthy!',
      severity,
      facts: [
        { name: 'Total Devices', value: String(result.summary.totalDevices) },
        { name: 'Healthy', value: String(result.summary.healthyDevices) },
        { name: 'Warning', value: String(result.summary.warningDevices) },
        { name: 'Critical', value: String(result.summary.criticalDevices) },
        { name: 'Offline', value: String(result.summary.offlineDevices) },
      ],
    });
  }

  private async sendWebhook(payload: unknown): Promise<void> {
    const url = new URL(this.webhookUrl);

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Teams webhook failed with status ${res.statusCode}`));
          } else {
            resolve();
          }
        }
      );

      req.on('error', reject);
      req.write(JSON.stringify(payload));
      req.end();
    });
  }
}

export class EmailNotifier {
  private transporter: Transporter;

  constructor(
    private smtpConfig: MonitoringConfig['notifications']['email']['smtpConfig'],
    private recipients: string[]
  ) {
    this.transporter = createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: smtpConfig.auth,
    });
  }

  async sendHealthCheckAlert(result: HealthCheckResult): Promise<void> {
    const criticalIssues = result.issues.filter((i) => i.severity === 'critical');
    const warningIssues = result.issues.filter((i) => i.severity === 'warning');

    const subject = `ESET Health Check - ${criticalIssues.length} Critical, ${warningIssues.length} Warnings`;

    const html = this.generateHealthCheckHtml(result);

    await this.transporter.sendMail({
      from: this.smtpConfig.auth.user,
      to: this.recipients.join(', '),
      subject,
      html,
    });
  }

  async sendReport(report: Report): Promise<void> {
    const subject = `ESET ${report.type} Report - ${report.period.start.toLocaleDateString()} to ${report.period.end.toLocaleDateString()}`;

    const html = this.generateReportHtml(report);

    await this.transporter.sendMail({
      from: this.smtpConfig.auth.user,
      to: this.recipients.join(', '),
      subject,
      html,
    });
  }

  private generateHealthCheckHtml(result: HealthCheckResult): string {
    const criticalIssues = result.issues.filter((i) => i.severity === 'critical');
    const warningIssues = result.issues.filter((i) => i.severity === 'warning');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; }
          .summary { background: #f0f0f0; padding: 15px; margin-bottom: 20px; }
          .issue { border-left: 4px solid #ff0000; padding: 10px; margin: 10px 0; background: #fff5f5; }
          .warning { border-left: 4px solid #ffaa00; background: #fffbf0; }
          .healthy { color: green; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>ESET Health Check Report</h1>
        <p>Generated: ${result.timestamp.toLocaleString()}</p>

        <div class="summary">
          <h2>Summary</h2>
          <ul>
            <li>Total Devices: ${result.summary.totalDevices}</li>
            <li class="healthy">Healthy: ${result.summary.healthyDevices}</li>
            <li>Warning: ${result.summary.warningDevices}</li>
            <li>Critical: ${result.summary.criticalDevices}</li>
            <li>Offline: ${result.summary.offlineDevices}</li>
          </ul>
        </div>

        ${criticalIssues.length > 0 ? `
          <h2>Critical Issues (${criticalIssues.length})</h2>
          ${criticalIssues.map((issue) => `
            <div class="issue">
              <strong>${issue.deviceName}</strong> (${issue.issueType})<br>
              ${issue.description}
            </div>
          `).join('')}
        ` : ''}

        ${warningIssues.length > 0 ? `
          <h2>Warnings (${warningIssues.length})</h2>
          ${warningIssues.map((issue) => `
            <div class="issue warning">
              <strong>${issue.deviceName}</strong> (${issue.issueType})<br>
              ${issue.description}
            </div>
          `).join('')}
        ` : ''}
      </body>
      </html>
    `;
  }

  private generateReportHtml(report: Report): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; }
          .summary { background: #f0f0f0; padding: 15px; margin-bottom: 20px; }
          table { border-collapse: collapse; width: 100%; margin: 20px 0; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #4CAF50; color: white; }
        </style>
      </head>
      <body>
        <h1>ESET ${report.type} Report</h1>
        <p>Period: ${report.period.start.toLocaleDateString()} - ${report.period.end.toLocaleDateString()}</p>
        <p>Generated: ${report.generatedAt.toLocaleString()}</p>

        <div class="summary">
          <h2>Summary</h2>
          <ul>
            <li>Total Devices: ${report.summary.totalDevices}</li>
            <li>Average Health: ${(report.summary.averageHealth * 100).toFixed(1)}%</li>
            <li>Threats Detected: ${report.summary.threatsDetected}</li>
            <li>Threats Resolved: ${report.summary.threatsResolved}</li>
            <li>Tasks Executed: ${report.summary.tasksExecuted}</li>
            <li>Tasks Succeeded: ${report.summary.tasksSucceeded} (${((report.summary.tasksSucceeded / report.summary.tasksExecuted) * 100).toFixed(1)}%)</li>
          </ul>
        </div>

        <h2>Device Health Distribution</h2>
        <table>
          <tr>
            <th>Status</th>
            <th>Count</th>
            <th>Percentage</th>
          </tr>
          <tr>
            <td>Healthy</td>
            <td>${report.deviceHealth.healthy}</td>
            <td>${((report.deviceHealth.healthy / report.summary.totalDevices) * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Warning</td>
            <td>${report.deviceHealth.warning}</td>
            <td>${((report.deviceHealth.warning / report.summary.totalDevices) * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Critical</td>
            <td>${report.deviceHealth.critical}</td>
            <td>${((report.deviceHealth.critical / report.summary.totalDevices) * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Offline</td>
            <td>${report.deviceHealth.offline}</td>
            <td>${((report.deviceHealth.offline / report.summary.totalDevices) * 100).toFixed(1)}%</td>
          </tr>
        </table>

        <h2>Top Issues</h2>
        <table>
          <tr>
            <th>Issue Type</th>
            <th>Count</th>
            <th>Affected Devices</th>
          </tr>
          ${report.topIssues.map((issue) => `
            <tr>
              <td>${issue.issueType}</td>
              <td>${issue.count}</td>
              <td>${issue.affectedDevices.slice(0, 3).join(', ')}${issue.affectedDevices.length > 3 ? '...' : ''}</td>
            </tr>
          `).join('')}
        </table>
      </body>
      </html>
    `;
  }
}

// ============================================================================
// Multi-Channel Notifier
// ============================================================================

export class MultiChannelNotifier {
  private slack?: SlackNotifier;
  private teams?: TeamsNotifier;
  private email?: EmailNotifier;

  constructor(config: MonitoringConfig['notifications']) {
    if (config.slack?.enabled && config.slack.webhookUrl) {
      this.slack = new SlackNotifier(config.slack.webhookUrl, config.slack.channel);
    }

    if (config.teams?.enabled && config.teams.webhookUrl) {
      this.teams = new TeamsNotifier(config.teams.webhookUrl);
    }

    if (config.email?.enabled && config.email.smtpConfig && config.email.recipients) {
      this.email = new EmailNotifier(config.email.smtpConfig, config.email.recipients);
    }
  }

  async sendHealthCheckAlert(result: HealthCheckResult): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.slack) {
      promises.push(this.slack.sendHealthCheckAlert(result).catch((e) => {
        console.error('Failed to send Slack notification:', e);
      }));
    }

    if (this.teams) {
      promises.push(this.teams.sendHealthCheckAlert(result).catch((e) => {
        console.error('Failed to send Teams notification:', e);
      }));
    }

    if (this.email) {
      promises.push(this.email.sendHealthCheckAlert(result).catch((e) => {
        console.error('Failed to send email notification:', e);
      }));
    }

    await Promise.all(promises);
  }

  async sendReport(report: Report): Promise<void> {
    if (this.email) {
      await this.email.sendReport(report).catch((e) => {
        console.error('Failed to send report email:', e);
      });
    }
  }
}
