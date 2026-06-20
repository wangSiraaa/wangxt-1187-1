import { useCallback, useEffect, useState } from 'react'

export function useAsync(fn, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    return Promise.resolve()
      .then(fn)
      .then((d) => {
        setData(d)
        return d
      })
      .catch((e) => {
        setError(e.message || String(e))
        throw e
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    let alive = true
    Promise.resolve()
      .then(fn)
      .then((d) => {
        if (alive) {
          setData(d)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (alive) {
          setError(e.message || String(e))
          setLoading(false)
        }
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error, reload, setData }
}
