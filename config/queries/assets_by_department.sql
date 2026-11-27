-- @param row_limit INT
SELECT e.department, COUNT(h.asset_id) AS assets_held
FROM workspace.it_capstone.employees e
LEFT JOIN workspace.it_capstone.v_current_holdings h
  ON h.employee_id = e.employee_id
GROUP BY e.department
ORDER BY assets_held DESC
LIMIT :row_limit