export interface DelegationForExport {
  id: string
  provider: string
  account_email: string | null
  scope: string
  status: 'active' | 'revoked'
  created_at: string
  revoked_at: string | null
}

export function exportDelegationsToCSV(delegations: DelegationForExport[]) {
  if (!delegations.length) {
    alert('No delegations to export')
    return
  }

  // Build CSV header
  const headers = ['ID', 'Provider', 'Account Email', 'Scope', 'Status', 'Created', 'Revoked']

  // Build CSV rows
  const rows = delegations.map(d => [
    d.id,
    d.provider,
    d.account_email || 'N/A',
    d.scope,
    d.status,
    new Date(d.created_at).toLocaleString(),
    d.revoked_at ? new Date(d.revoked_at).toLocaleString() : 'N/A',
  ])

  // Combine and escape
  const csv = [
    headers.map(escapeCSV).join(','),
    ...rows.map(row => row.map(escapeCSV).join(',')),
  ].join('\n')

  // Trigger download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', `aegis-delegations-${new Date().toISOString().split('T')[0]}.csv`)
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function escapeCSV(value: string): string {
  if (typeof value !== 'string') return String(value)
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
