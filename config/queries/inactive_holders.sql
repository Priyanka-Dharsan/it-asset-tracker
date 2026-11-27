-- @param row_limit INT
SELECT a.asset_id, a.model, e.full_name, e.department,
       h.action_date AS assigned_on
FROM workspace.it_capstone.v_current_holdings h
JOIN workspace.it_capstone.assets a ON a.asset_id = h.asset_id
JOIN workspace.it_capstone.employees e ON e.employee_id = h.employee_id
WHERE e.is_active = false
ORDER BY h.action_date
LIMIT :row_limit