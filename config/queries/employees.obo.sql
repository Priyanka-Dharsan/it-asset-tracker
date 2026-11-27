-- @param row_limit INT
SELECT employee_id, full_name, department, location, current_user() AS running_as
FROM workspace.it_capstone.employees
ORDER BY employee_id
LIMIT :row_limit


-- Why the .obo in the last file name? 
-- A normal .sql file runs as the app’s service principal. 
-- A .obo.sql file runs as the signed-in user, so row filters apply per person.