-- @param asset_type STRING
-- @param row_limit INT
SELECT a.asset_id, a.asset_type, a.model, e.full_name, e.department,
       h.action_date AS assigned_on
FROM workspace.it_capstone.v_current_holdings h
JOIN workspace.it_capstone.assets a ON a.asset_id = h.asset_id
JOIN workspace.it_capstone.employees e ON e.employee_id = h.employee_id
WHERE (:asset_type = 'All' OR a.asset_type = :asset_type)
ORDER BY e.full_name
LIMIT :row_limit