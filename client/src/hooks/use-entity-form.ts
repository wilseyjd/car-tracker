import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

interface UseEntityFormOptions<TValues> {
  /** Whether the owning dialog is open. Values reset to initial whenever this flips true. */
  open: boolean;
  /** Computes the values to reset to on open — close over `entity`/defaults in the caller. */
  getInitialValues: () => TValues;
  /** Extra values (besides `open`) that should trigger a reset when they change while open. */
  resetDeps?: unknown[];
  /** Return an error message to block submit + toast it, or null/undefined if valid. */
  validate?: (values: TValues) => string | null | undefined;
  /** Perform the create/update call for the current values. */
  submit: (values: TValues) => Promise<void>;
  /** Called after a successful submit (e.g. invalidate queries, close the dialog). */
  onSuccess: () => void;
  /** Toast message shown on a successful submit. */
  successMessage: string;
}

export function useEntityForm<TValues extends object>({
  open,
  getInitialValues,
  resetDeps = [],
  validate,
  submit,
  onSuccess,
  successMessage,
}: UseEntityFormOptions<TValues>) {
  const [values, setValues] = useState<TValues>(getInitialValues);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    setValues(getInitialValues());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ...resetDeps]);

  function setValue<K extends keyof TValues>(key: K, value: TValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const mutation = useMutation({
    mutationFn: () => submit(values),
    onSuccess: () => {
      toast.success(successMessage);
      onSuccess();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const error = validate?.(values);
    if (error) {
      toast.error(error);
      return;
    }
    mutation.mutate();
  }

  return {
    values,
    setValue,
    setValues,
    isPending: mutation.isPending,
    handleSubmit,
  };
}
