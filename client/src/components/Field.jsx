import { useId } from 'react';

/** Label + control + hint/error. `children` receives the generated id via render prop or cloneless usage. */
export function Field({ label, hint, error, className = '', children }) {
  const id = useId();
  return (
    <div className={`field ${className}`}>
      {label && <label className="field-label" htmlFor={id}>{label}</label>}
      {children(id, Boolean(error))}
      {error ? <span className="field-error" role="alert">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

export function TextField({ label, hint, error, className, value, onChange, ...rest }) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id, invalid) => (
        <input
          id={id}
          className="input"
          aria-invalid={invalid || undefined}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        />
      )}
    </Field>
  );
}

export function SelectField({ label, hint, error, className, value, onChange, options, ...rest }) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id, invalid) => (
        <select
          id={id}
          className="input"
          aria-invalid={invalid || undefined}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        >
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      )}
    </Field>
  );
}

export function Checkbox({ label, checked, onChange }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
