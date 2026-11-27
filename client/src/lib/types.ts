export interface AssetRow {
  asset_id: string;
  asset_type: string;
  model: string;
  status: string;
  purchase_date: string;
  warranty_end: string;
}

export interface HolderRow {
  asset_id: string;
  asset_type: string;
  model: string;
  full_name: string;
  department: string;
  assigned_on: string;
}

export interface DepartmentRow {
  department: string;
  assets_held: number;
}

export interface InactiveHolderRow {
  asset_id: string;
  model: string;
  full_name: string;
  department: string;
  assigned_on: string;
}

export interface EmployeeRow {
  employee_id: string;
  full_name: string;
  department: string;
  location: string;
  running_as: string;
}

// ---- Lakebase (writable) records ----
export interface ManagedAsset {
  asset_id: string;
  asset_type: string;
  model: string;
  status: string;
  purchase_date: string | null;
  warranty_end: string | null;
  employee_id: string | null;
  holder: string | null;
}

export interface ActiveEmployee {
  employee_id: string;
  full_name: string;
  department: string;
}

export const ASSET_TYPES = ['All', 'Laptop', 'Monitor', 'Phone'] as const;
export const STATUSES = ['All', 'Available', 'Assigned', 'Repair', 'Retired'] as const;