import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface QueryStateProps<T> {
  isLoading: boolean;
  isError?: boolean;
  error?: Error | null;
  data: T[] | undefined;
  /** Rendered while loading. */
  skeleton: ReactNode;
  /** Rendered when the query succeeded but returned no rows. */
  empty: ReactNode;
  /** Rendered when the query succeeded with rows. */
  children: (data: T[]) => ReactNode;
}

/**
 * Shared loading / error / empty / data states for a list backed by a single query,
 * so every entity list gets the same conventions without re-implementing them per page.
 */
export function QueryState<T>({
  isLoading,
  isError,
  error,
  data,
  skeleton,
  empty,
  children,
}: QueryStateProps<T>) {
  if (isLoading) return <>{skeleton}</>;

  if (isError) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-destructive">
          {error?.message ?? "Something went wrong loading this data."}
        </CardContent>
      </Card>
    );
  }

  const list = data ?? [];
  if (list.length === 0) return <>{empty}</>;

  return <>{children(list)}</>;
}
