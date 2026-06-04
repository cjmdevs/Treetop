import { createContext, useCallback, useContext, useState } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now()
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500)
  }, [])

  const remove = id => setToasts(t => t.filter(x => x.id !== id))

  // Expose convenience shorthands so both patterns work app-wide:
  //   toast.addToast('msg', 'error')   ← existing low-level API
  //   toast.success('msg')             ← shorthand used throughout the app
  //   toast.error('msg')               ← shorthand used throughout the app
  const success = (msg) => addToast(msg, 'success')
  const error   = (msg) => addToast(msg, 'error')

  return (
    <ToastContext.Provider value={{ addToast, success, error }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            onClick={() => remove(t.id)}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-slide-up cursor-pointer select-none
              ${t.type === 'success' ? 'bg-gray-900 text-white' :
                t.type === 'error'   ? 'bg-red-600 text-white'  :
                'bg-white border border-gray-200 text-gray-800'}`}
          >
            <span className="text-base leading-none">
              {t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
