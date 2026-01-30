# Multi-Employee Project Assignment Feature

## Overview
This feature allows managers to create a project and assign it to **multiple employees**. Once assigned, the project will appear in each assigned employee's project list, enabling collaboration on shared projects.

## Database Changes

### New Table: `project_assignments`
A many-to-many junction table that links employees to projects:

```sql
CREATE TABLE IF NOT EXISTS project_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  employee_id INT DEFAULT NULL,
  employee_code VARCHAR(10) DEFAULT NULL,
  role VARCHAR(80) DEFAULT 'Team Member',
  assigned_by INT DEFAULT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_assignment (project_id, employee_id)
);
```

This table is automatically created in `backend/src/server.js` when the application starts.

## Backend API Endpoints

### 1. Create Project with Multiple Employees
**POST** `/api/projects`

Request body:
```json
{
  "name": "Project Name",
  "customer": "Customer Name",
  "end_customer": "End Customer",
  "description": "Project Description",
  "priority": "medium",
  "start_date": "2024-01-29",
  "end_date": "2024-12-31",
  "budget": 50000,
  "assigned_employee": "EMP001",  // Single employee (backward compatible)
  "assigned_employees": ["EMP001", "EMP002", "EMP003"],  // Multiple employees
  "customer_person": "Contact Name",
  "customer_contact": "+91-XXXXXXXXXX",
  "customer_email": "email@example.com",
  "customer_address": "Address"
}
```

Response:
```json
{
  "success": true,
  "message": "Project created successfully",
  "project": {
    "id": 1,
    "name": "Project Name",
    "customer": "Customer Name",
    ...
  }
}
```

### 2. Assign Multiple Employees to Existing Project
**POST** `/api/projects/:projectId/assign-employees`

Request body:
```json
{
  "employee_ids": [1, 2, 3]  // Array of user IDs or employee codes
}
```

Response:
```json
{
  "success": true,
  "message": "Successfully assigned 3 employee(s)",
  "assigned_count": 3,
  "total_count": 3,
  "assigned_employees": [
    {
      "id": 1,
      "employee_id": "EMP001",
      "username": "john_doe",
      "status": "assigned"
    },
    ...
  ]
}
```

### 3. Remove Employee from Project
**POST** `/api/projects/:projectId/remove-employee/:employeeId`

Response:
```json
{
  "success": true,
  "message": "Employee removed from project",
  "deleted": true
}
```

### 4. Get Assigned Employees for Project
**GET** `/api/projects/:projectId/assigned-employees`

Response:
```json
{
  "success": true,
  "project_id": 1,
  "assigned_employees": [
    {
      "assignment_id": 5,
      "user_id": 1,
      "username": "john_doe",
      "employee_id": "EMP001",
      "email": "john@example.com",
      "role": "Team Member",
      "assigned_at": "2024-01-29T10:30:00Z"
    },
    ...
  ],
  "count": 3
}
```

### 5. List Projects (Updated)
**GET** `/api/projects`

Now returns projects where:
- User is a **Manager** (sees ALL projects)
- User **created** the project
- User is in **project_collaborators** table
- User is in **project_assignments** table (NEW)

## Frontend Components

### ProjectForm Component
Added new features to `frontend/src/components/ProjectForm.jsx`:

1. **Multiple Employee Assignment Input**
   - Text field to enter multiple employees
   - Comma-separated employee IDs/codes
   - Add button to include employees

2. **Assigned Employees List**
   - Visual display of assigned employees
   - Blue pill-shaped badges
   - Remove button (×) for each employee

3. **Form State**
   - `assigned_employees[]` - Array of employee IDs/codes
   - `employeeSearchInput` - Temporary input field value

### API Service Functions
Added to `frontend/src/services/api.js`:

```javascript
// Assign multiple employees to a project
assignEmployeesToProject(projectId, employee_ids)

// Remove employee from project
removeEmployeeFromProject(projectId, employeeId)

// Get assigned employees for a project
getAssignedEmployees(projectId)
```

## How It Works

### Project Creation Flow
1. Manager creates a new project
2. Manager enters project details (name, customer, dates, etc.)
3. Manager assigns **one** employee using the "Assign to Employee" field (backward compatible)
4. Manager assigns **multiple** employees using the "Assign Multiple Employees" section
5. On form submission:
   - Project is created
   - Single employee is added to `project_assignments` and `project_collaborators`
   - All employees in the array are added to both tables
6. Project appears in each assigned employee's project list

