export interface AgentPreset {
  name: string
  description: string
  spending: number
  scopes: Record<string, boolean>
  approvalTrigger: string
}

export const agentPresets: Record<string, AgentPreset> = {
  'read-only': {
    name: 'Read-Only Agent',
    description: 'View-only access, no spending, no writes',
    spending: 0,
    scopes: {
      email_read: true,
      email_send: false,
      calendar_read: true,
      calendar_write: false,
      drive_read: true,
      drive_write: false,
      banking_read: true,
      banking_transfer: false,
      analytics_read: true,
      analytics_modify: false,
      customer_data_view: true,
      customer_data_export: false,
      payment_processing: false,
      vendor_apis_read: true,
    },
    approvalTrigger: '0',
  },
  'productivity': {
    name: 'Productivity Agent',
    description: 'Read + write for email/calendar, limited spending ($100)',
    spending: 100,
    scopes: {
      email_read: true,
      email_send: true,
      calendar_read: true,
      calendar_write: true,
      drive_read: true,
      drive_write: true,
      banking_read: true,
      banking_transfer: false,
      analytics_read: true,
      analytics_modify: false,
      customer_data_view: true,
      customer_data_export: false,
      payment_processing: false,
      vendor_apis_read: true,
    },
    approvalTrigger: '50',
  },
  'financial': {
    name: 'Financial Agent',
    description: 'Full banking access, approval threshold $500',
    spending: 500,
    scopes: {
      email_read: true,
      email_send: true,
      calendar_read: true,
      calendar_write: true,
      drive_read: true,
      drive_write: true,
      banking_read: true,
      banking_transfer: true,
      analytics_read: true,
      analytics_modify: true,
      customer_data_view: true,
      customer_data_export: true,
      payment_processing: true,
      vendor_apis_read: true,
    },
    approvalTrigger: '500',
  },
  'unrestricted': {
    name: 'Unrestricted Agent',
    description: 'Full access, no approval required (high risk)',
    spending: 10000,
    scopes: {
      email_read: true,
      email_send: true,
      calendar_read: true,
      calendar_write: true,
      drive_read: true,
      drive_write: true,
      banking_read: true,
      banking_transfer: true,
      analytics_read: true,
      analytics_modify: true,
      customer_data_view: true,
      customer_data_export: true,
      payment_processing: true,
      vendor_apis_read: true,
    },
    approvalTrigger: '10000',
  },
}

export function getAgentPresets() {
  return Object.entries(agentPresets).map(([key, preset]) => ({
    id: key,
    ...preset,
  }))
}
