import { z } from 'zod'; // Data Validation Library
import type { Application, Request, Response } from 'express';

type Row = Record<string, unknown>; // keys-strings, value-unknown type(because ts check value before using, instead of "any")

interface Db { // What a db connection able to do
  query(text: string, params?: unknown[]): Promise<{ rows: Row[] }>;
}
interface TxClient extends Db { //db client used for transactions 
  release(): void;
}
interface AppKitWithLakebase { // Appkit environment expected by code
  lakebase: Db & { pool: { connect(): Promise<TxClient> } };
  server: { extend(fn: (app: Application) => void): void };
}

// ---------------------------------------------------------------------------
// 1. Schema: created on first start (skipped if it already exists)
// ---------------------------------------------------------------------------
const SETUP_SQL = [
  `CREATE SCHEMA IF NOT EXISTS app`,
  `CREATE TABLE IF NOT EXISTS app.employees (
     employee_id TEXT PRIMARY KEY,
     full_name   TEXT NOT NULL,
     department  TEXT NOT NULL,
     location    TEXT NOT NULL,
     is_active   BOOLEAN NOT NULL DEFAULT true
   )`,
  `CREATE TABLE IF NOT EXISTS app.assets (
     asset_id      TEXT PRIMARY KEY,
     asset_type    TEXT NOT NULL CHECK (asset_type IN ('Laptop','Monitor','Phone')),
     model         TEXT NOT NULL,
     purchase_date DATE,
     warranty_end  DATE,
     status        TEXT NOT NULL DEFAULT 'Available'
                   CHECK (status IN ('Available','Assigned','Repair','Retired'))
   )`,
  `CREATE TABLE IF NOT EXISTS app.asset_assignments (
     assignment_id SERIAL PRIMARY KEY,
     asset_id      TEXT NOT NULL REFERENCES app.assets(asset_id) ON DELETE RESTRICT,
     employee_id   TEXT NOT NULL REFERENCES app.employees(employee_id),
     action        TEXT NOT NULL CHECK (action IN ('Assign','Return')),
     action_date   DATE NOT NULL DEFAULT CURRENT_DATE,
     note          TEXT,
     updated_by    TEXT NOT NULL,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
];

// Same sample data as the Delta tables, loaded only when the table is empty.
const SEED_SQL = [
  `INSERT INTO app.employees VALUES
     ('E001','Asha Rao','Finance','Bengaluru',true),
     ('E002','Ravi Kumar','Sales','Chennai',true),
     ('E003','Meena Iyer','HR','Bengaluru',true),
     ('E004','John Paul','Sales','Chennai',false),
     ('E005','Divya Nair','IT','Bengaluru',true)`,
  `INSERT INTO app.assets VALUES
     ('A001','Laptop','Dell Latitude 5440','2024-02-10','2027-02-10','Assigned'),
     ('A002','Laptop','Dell Latitude 5440','2024-02-10','2027-02-10','Assigned'),
     ('A003','Laptop','HP EliteBook 840','2023-06-15','2026-12-15','Assigned'),
     ('A004','Laptop','Lenovo T14','2025-01-20','2028-01-20','Available'),
     ('A005','Monitor','Dell U2723','2023-09-01','2026-11-30','Assigned'),
     ('A006','Monitor','Dell U2723','2023-09-01','2026-11-30','Available'),
     ('A007','Phone','iPhone 14','2024-05-05','2026-05-05','Repair')`,
  `INSERT INTO app.asset_assignments (asset_id, employee_id, action, action_date, note, updated_by) VALUES
     ('A001','E001','Assign','2024-02-15','New joiner','priya'),
     ('A002','E002','Assign','2024-03-01','Sales laptop','priya'),
     ('A003','E004','Assign','2023-07-01','Sales laptop','priya'),
     ('A005','E003','Assign','2023-09-10','Desk setup','priya'),
     ('A006','E005','Assign','2024-01-10','Test monitor','priya'),
     ('A006','E005','Return','2025-06-01','Returned','priya')`,
];

// ---------------------------------------------------------------------------
// 2. Validation (zod): never trust the browser
// ---------------------------------------------------------------------------
const optionalDate = z.iso.date().nullable().optional();

const CreateAssetBody = z.object({
  asset_id: z.string().regex(/^A\d{3,}$/, 'Asset id must look like A008'),
  asset_type: z.enum(['Laptop', 'Monitor', 'Phone']),
  model: z.string().trim().min(1, 'Model is required'),
  purchase_date: optionalDate,
  warranty_end: optionalDate,
});

const UpdateAssetBody = z
  .object({
    model: z.string().trim().min(1),
    warranty_end: z.iso.date().nullable(),
    // 'Assigned' is deliberately missing: only an assignment can set it.
    status: z.enum(['Available', 'Repair', 'Retired']),
  })
  .partial() // makes field optional
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update'); // checks atleast one field is supplied

const AssignBody = z.object({
  asset_id: z.string().min(1),
  employee_id: z.string().min(1),
  note: z.string().trim().max(200).optional(),
});

const ReturnBody = z.object({
  asset_id: z.string().min(1),
  note: z.string().trim().max(200).optional(),
});

// ---------------------------------------------------------------------------
// 3. Helpers
// ---------------------------------------------------------------------------
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Who made the change. Databricks Apps forwards the signed-in user's email. */
function actor(req: Request): string {
  return req.header('x-forwarded-email') ?? 'local-dev';
}

/** Runs fn inside BEGIN / COMMIT. Any error rolls everything back. */
async function withTransaction<T>(
  appkit: AppKitWithLakebase,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  const client = await appkit.lakebase.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}


// Error-Handling Wrapper for API Routes
function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
      } else if (err instanceof z.ZodError) {
        res.status(400).json({ error: err.issues.map((i) => i.message).join('; ') });
      } else {
        console.error('[lakebase] request failed:', err);
        res.status(500).json({ error: 'Something went wrong' });
      }
    }
  };
}

//Instead of repeatedly writing all col names, code stores them once.
const ASSET_COLUMNS = `asset_id, asset_type, model, status,
  to_char(purchase_date, 'YYYY-MM-DD') AS purchase_date,
  to_char(warranty_end, 'YYYY-MM-DD') AS warranty_end`;

// ---------------------------------------------------------------------------
// 4. Setup + routes
// ---------------------------------------------------------------------------
export async function setupAssetRoutes(appkit: AppKitWithLakebase) {
  try {
    for (const stmt of SETUP_SQL) await appkit.lakebase.query(stmt);
    const { rows } = await appkit.lakebase.query('SELECT COUNT(*)::int AS n FROM app.assets');
    if (rows[0]?.n === 0) {
      for (const stmt of SEED_SQL) await appkit.lakebase.query(stmt);
      console.log('[lakebase] Created app schema and loaded sample data');
    }
  } catch (err) {
    console.warn('[lakebase] Setup failed:', (err as Error).message);
  }

  appkit.server.extend((app) => {
    // ---- READ (operational view, always current) ----
    app.get(
      '/api/lakebase/assets',
      handle(async (_req, res) => {
        const { rows } = await appkit.lakebase.query(
          `SELECT a.asset_id, a.asset_type, a.model, a.status,
                  to_char(a.purchase_date, 'YYYY-MM-DD') AS purchase_date,
                  to_char(a.warranty_end, 'YYYY-MM-DD') AS warranty_end,
                  h.employee_id, e.full_name AS holder
           FROM app.assets a
           LEFT JOIN LATERAL (
             SELECT x.employee_id, x.action FROM app.asset_assignments x
             WHERE x.asset_id = a.asset_id
             ORDER BY x.action_date DESC, x.assignment_id DESC LIMIT 1
           ) h ON h.action = 'Assign'
           LEFT JOIN app.employees e ON e.employee_id = h.employee_id
           ORDER BY a.asset_id`,
        );
        res.json(rows);
      }),
    );

    app.get(
      '/api/lakebase/employees',
      handle(async (_req, res) => {
        const { rows } = await appkit.lakebase.query(
          'SELECT employee_id, full_name, department FROM app.employees WHERE is_active ORDER BY full_name',
        );
        res.json(rows);
      }),
    );

    // ---- CREATE an asset ----
    app.post(
      '/api/lakebase/assets',
      handle(async (req, res) => {
        const b = CreateAssetBody.parse(req.body);
        try {
          const { rows } = await appkit.lakebase.query(
            `INSERT INTO app.assets (asset_id, asset_type, model, purchase_date, warranty_end)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING ${ASSET_COLUMNS}`,
            [b.asset_id, b.asset_type, b.model, b.purchase_date ?? null, b.warranty_end ?? null],
          );
          res.status(201).json(rows[0]);
        } catch (err) {
          if ((err as { code?: string }).code === '23505') {
            throw new HttpError(409, `Asset ${b.asset_id} already exists`);
          }
          throw err;
        }
      }),
    );

    // ---- UPDATE an asset ----
    app.patch(
      '/api/lakebase/assets/:id',
      handle(async (req, res) => {
        const b = UpdateAssetBody.parse(req.body);
        const sets: string[] = [];
        const params: unknown[] = [];
        // Fixed column names only; values always go through $n parameters.
        for (const col of ['model', 'warranty_end', 'status'] as const) {
          if (b[col] !== undefined) {
            params.push(b[col]);
            sets.push(`${col} = $${params.length}`);
          }
        }
        params.push(req.params.id);
        const { rows } = await appkit.lakebase.query(
          `UPDATE app.assets SET ${sets.join(', ')}
           WHERE asset_id = $${params.length} AND status <> 'Assigned'
           RETURNING ${ASSET_COLUMNS}`,
          params,
        );
        if (rows.length === 0) {
          throw new HttpError(409, 'Asset not found, or it is assigned (return it first)');
        }
        res.json(rows[0]);
      }),
    );

    // ---- DELETE an asset ----
    app.delete(
      '/api/lakebase/assets/:id',
      handle(async (req, res) => {
        try {
          const { rows } = await appkit.lakebase.query(
            `DELETE FROM app.assets WHERE asset_id = $1 AND status <> 'Assigned' RETURNING asset_id`,
            [req.params.id],
          );
          if (rows.length === 0) {
            throw new HttpError(409, 'Asset not found, or it is assigned (return it first)');
          }
          res.status(204).send();
        } catch (err) {
          if ((err as { code?: string }).code === '23503') {
            throw new HttpError(409, 'This asset has assignment history. Set it to Retired instead.');
          }
          throw err;
        }
      }),
    );

    // ---- ASSIGN: two writes that succeed or fail together ----
    app.post(
      '/api/lakebase/assignments',
      handle(async (req, res) => {
        const b = AssignBody.parse(req.body);
        const who = actor(req);
        const created = await withTransaction(appkit, async (tx) => {
          // FOR UPDATE locks the row, so two people cannot assign the same asset at once.
          const asset = await tx.query(
            'SELECT status FROM app.assets WHERE asset_id = $1 FOR UPDATE',
            [b.asset_id],
          );
          if (asset.rows.length === 0) throw new HttpError(404, 'Asset not found');
          if (asset.rows[0].status !== 'Available') {
            throw new HttpError(409, `Asset is ${String(asset.rows[0].status)}, not Available`);
          }
          const emp = await tx.query('SELECT is_active FROM app.employees WHERE employee_id = $1', [
            b.employee_id,
          ]);
          if (emp.rows.length === 0) throw new HttpError(404, 'Employee not found');
          if (!emp.rows[0].is_active) throw new HttpError(409, 'Employee is not active');

          const ins = await tx.query(
            `INSERT INTO app.asset_assignments (asset_id, employee_id, action, note, updated_by)
             VALUES ($1, $2, 'Assign', $3, $4)
             RETURNING assignment_id`,
            [b.asset_id, b.employee_id, b.note ?? null, who],
          );
          await tx.query(`UPDATE app.assets SET status = 'Assigned' WHERE asset_id = $1`, [
            b.asset_id,
          ]);
          return ins.rows[0];
        });
        res.status(201).json(created);
      }),
    );

    // ---- RETURN ----
    app.post(
      '/api/lakebase/assignments/return',
      handle(async (req, res) => {
        const b = ReturnBody.parse(req.body);
        const who = actor(req);
        const created = await withTransaction(appkit, async (tx) => {
          const asset = await tx.query(
            'SELECT status FROM app.assets WHERE asset_id = $1 FOR UPDATE',
            [b.asset_id],
          );
          if (asset.rows.length === 0) throw new HttpError(404, 'Asset not found');
          if (asset.rows[0].status !== 'Assigned') {
            throw new HttpError(409, 'Asset is not currently assigned');
          }
          const holder = await tx.query(
            `SELECT employee_id FROM app.asset_assignments
             WHERE asset_id = $1 ORDER BY action_date DESC, assignment_id DESC LIMIT 1`,
            [b.asset_id],
          );
          const ins = await tx.query(
            `INSERT INTO app.asset_assignments (asset_id, employee_id, action, note, updated_by)
             VALUES ($1, $2, 'Return', $3, $4)
             RETURNING assignment_id`,
            [b.asset_id, holder.rows[0].employee_id, b.note ?? 'Returned', who],
          );
          await tx.query(`UPDATE app.assets SET status = 'Available' WHERE asset_id = $1`, [
            b.asset_id,
          ]);
          return ins.rows[0];
        });
        res.status(201).json(created);
      }),
    );
  });
}