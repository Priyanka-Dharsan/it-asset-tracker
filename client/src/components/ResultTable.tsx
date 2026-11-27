import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@databricks/appkit-ui/react';

interface ResultTableProps<T extends object> {
  rows: T[] | null;
  loading: boolean;
  error: string | null;
  emptyMessage?: string;
}

export function ResultTable<T extends object>({
  rows,
  loading,
  error,
  emptyMessage = 'No rows.',
}: ResultTableProps<T>) {
  if (error) {
    return (
      <div className="text-destructive bg-destructive/10 p-3 rounded-md text-sm">
        Query failed: {error}
      </div>
    );
  }
  if (loading && !rows) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-3/4" />
      </div>
    );
  }
  if (!rows || rows.length === 0) {
    return <div className="text-muted-foreground text-sm py-6">{emptyMessage}</div>;
  }

  const columns = Object.keys(rows[0]);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((c) => (
            <TableHead key={c}>{c}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={i}>
            {columns.map((c) => (
              <TableCell key={c}>{String((row as Record<string, unknown>)[c] ?? '')}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}