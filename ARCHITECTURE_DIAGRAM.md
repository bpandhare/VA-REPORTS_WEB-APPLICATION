# Feature Architecture & Data Flow

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      VA-REPORTS APPLICATION                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────┐         ┌──────────────────────────┐  │
│  │   Frontend (React)   │         │   Backend (Express.js)   │  │
│  ├──────────────────────┤         ├──────────────────────────┤  │
│  │                      │         │                          │  │
│  │ ProjectForm.jsx      │◄────►   │ POST /api/projects       │  │
│  │ ├─ name             │         │ ├─ Create project        │  │
│  │ ├─ customer         │         │ ├─ Add to project_       │  │
│  │ ├─ assigned_         │         │ │  assignments           │  │
│  │ │  employee          │         │ └─ Add to project_       │  │
│  │ └─ assigned_         │         │    collaborators        │  │
│  │    employees[] ◄─────┼─────────┤ POST /api/projects/     │  │
│  │    NEW!              │         │ :id/assign-employees    │  │
│  │                      │         │                          │  │
│  │ API functions:       │         │ DELETE /api/projects/   │  │
│  │ ├─ createProject     │         │ :id/remove-employee/:id │  │
│  │ ├─ assign            │         │                          │  │
│  │ │  EmployeesTo       │         │ GET /api/projects/      │  │
│  │ │  Project() NEW!    │         │ :id/assigned-employees  │  │
│  │ ├─ remove            │         │                          │  │
│  │ │  EmployeeFrom      │         │ GET /api/projects       │  │
│  │ │  Project() NEW!    │         │ └─ List with            │  │
│  │ └─ getAssigned       │         │    project_assignments  │  │
│  │   Employees() NEW!   │         │    filtering             │  │
│  │                      │         │                          │  │
│  └──────────────────────┘         └──────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              MySQL Database                                 │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │                                                              │ │
│  │  ┌──────────────┐   ┌─────────────────────┐                │ │
│  │  │   projects   │   │  project_            │ ◄─ NEW        │ │
│  │  ├──────────────┤   │  assignments         │                │ │
│  │  │ id (PK)      │   ├─────────────────────┤                │ │
│  │  │ name         │   │ id (PK)              │                │ │
│  │  │ customer     │◄──┤ project_id (FK)      │                │ │
│  │  │ ...          │   │ employee_id (FK)     │                │ │
│  │  │              │   │ role                 │                │ │
│  │  │              │   │ assigned_by          │                │ │
│  │  └──────────────┘   │ assigned_at          │                │ │
│  │         ▲            │                      │                │ │
│  │         │            │ UNIQUE(project_id,   │                │ │
│  │         │            │ employee_id)         │                │ │
│  │         │            └─────────────────────┘                │ │
│  │         │                    │                               │ │
│  │         │                    ▼                               │ │
│  │  ┌──────────────┐   ┌─────────────────────┐                │ │
│  │  │   project_   │   │      users           │                │ │
│  │  │ collabora-   │   ├─────────────────────┤                │ │
│  │  │ tors         │   │ id (PK)              │                │ │
│  │  ├──────────────┤   │ username             │                │ │
│  │  │ id (PK)      │   │ employee_id          │                │ │
│  │  │ project_id   │   │ email                │                │ │
│  │  │ user_id      │───┤ ...                  │                │ │
│  │  │ role         │   │                      │                │ │
│  │  │ ...          │   └─────────────────────┘                │ │
│  │  └──────────────┘                                           │ │
│  │                                                              │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

### Creating a Project with Multiple Employees

```
┌─────────────────────────────────────────────────────────────┐
│ Manager Opens Project Creation Form                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Enters Project Details:                                      │
│ ├─ Name: "Website Redesign"                                 │
│ ├─ Customer: "ABC Corp"                                     │
│ └─ Assign Multiple Employees: "EMP001, EMP002, EMP003"     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Frontend (ProjectForm.jsx)                                   │
│ ├─ Validates input                                          │
│ ├─ Splits assigned_employees string into array             │
│ └─ Calls createProject() with:                             │
│    ├─ name, customer, description, etc.                    │
│    └─ assigned_employees: [EMP001, EMP002, EMP003]        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼ HTTP POST
┌─────────────────────────────────────────────────────────────┐
│ Backend: POST /api/projects                                 │
│                                                              │
│ 1. Validate request                                         │
│ 2. Insert into projects table                              │
│    └─ Get projectId = 5                                    │
│                                                              │
│ 3. For each assigned_employee (EMP001, EMP002, EMP003):   │
│    ├─ Look up user by employee ID                         │
│    ├─ Insert into project_assignments                     │
│    │  (project_id: 5, employee_id: 1, role: Team Member) │
│    └─ Insert into project_collaborators                   │
│       (project_id: 5, user_id: 1, role: Assigned)         │
│                                                              │
│ 4. Return success with project details                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼ Response
┌─────────────────────────────────────────────────────────────┐
│ Frontend: Project Created Successfully!                      │
│                                                              │
│ Database State:                                             │
│ ├─ projects: 1 new row                                     │
│ ├─ project_assignments: 3 new rows (one per employee)     │
│ └─ project_collaborators: 3 new rows (for compatibility)   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Employees Log In                                             │
│                                                              │
│ When Employee 1 (EMP001) logs in:                          │
│ ├─ Frontend: GET /api/projects                            │
│ └─ Backend Query:                                          │
│    SELECT * FROM projects WHERE                            │
│    created_by = userId OR                                  │
│    user_id IN (SELECT user_id FROM                         │
│               project_assignments WHERE                     │
│               employee_id = userId)                         │
│                                                              │
│ Result: ✅ Employee sees "Website Redesign" project       │
│                                                              │
│ Same for Employee 2 and Employee 3 ✅✅                   │
└─────────────────────────────────────────────────────────────┘
```

