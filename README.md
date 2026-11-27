# IT Asset Allocation Tracker (AppKit)

A web app that tracks company IT assets: what we own, who holds what, and what is available.
Built with Databricks AppKit (Node.js, React, TypeScript) on Databricks Free Edition.

## Tech Stack

- **Backend**: Node.js, Express
- **Frontend**: React.js, TypeScript, Vite, Tailwind CSS, React Router
- **UI Components**: Radix UI, shadcn/ui
- **Databricks**: AppKit SDK

## Session 11: Read-only app on Delta

Ported my Streamlit app to AppKit.

- **Data:** Unity Catalog schema `workspace.it_capstone` (employees, assets, asset_assignments, view `v_current_holdings`).
- **Queries:** each Week 2 query is a file in `config/queries/*.sql`. The file name is the query name.
- **Tabs:** Assets, Who holds what, By department, To recover, Auth demo.
- **Filters:** asset type, status, max rows (passed as `:named` SQL parameters).
- **Identity:** the app reads as its service principal. `employees.obo.sql` runs as the signed-in user to show the difference.
- **Setup:** the service principal needs `USE CATALOG`, `USE SCHEMA` and `SELECT` on the schema.

## Session 12: Write path on Lakebase

Added create, update and delete. **Analytics stay in Delta. Writes go to Lakebase** (managed Postgres).

- **Resource:** Lakebase `postgres` resource in `databricks.yml`; `LAKEBASE_ENDPOINT` in `app.yaml`.
- **Code:** `server/routes/assets.ts` (API) and `client/src/components/ManageAssets.tsx` (Manage tab).
- **Tables:** `app.employees`, `app.assets`, `app.asset_assignments`. Created automatically on first start, with sample data.

| Action | Endpoint |
|---|---|
| List assets / employees | `GET /api/lakebase/assets`, `GET /api/lakebase/employees` |
| Add asset | `POST /api/lakebase/assets` |
| Edit asset | `PATCH /api/lakebase/assets/:id` |
| Delete asset | `DELETE /api/lakebase/assets/:id` |
| Assign / Return | `POST /api/lakebase/assignments`, `POST /api/lakebase/assignments/return |


## Run locally

```
pnpm install
pnpm dev
```
`.env` needs `DATABRICKS_CONFIG_PROFILE`, `DATABRICKS_WAREHOUSE_ID`, and the Lakebase settings
(`LAKEBASE_ENDPOINT`, `PGHOST`, `PGDATABASE=databricks_postgres`, `PGSSLMODE=require`).

## Deploy

```
databricks apps deploy --profile freeedition
databricks apps logs it-asset-tracker --profile freeedition
```
Both the SQL warehouse and Lakebase resources must be in `databricks.yml`, or a deploy removes them.

## Limitations

- Delta tabs do not show Lakebase writes. There is no sync yet, so a new asset appears in Manage only.
- Writes run as the app's service principal, not per user.
- Lakebase can be slow on the first request after idle (scale to zero).
- Seed data exists in both Delta and Lakebase.

## Session 13: AI integration
- Feature: AI inventory summary (AI tab).
- Model: databricks-meta-llama-3-3-70b-instruct (Foundation Model API), declared as the
  `serving-endpoint` app resource with CAN_QUERY; name passed via DATABRICKS_SERVING_ENDPOINT_NAME.
- Flow: button → POST /api/ai/summary → serving() plugin → model → summary.
- Handling: 30 s timeout (504), empty answer message, generic error (502); details only in server logs.


