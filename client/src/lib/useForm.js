import { useCallback, useState } from 'react';

/**
 * Form state with server-side validation errors.
 * `submit(fn)` runs fn(values); an ApiError with `fields` is mapped onto inputs.
 */
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  const field = useCallback((name) => ({
    value: values[name],
    error: errors[name],
    onChange: (v) => {
      setValues((s) => ({ ...s, [name]: v }));
      setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
    },
  }), [values, errors]);

  const reset = useCallback((next) => {
    setValues(next);
    setErrors({});
    setFormError(null);
    setBusy(false);
  }, []);

  async function submit(fn) {
    setBusy(true);
    setFormError(null);
    try {
      const result = await fn(values);
      setBusy(false);
      return result;
    } catch (err) {
      setErrors(err.fields ?? {});
      setFormError(Object.keys(err.fields ?? {}).length ? null : err.message);
      setBusy(false);
      throw err;
    }
  }

  return { values, setValues, field, errors, formError, busy, submit, reset };
}
