-- @param asset_type STRING
-- @param status STRING
-- @param row_limit INT
SELECT asset_id, asset_type, model, status, purchase_date, warranty_end
FROM workspace.it_capstone.assets
WHERE (:asset_type = 'All' OR asset_type = :asset_type)
  AND (:status = 'All' OR status = :status)
ORDER BY asset_id
LIMIT :row_limit