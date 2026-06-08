import { useId } from 'react'

interface Props {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
}

/**
 * 入力可能なコンボボックス（datalist 利用）。
 * 既存候補から選択でき、未登録の値を入力した場合は親側で新規登録する。
 */
export default function ComboBox({ label, value, options, onChange, placeholder, hint }: Props) {
  const listId = useId()
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="text"
        list={listId}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}
