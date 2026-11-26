/**
 * Thin hooks over window.bailAPI IPC calls.
 * Each hook returns { data, loading, error, refetch }.
 */
import { useState, useEffect, useCallback } from 'react'

function useAsync(fn, deps = []) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const refetch = useCallback(async (...args) => {
    setLoading(true); setError(null)
    try {
      const result = await fn(...args)
      setData(result)
      return result
    } catch (e) {
      setError(e?.message || String(e))
      return null
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => { refetch() }, [refetch])

  return { data, loading, error, refetch }
}

export function useDashboardStats() {
  return useAsync(() => window.bailAPI?.db?.dashboard?.stats?.() ?? Promise.resolve(null))
}

export function useCaseList(filters = {}) {
  const key = JSON.stringify(filters)
  return useAsync(() => window.bailAPI?.db?.cases?.list?.(filters) ?? Promise.resolve([]), [key])
}

export function useStatutes(filter = {}) {
  const key = JSON.stringify(filter)
  return useAsync(() => window.bailAPI?.db?.statutes?.list?.(filter) ?? Promise.resolve([]), [key])
}

export function usePronouncements() {
  return useAsync(() => window.bailAPI?.db?.pronouncements?.list?.() ?? Promise.resolve([]))
}

export function useSystemInfo() {
  return useAsync(() => window.bailAPI?.getSystemInfo?.() ?? Promise.resolve(null))
}
