import { useState, useCallback } from 'react'

type NumericMode = 'integer' | 'decimal'

export function useIosNumericInput(mode: NumericMode) {
  const [inputMode, setInputMode] = useState<'tel' | 'numeric' | 'decimal'>('tel')

  const onFocus = useCallback(() => {
    setInputMode('tel')
    setTimeout(() => {
      setInputMode(mode === 'decimal' ? 'decimal' : 'numeric')
    }, 150)
  }, [mode])

  const onBlur = useCallback(() => {
    setInputMode('tel')
  }, [])

  return { inputMode, onFocus, onBlur } as const
}
