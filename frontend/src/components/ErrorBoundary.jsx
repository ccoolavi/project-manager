import { Component } from 'react'

/**
 * Last line of defence: if any screen throws while rendering, show a calm recovery card instead of a blank page.
 * (Before this existed, one unexpected value could unmount the whole app and leave an empty dark screen.)
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('KaizenPM screen crashed:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    const message = String(this.state.error?.message || '').slice(0, 160)
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4" role="alert">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <h1 className="mb-2 text-xl font-bold text-white">Something went wrong</h1>
          <p className="mb-4 text-sm text-slate-400">
            This screen hit an unexpected problem. Your saved data is safe. You can try again, or reload the app.
          </p>
          {message && <p className="mb-4 break-words rounded bg-slate-800 px-3 py-2 text-xs text-slate-400">{message}</p>}
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-800"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Reload the app
            </button>
          </div>
        </div>
      </div>
    )
  }
}
