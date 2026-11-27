-- @param row_limit INT
SELECT asset_id, model, purchase_date, warranty_end
FROM workspace.it_capstone.assets
WHERE asset_type = 'Laptop'
  AND status = 'Available'
ORDER BY purchase_date
LIMIT :row_limit