### Project Visibility Flow
When an employee logs in and views projects:
1. **Managers** see ALL projects
2. **Employees** see projects where:
   - They are the project creator, OR
   - They are in `project_assignments` table, OR
   - They are in `project_collaborators` table

## Usage Examples

### Example 1: Create Project with Multiple Employees
```javascript
const data = {
  name: "Website Redesign",
  customer: "ABC Corp",
  assigned_employees: ["EMP001", "EMP002", "EMP003"],
  description: "Complete website redesign and deployment"
};

const response = await createProject(data);
if (response.data.success) {
  // Project created and assigned to 3 employees
}
```

### Example 2: Assign Employees After Project Creation
```javascript
const projectId = 5;
const employeeIds = [1, 2, 3];  // User IDs

const response = await assignEmployeesToProject(projectId, employeeIds);
if (response.data.success) {
  console.log(`Assigned ${response.data.assigned_count} employees`);
}
```

### Example 3: Remove Employee from Project
```javascript
const projectId = 5;
const employeeId = 1;

const response = await removeEmployeeFromProject(projectId, employeeId);
if (response.data.success) {
  // Employee removed
}
```

### Example 4: Get All Assigned Employees
```javascript
const projectId = 5;

const response = await getAssignedEmployees(projectId);
console.log(response.data.assigned_employees);
// Shows all employees assigned to project
```

## Data Consistency

### Dual Table Strategy
- **`project_collaborators`**: Maintained for backward compatibility
- **`project_assignments`**: Used for new multi-employee assignment logic

Both tables are used in parallel:
- When assigning employees, both tables are updated
- When retrieving project list, both tables are checked
- This ensures:
  - Backward compatibility with existing code
  - Data consistency across the application

### Unique Constraints
The `project_assignments` table has a `UNIQUE KEY (project_id, employee_id)` to prevent:
- Duplicate assignments
- Data inconsistencies

## Frontend UI

### Creating a Project with Multiple Assignments
```
[Project Details Form]
├── Project Name: [text field]
├── Customer: [dropdown]
├── Assign to Employee: [single employee - backward compatible]
├── Assign Multiple Employees:
│   ├── Input: [comma-separated employee IDs]
│   └── Button: [Add]
└── Assigned Employees List:
    ├── [EMP001] ×
    ├── [EMP002] ×
    └── [EMP003] ×
```

## Testing Checklist

- [ ] Create a project with multiple employees assigned
- [ ] Verify project appears in each employee's project list
- [ ] Verify manager sees all projects
- [ ] Add employees to existing project
- [ ] Remove employee from project
- [ ] Edit project and modify assignments
- [ ] Verify `project_assignments` table is populated
- [ ] Verify `project_collaborators` table is populated
- [ ] Test with employee IDs and usernames
- [ ] Test with user IDs

## File Changes Summary

### Backend Files
- `backend/src/server.js` - Added `project_assignments` table creation
- `backend/src/routes/projects.js` - Updated endpoints:
  - POST `/api/projects` - Support multiple employees
  - GET `/api/projects` - Include `project_assignments` in filtering
  - POST `/api/projects/:projectId/assign-employees` - NEW
  - POST `/api/projects/:projectId/remove-employee/:employeeId` - NEW
  - GET `/api/projects/:projectId/assigned-employees` - NEW

### Frontend Files
- `frontend/src/services/api.js` - Added 3 new API functions
- `frontend/src/components/ProjectForm.jsx` - Added multiple employee assignment UI

## Backward Compatibility

✅ **Fully Backward Compatible**
- Existing `assigned_employee` field still works
- Can use either single or multiple assignment
- `project_collaborators` table still maintained
- Existing code continues to work

## Notes for Developers

1. **Employee Lookup**: The system looks up employees by:
   - User ID (integer)
   - Employee code/ID (string, e.g., "EMP001")
   - Username (string, e.g., "john_doe")

2. **Error Handling**: If an employee isn't found, they're skipped but won't cause the request to fail

3. **Permissions**: Only project creators and managers can:
   - Create projects with assignments
   - Assign employees to projects
   - Remove employees from projects

4. **Transactions**: All database operations use transactions to ensure data consistency

## Future Enhancements

1. **Role Management**: Assign different roles (Lead, Contributor, Viewer) to each employee
2. **Assignment History**: Track when employees were added/removed
3. **Bulk Operations**: Assign/remove multiple employees at once
4. **Employee Search**: Autocomplete dropdown for employee selection
5. **Assignment Email**: Send notification emails to assigned employees
