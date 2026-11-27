-- @param row_limit INT
SELECT asset_type, status, COUNT(*) AS asset_count
FROM workspace.it_capstone.assets
GROUP BY asset_type, status
ORDER BY asset_type, asset_count DESC
LIMIT :row_limit