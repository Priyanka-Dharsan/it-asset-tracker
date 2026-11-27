import { useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  useAnalyticsQuery,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { ResultTable } from './ResultTable';

export function AuthDemo() {
  const params = useMemo(() => ({ row_limit: sql.number(100) }), []);
const { data, loading, error } = useAnalyticsQuery('employees', params);
  return (
    <Card>
      <CardHeader>
        <CardTitle>App auth vs user auth</CardTitle>
        <CardDescription>
          This query runs as you (on-behalf-of), so Unity Catalog row filters apply.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data && data.length > 0 && (
          <div className="text-sm text-muted-foreground">
            {data.length} rows · ran as <b>{data[0].running_as}</b>
          </div>
        )}
        <ResultTable rows={data} loading={loading} error={error} />
      </CardContent>
    </Card>
  );
}