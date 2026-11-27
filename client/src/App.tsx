import { useMemo, useState } from "react";
import {
  BarChart,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useAnalyticsQuery,
} from "@databricks/appkit-ui/react";
import { sql } from "@databricks/appkit-ui/js";
import { AuthDemo } from "./components/AuthDemo";
import { ResultTable } from "./components/ResultTable";
import { ManageAssets } from "./components/AssignmentManager";
import { AiSummary } from "./components/AiSummary";
import { ASSET_TYPES, STATUSES } from "./lib/types";

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

export default function App() {
  // Filters. These become the :named SQL parameters.
  const [assetType, setAssetType] = useState<string>("All");
  const [status, setStatus] = useState<string>("All");
  const [rowLimit, setRowLimit] = useState<number>(100);
  const [sliderValue, setSliderValue] = useState<number>(100);

  // Parameters must be memoized: a query re-runs whenever this object changes.
  const assetParams = useMemo(
    () => ({
      asset_type: sql.string(assetType),
      status: sql.string(status),
      row_limit: sql.number(rowLimit),
    }),
    [assetType, status, rowLimit],
  );
  const holderParams = useMemo(
    () => ({
      asset_type: sql.string(assetType),
      row_limit: sql.number(rowLimit),
    }),
    [assetType, rowLimit],
  );
  const deptParams = useMemo(() => ({ row_limit: sql.number(50) }), []);
  const recoverParams = useMemo(() => ({ row_limit: sql.number(100) }), []);

  // One hook per file in config/queries/. The key is the file name without .sql
  const assets = useAnalyticsQuery("assets_list", assetParams);
  const holders = useAnalyticsQuery("current_holders", holderParams);
  const depts = useAnalyticsQuery("assets_by_department", deptParams);
  const recover = useAnalyticsQuery("inactive_holders", recoverParams);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b px-6 py-4">
        <h1 className="text-2xl font-bold">💻 IT Asset Tracker</h1>
        <p className="text-sm text-muted-foreground">
          Live Unity Catalog data · workspace.it_capstone
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[16rem_1fr] gap-6 p-6 max-w-7xl mx-auto">
        <aside className="space-y-4">
          <h2 className="font-semibold">Filters</h2>
          <FilterSelect
            id="asset-type"
            label="Asset type"
            value={assetType}
            options={ASSET_TYPES}
            onChange={setAssetType}
          />
          <FilterSelect
            id="status"
            label="Status"
            value={status}
            options={STATUSES}
            onChange={setStatus}
          />
          <div className="space-y-2">
            <Label>Max rows: {sliderValue}</Label>
            <Slider
              min={10}
              max={500}
              step={10}
              value={[sliderValue]}
              onValueChange={(v) => setSliderValue(v[0])}
              onValueCommit={(v) => setRowLimit(v[0])}
            />
          </div>
        </aside>

        <main className="space-y-6 min-w-0">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Metric label="Assets shown" value={assets.data?.length ?? "…"} />
            <Metric
              label="Currently held"
              value={holders.data?.length ?? "…"}
            />
            <Metric label="Departments" value={depts.data?.length ?? "…"} />
            <Metric label="To recover" value={recover.data?.length ?? "…"} />
          </div>

          <Tabs defaultValue="assets">
            <TabsList>
              <TabsTrigger value="assets">Assets</TabsTrigger>
              <TabsTrigger value="holders">Who holds what</TabsTrigger>
              <TabsTrigger value="departments">By department</TabsTrigger>
              <TabsTrigger value="recover">To recover</TabsTrigger>
              <TabsTrigger value="auth">Auth demo</TabsTrigger>
              <TabsTrigger value="manage">Manage</TabsTrigger>
              <TabsTrigger value="ai">AI</TabsTrigger>
            </TabsList>

            <TabsContent value="assets">
              <ResultTable
                rows={assets.data}
                loading={assets.loading}
                error={assets.error}
                emptyMessage="No assets match these filters."
              />
            </TabsContent>
            <TabsContent value="holders">
              <ResultTable
                rows={holders.data}
                loading={holders.loading}
                error={holders.error}
              />
            </TabsContent>
            <TabsContent value="departments" className="space-y-4">
              <div className="h-64">
                <BarChart
                  queryKey="assets_by_department"
                  parameters={deptParams}
                  xKey="department"
                  yKey="assets_held"
                />
              </div>
              <ResultTable
                rows={depts.data}
                loading={depts.loading}
                error={depts.error}
              />
            </TabsContent>
            <TabsContent value="recover">
              <ResultTable
                rows={recover.data}
                loading={recover.loading}
                error={recover.error}
                emptyMessage="Nothing to recover: no inactive employee holds an asset."
              />
            </TabsContent>
            <TabsContent value="auth">
              <AuthDemo />
            </TabsContent>
            <TabsContent value="manage">
              <ManageAssets />
            </TabsContent>
            <TabsContent value="ai" className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Summarises the assets shown in the Assets tab (uses the current
                filters).
              </p>
              <AiSummary rows={(assets.data ?? []).slice(0, 50)} />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}
