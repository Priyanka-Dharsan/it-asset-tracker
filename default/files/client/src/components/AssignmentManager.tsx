import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@databricks/appkit-ui/react';
import type { ActiveEmployee, ManagedAsset } from '../lib/types';

/** Calls a write endpoint; throws the server's error message on failure. */
async function call<T>(method: string, url: string, body?: unknown): Promise<T | null> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `${method} ${url} failed (${res.status})`);
  }
  return res.status === 204 ? null : ((await res.json()) as T);
}

export function ManageAssets() {
  const [assets, setAssets] = useState<ManagedAsset[]>([]);
  const [employees, setEmployees] = useState<ActiveEmployee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickedEmployee, setPickedEmployee] = useState<Record<string, string>>({});

  // New-asset form
  const [newId, setNewId] = useState('');
  const [newType, setNewType] = useState('Laptop');
  const [newModel, setNewModel] = useState('');
  const [newWarranty, setNewWarranty] = useState('');

  const load = useCallback(async () => {
    try {
      const [a, e] = await Promise.all([
        call<ManagedAsset[]>('GET', '/api/lakebase/assets'),
        call<ActiveEmployee[]>('GET', '/api/lakebase/employees'),
      ]);
      setAssets(a ?? []);
      setEmployees(e ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Runs one write, then reloads the list so the screen matches the database. */
  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      setMessage(success);
      setError(null);
      await load();
    } catch (err) {
      setMessage(null);
      setError(err instanceof Error ? err.message : 'Request failed');
    }
  };

  const addAsset = (e: React.FormEvent) => {
    e.preventDefault();
    void run(
      () =>
        call('POST', '/api/lakebase/assets', {
          asset_id: newId.trim().toUpperCase(),
          asset_type: newType,
          model: newModel,
          warranty_end: newWarranty || null,
        }),
      `Created ${newId.toUpperCase()}`,
    ).then(() => {
      setNewId('');
      setNewModel('');
      setNewWarranty('');
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add an asset</CardTitle>
          <CardDescription>
            Saved in Lakebase (Postgres). The other tabs read Delta, which updates after the next
            sync.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={addAsset} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div className="space-y-1">
              <Label htmlFor="new-id">Asset id</Label>
              <Input id="new-id" placeholder="A008" value={newId} onChange={(e) => setNewId(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-type">Type</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger id="new-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['Laptop', 'Monitor', 'Phone'].map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-model">Model</Label>
              <Input id="new-model" value={newModel} onChange={(e) => setNewModel(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-warranty">Warranty end</Label>
              <Input id="new-warranty" type="date" value={newWarranty} onChange={(e) => setNewWarranty(e.target.value)} />
            </div>
            <Button type="submit">Add asset</Button>
          </form>
        </CardContent>
      </Card>

      {message && <div className="text-sm text-muted-foreground">{message}</div>}
      {error && (
        <div className="text-destructive bg-destructive/10 p-3 rounded-md text-sm">{error}</div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Asset</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Held by</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && (
            <TableRow>
              <TableCell colSpan={5}>Loading…</TableCell>
            </TableRow>
          )}
          {assets.map((a) => (
            <TableRow key={a.asset_id}>
              <TableCell>
                {a.asset_id} <span className="text-muted-foreground">({a.asset_type})</span>
              </TableCell>
              <TableCell>{a.model}</TableCell>
              <TableCell>
                {a.status === 'Assigned' ? (
                  'Assigned'
                ) : (
                  <Select
                    value={a.status}
                    onValueChange={(status) =>
                      void run(
                        () => call('PATCH', `/api/lakebase/assets/${a.asset_id}`, { status }),
                        `${a.asset_id} is now ${status}`,
                      )
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['Available', 'Repair', 'Retired'].map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </TableCell>
              <TableCell>{a.holder ?? '—'}</TableCell>
              <TableCell className="space-x-2">
                {a.status === 'Available' && (
                  <span className="inline-flex gap-2 items-center">
                    <Select
                      value={pickedEmployee[a.asset_id] ?? ''}
                      onValueChange={(v) => setPickedEmployee((p) => ({ ...p, [a.asset_id]: v }))}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((e) => (
                          <SelectItem key={e.employee_id} value={e.employee_id}>
                            {e.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      disabled={!pickedEmployee[a.asset_id]}
                      onClick={() =>
                        void run(
                          () =>
                            call('POST', '/api/lakebase/assignments', {
                              asset_id: a.asset_id,
                              employee_id: pickedEmployee[a.asset_id],
                            }),
                          `Assigned ${a.asset_id}`,
                        )
                      }
                    >
                      Assign
                    </Button>
                  </span>
                )}
                {a.status === 'Assigned' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void run(
                        () => call('POST', '/api/lakebase/assignments/return', { asset_id: a.asset_id }),
                        `Returned ${a.asset_id}`,
                      )
                    }
                  >
                    Return
                  </Button>
                )}
                {a.status !== 'Assigned' && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (window.confirm(`Delete ${a.asset_id}?`)) {
                        void run(
                          () => call('DELETE', `/api/lakebase/assets/${a.asset_id}`),
                          `Deleted ${a.asset_id}`,
                        );
                      }
                    }}
                  >
                    Delete
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}