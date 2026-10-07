import type { DecisionLogEntry } from '@/lib/aegisSDK'

const mono = { fontFamily: "'JetBrains Mono', monospace" }

const decisionTone: Record<string, string> = {
  ALLOWED: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  REQUIRES_APPROVAL: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  BLOCKED: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
}

export function DecisionTable({ rows }: { rows: DecisionLogEntry[] }) {
  if (rows.length === 0) return <p className="text-sm text-gray-500">No entries yet.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs min-w-[720px]" style={mono}>
        <thead>
          <tr className="text-gray-500 border-b border-gray-800">
            <th className="py-2 pr-3 font-medium">Time</th>
            <th className="py-2 pr-3 font-medium">Agent</th>
            <th className="py-2 pr-3 font-medium">Event</th>
            <th className="py-2 pr-3 font-medium">Decision</th>
            <th className="py-2 pr-3 font-medium">Amount</th>
            <th className="py-2 pr-3 font-medium">Actor</th>
            <th className="py-2 font-medium">Reason</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/70">
          {rows.map(r => (
            <tr key={r.id} className="align-top">
              <td className="py-2 pr-3 text-gray-400 whitespace-nowrap">{new Date(r.createdAt).toLocaleTimeString()}</td>
              <td className="py-2 pr-3 text-gray-200">{r.agentName ?? '—'}</td>
              <td className="py-2 pr-3 text-gray-300">{r.eventType}{r.action ? ` · ${r.action}` : ''}</td>
              <td className="py-2 pr-3">{r.decision ? <span className={`px-1.5 py-0.5 rounded border ${decisionTone[r.decision]}`}>{r.decision}</span> : <span className="text-gray-600">—</span>}</td>
              <td className="py-2 pr-3 text-gray-300">{r.amount === null ? '—' : `$${r.amount.toFixed(2)}`}</td>
              <td className="py-2 pr-3 text-gray-400">{r.actorType}</td>
              <td className="py-2 text-gray-400">{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
