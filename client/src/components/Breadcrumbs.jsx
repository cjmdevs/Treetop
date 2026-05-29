import { Link } from 'react-router-dom'

export function Breadcrumbs({ crumbs }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-4">
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-gray-300">/</span>}
          {c.to
            ? <Link to={c.to} className="hover:text-gray-600 transition-colors">{c.label}</Link>
            : <span className="text-gray-700 font-medium">{c.label}</span>
          }
        </span>
      ))}
    </nav>
  )
}