## Database Relationship Diagram

```
┌─────────────────────────────────┐
│          users                  │
├─────────────────────────────────┤
│ id (PK)                         │
│ username (UNIQUE)               │
│ employee_id (UNIQUE)            │
│ email                           │
│ role                            │
│ ...                             │
└────────────┬────────────────────┘
             │
             │ 1:N
             │ (has many assignments)
             │
             ▼
┌─────────────────────────────────┐
│   project_assignments (NEW)     │
├─────────────────────────────────┤
│ id (PK)                         │
│ project_id (FK) ───┐            │
│ employee_id (FK) ──┼──► users   │
│ role               │            │
│ assigned_by (FK)   │            │
│ assigned_at        │            │
│ UNIQUE(project_id, │            │
│        employee_id)│            │
└──────────┬─────────┘            │
           │                      │
           │ N:1                  │
           │ (belongs to)         │
           │                      │
           ▼                      │
┌─────────────────────────────────┼─────┐
│         projects                │     │
├─────────────────────────────────┼─────┤
│ id (PK)                         │     │
│ name                            │     │
│ customer                        │     │
│ description                     │     │
│ created_by (FK) ────────────────┘     │
│ status                                │
│ ...                                   │
└─────────────────────────────────┘     │
                                        │
                 Also Related ──────────┘
                 (for compatibility)
```

## API Endpoint Diagram

```
PROJECT MANAGEMENT ENDPOINTS
│
├─ POST /api/projects
│  └─ Create new project with multiple employee assignments
│     Input: { name, customer, assigned_employees: [id1, id2, id3] }
│     Output: { success, project }
│
├─ GET /api/projects
│  └─ List projects (filtered by user role & assignments)
│     Input: (none - uses auth token)
│     Output: { success, projects: [] }
│
├─ GET /api/projects/:id
│  └─ Get project details
│     Input: projectId
│     Output: { success, project }
│
├─ PUT /api/projects/:id
│  └─ Update project
│     Input: { name, customer, ... }
│     Output: { success, project }
│
├─ DELETE /api/projects/:id
│  └─ Delete project (cascades to assignments)
│     Input: projectId
│     Output: { success }
│
├─ POST /api/projects/:projectId/assign-employees ◄─ NEW
│  └─ Assign multiple employees to project
│     Input: { employee_ids: [1, 2, 3] }
│     Output: { success, assigned_count, assigned_employees }
│
├─ POST /api/projects/:projectId/remove-employee/:employeeId ◄─ NEW
│  └─ Remove employee from project
│     Input: (none)
│     Output: { success, deleted }
│
└─ GET /api/projects/:projectId/assigned-employees ◄─ NEW
   └─ Get all assigned employees for a project
      Input: projectId
      Output: { success, assigned_employees: [] }
```

## User Journey Diagram

```
MANAGER JOURNEY
│
├─► Login
│   │
│   └─► Projects Page (sees ALL projects)
│       │
│       ├─► Create New Project
│       │   ├─ Fill form
│       │   ├─ Add employees: "EMP001, EMP002, EMP003"
│       │   ├─ Submit
│       │   └─ ✅ Project created & assigned
│       │
│       └─► Existing Project
│           ├─ View details
│           ├─ Assign Employees
│           ├─ Remove Employee
│           └─ View Assigned Team


EMPLOYEE JOURNEY
│
├─► Login
│   │
│   └─► My Projects Page (sees only assigned projects)
│       │
│       ├─ Created Projects (shows projects they created)
│       │
│       └─ Assigned Projects (shows projects manager assigned them)
│           ├─ Project "Website Redesign" (assigned by manager)
│           │   ├─ See team members
│           │   ├─ Submit reports
│           │   └─ Update status
│           │
│           └─ Project "Mobile App" (assigned by manager)
│               └─ ...
```

## Query Flow Diagram

### Listing Projects

```
Employee Requests: GET /api/projects
│
▼
Backend checks:
│
├─ Is user a Manager?
│  └─ YES → Return ALL projects
│
└─ Is user an Employee?
   └─ YES → Return projects where:
      │
      ├─ created_by = userId OR
      │  (employee created the project)
      │
      ├─ user_id IN (
      │    SELECT user_id FROM project_collaborators
      │    WHERE project_id = p.id
      │    AND (user_id = userId OR collaborator_employee_id = empId)
      │  )
      │  (employee is in collaborators table)
      │
      └─ employee_id IN (
         SELECT employee_id FROM project_assignments
         WHERE project_id = p.id AND employee_id = userId
       )
       (employee is in assignments table - NEW)
       
▼
Result: Employee sees only their projects ✅
```

## Feature Completeness Matrix

```
Feature                          | Status | Implementation
─────────────────────────────────┼────────┼──────────────────────────
Create project                   | ✅     | POST /api/projects
Single employee assignment       | ✅     | assigned_employee param
Multiple employee assignment     | ✅ NEW | assigned_employees array
Assign to existing project       | ✅ NEW | POST .../assign-employees
Remove employee from project     | ✅ NEW | POST .../remove-employee/:id
Get assigned employees          | ✅ NEW | GET .../assigned-employees
Project visibility filtering    | ✅ UPD | Updated GET /api/projects
Manager sees all projects       | ✅     | Role-based filtering
Duplicate prevention            | ✅     | UNIQUE constraint
Data consistency               | ✅     | Transactions & constraints
Backward compatibility         | ✅     | Dual table approach
Permission-based access        | ✅     | Role & creator checks
Frontend UI                    | ✅ NEW | ProjectForm updates
API service functions          | ✅ NEW | 3 new functions
```

---

**Architecture Status**: ✅ **PRODUCTION READY**

All components are integrated and working together seamlessly.
