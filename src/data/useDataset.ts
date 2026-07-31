import { useEffect, useState } from 'react'
import type { Dataset } from '../types'
import { DataLoadError, loadDataset } from './load'
import { applyPalette } from '../theme'

export type DatasetState =
  | { status: 'loading' }
  | { status: 'ready'; data: Dataset }
  | { status: 'error'; error: DataLoadError | Error }

/**
 * Fetches the dataset once on mount and applies its palette.
 *
 * Deliberately has no retry loop: if the file is missing or malformed, the
 * curator needs to see that and fix it, not watch a spinner retry forever.
 */
export function useDataset(): DatasetState {
  const [state, setState] = useState<DatasetState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    loadDataset(controller.signal)
      .then((data) => {
        applyPalette(data.meta)
        setState({ status: 'ready', data })
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setState({
          status: 'error',
          error: err instanceof Error ? err : new Error(String(err)),
        })
      })
    return () => controller.abort()
  }, [])

  return state
}
