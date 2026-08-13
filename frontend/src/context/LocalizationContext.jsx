import React, { createContext, useContext, useMemo } from 'react'

/**
 * Indian formatting conventions: rupees, the 2-2-3 digit grouping
 * (1,00,00,000 rather than 10,000,000), and DD-MM-YYYY dates.
 */

const LocalizationContext = createContext(null)

const LOCALE = 'en-IN'
const CURRENCY = 'INR'

export function formatCurrency(amount) {
  const value = Number(amount)
  if (!Number.isFinite(value)) return '₹0.00'
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

export function formatNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  return new Intl.NumberFormat(LOCALE).format(n)
}

export function formatDate(input) {
  if (!input) return ''
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

export function formatDateTime(input) {
  if (!input) return ''
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })
  return `${formatDate(d)}, ${time}`
}

/** "45m", "2h 15m" — friendlier than a raw minute count in the UI. */
export function formatDuration(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0))
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (!h) return `${rem}m`
  return rem ? `${h}h ${rem}m` : `${h}h`
}

/** "today", "yesterday", "3 days ago" — used for habit and log timestamps. */
export function formatRelativeDay(input) {
  if (!input) return ''
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return ''
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate())
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days > 1 && days < 7) return `${days} days ago`
  return formatDate(d)
}

export function LocalizationProvider({ children }) {
  const value = useMemo(
    () => ({
      locale: LOCALE,
      currency: CURRENCY,
      formatCurrency,
      formatNumber,
      formatDate,
      formatDateTime,
      formatDuration,
      formatRelativeDay
    }),
    []
  )
  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  )
}

export function useLocalization() {
  const ctx = useContext(LocalizationContext)
  if (!ctx) throw new Error('useLocalization must be inside LocalizationProvider')
  return ctx
}
