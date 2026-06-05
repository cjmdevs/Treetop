import { useEffect, useState } from 'react'
import { notesApi } from '../api/notes'

const CATS = ['All', 'General', 'Tax', 'Client', 'Internal', 'Billing']
const ENTITY_TYPES = ['All', 'engagement', 'client', 'staff']

const BLANK = { entity_type: 'engagement', entity_id: '', note_text: '', category: 'General', created_by: '', pinned: false }

export default function Notes() {
  const [notes, setNotes] = useState([])
  const [catFilter, setCatFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)

  const load = () => notesApi.list().then(setNotes)
  useEffect(() => { load() }, [])

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      await notesApi.create({ ...form, entity_id: parseInt(form.entity_id) || 0 })
      setForm(BLANK)
      setShowForm(false)
      load()
    } finally { setSaving(false) }
  }

  const togglePin = async n => {
    await notesApi.update(n.id, { ...n, pinned: !n.pinned })
    load()
  }

  const deleteNote = async id => {
    await notesApi.delete(id)
    load()
  }

  const filtered = notes.filter(n =>
    (catFilter === 'All' || n.category === catFilter) &&
    (typeFilter === 'All' || n.entity_type === typeFilter)
  )

  const inputCls = 'border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent'

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Notes</h1>
        <button onClick={() => setShowForm(v => !v)} className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-dark transition-colors">
          + Add Note
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">New Note</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Entity Type</label>
                <select value={form.entity_type} onChange={set('entity_type')} className={`w-full ${inputCls}`}>
                  {['engagement', 'client', 'staff'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Entity ID</label>
                <input type="number" value={form.entity_id} onChange={set('entity_id')} className={`w-full ${inputCls}`} placeholder="e.g. 1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select value={form.category} onChange={set('category')} className={`w-full ${inputCls}`}>
                  {CATS.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Note *</label>
              <textarea required value={form.note_text} onChange={set('note_text')} rows={3}
                className={`w-full ${inputCls} resize-none`} placeholder="Note text..." />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <input value={form.created_by} onChange={set('created_by')} className={`${inputCls} w-48`} placeholder="Your name (optional)" />
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={form.pinned} onChange={set('pinned')} className="rounded" />
                  Pin note
                </label>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
                <button type="submit" disabled={saving} className="px-6 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-dark disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Note'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div className="flex gap-3 mb-6 flex-wrap">
        {CATS.map(c => (
          <button key={c} onClick={() => setCatFilter(c)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${catFilter === c ? 'bg-accent text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-accent hover:text-accent'}`}>
            {c}
          </button>
        ))}
        <span className="text-gray-300">|</span>
        {ENTITY_TYPES.map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${typeFilter === t ? 'bg-gray-700 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-700 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map(n => (
          <div key={n.id} className={`bg-white rounded-xl border p-5 group ${n.pinned ? 'border-amber-200' : 'border-gray-200'}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-gray-800 text-sm leading-relaxed">{n.note_text}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">{n.category}</span>
                  <span className="text-xs text-gray-400 capitalize">{n.entity_type} #{n.entity_id}</span>
                  {n.created_by && <span className="text-xs text-gray-400">{n.created_by}</span>}
                  <span className="text-xs text-gray-300">{new Date(n.created_at).toLocaleDateString()}</span>
                  {n.pinned && <span className="text-xs text-amber-500">📌 Pinned</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => togglePin(n)} className={`p-1.5 rounded hover:bg-gray-50 text-sm ${n.pinned ? 'text-amber-500' : 'text-gray-400 hover:text-amber-500'}`}>📌</button>
                <button onClick={() => deleteNote(n.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 text-sm">×</button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">No notes found.</div>
        )}
      </div>
    </div>
  )
}
