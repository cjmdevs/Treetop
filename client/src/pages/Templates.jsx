import { useEffect, useState } from 'react'
import { templatesApi } from '../api/templates'
import { PlusIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline'

const TYPES      = ['Tax Return', 'Bookkeeping', 'Audit', 'Advisory', 'Payroll', 'Other']
const PRIORITIES = ['Low', 'Medium', 'High']

const BLANK_TMPL = { name: '', engagement_type: 'Tax Return', default_priority: 'Medium', subtasks: [] }

export default function Templates() {
  const [templates, setTemplates] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(BLANK_TMPL)
  const [saving, setSaving] = useState(false)

  const load = () => templatesApi.list().then(setTemplates)
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing('new'); setForm(BLANK_TMPL) }
  const openEdit = t => { setEditing(t.id); setForm({ ...t, subtasks: t.subtasks.map(s => ({ ...s })) }) }
  const close = () => setEditing(null)

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  const addStep = () => setForm(f => ({ ...f, subtasks: [...f.subtasks, { title: '', default_assignee_role: '', sort_order: f.subtasks.length }] }))
  const removeStep = i => setForm(f => ({ ...f, subtasks: f.subtasks.filter((_, idx) => idx !== i) }))
  const setStep = (i, field) => e => setForm(f => {
    const s = [...f.subtasks]; s[i] = { ...s[i], [field]: e.target.value }; return { ...f, subtasks: s }
  })

  const handleSubmit = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { ...form, subtasks: form.subtasks.map((s, i) => ({ ...s, sort_order: i })) }
      if (editing === 'new') await templatesApi.create(payload)
      else await templatesApi.update(editing, payload)
      close()
      load()
    } finally { setSaving(false) }
  }

  const handleDelete = async id => {
    if (!confirm('Delete this template?')) return
    await templatesApi.delete(id)
    load()
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflow Templates</h1>
          <p className="text-sm text-gray-500 mt-1">Reusable checklists applied when creating engagements</p>
        </div>
        <button onClick={openNew} className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          + New Template
        </button>
      </div>

      {editing && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">{editing === 'new' ? 'New Template' : 'Edit Template'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1">
                <label className={labelCls}>Template Name *</label>
                <input required value={form.name} onChange={set('name')} className={inputCls} placeholder="e.g. Tax Return Standard" />
              </div>
              <div>
                <label className={labelCls}>Engagement Type</label>
                <select value={form.engagement_type} onChange={set('engagement_type')} className={inputCls}>
                  {TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Default Priority</label>
                <select value={form.default_priority} onChange={set('default_priority')} className={inputCls}>
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Checklist Steps</label>
                <button type="button" onClick={addStep} className="text-xs text-accent hover:text-blue-700 flex items-center gap-1">
                  <PlusIcon className="w-3 h-3" /> Add step
                </button>
              </div>
              <div className="space-y-2">
                {form.subtasks.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-4">{i + 1}.</span>
                    <input
                      value={s.title} onChange={setStep(i, 'title')}
                      placeholder="Step title" required
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <input
                      value={s.default_assignee_role} onChange={setStep(i, 'default_assignee_role')}
                      placeholder="Role (optional)"
                      className="w-36 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <button type="button" onClick={() => removeStep(i)} className="text-gray-300 hover:text-red-400">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {form.subtasks.length === 0 && (
                  <p className="text-sm text-gray-400 py-2">No steps yet — click "Add step" to begin.</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={close} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" disabled={saving} className="px-6 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {templates.map(t => (
          <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="font-semibold text-gray-900">{t.name}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{t.engagement_type} · {t.default_priority} priority · {t.subtasks.length} steps</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(t)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                  <PencilIcon className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(t.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            <ol className="space-y-1">
              {t.subtasks.map((s, i) => (
                <li key={s.id} className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="w-5 h-5 rounded-full border border-gray-200 flex items-center justify-center text-xs text-gray-400 flex-shrink-0">{i + 1}</span>
                  {s.title}
                  {s.default_assignee_role && <span className="text-xs text-gray-400 ml-auto">{s.default_assignee_role}</span>}
                </li>
              ))}
            </ol>
          </div>
        ))}
        {templates.length === 0 && (
          <div className="text-center py-12 text-gray-400">No templates yet. Create one to speed up engagement setup.</div>
        )}
      </div>
    </div>
  )
}
