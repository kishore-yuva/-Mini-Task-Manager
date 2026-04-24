# Mini Task Manager - User Manual & Documentation

Welcome to **Mini Task Manager**, a sleek, professional workspace designed for efficient task tracking and productivity.

## 🚀 Getting Started

### 1. Authentication
- **Login:** Enter your email address on the landing page. 
- **No Password Required:** The system uses a seamless email-based authentication. If your account doesn't exist, it will be created automatically.
- **Persistence:** Your session is saved locally, so you won't need to log in every time you open the app on the same browser.

## 📋 Managing Tasks

### Creating a Task
1. Locate the **"New Task"** panel on the right side of the dashboard.
2. Enter your task title in the input field.
3. Select a status (Pending or Completed).
4. Click **"Create Task"** to add it to your workspace.

### Searching Tasks
- Use the **Search Bar** at the top of the "Active Tasks" panel to filter through your tasks by keywords. The list updates in real-time as you type.

### Editing a Task
1. Hover over any task or click on its title to enter **Edit Mode**.
2. The task will be highlighted with an indigo border.
3. Change the title and press **Enter** or click the **Checkmark (✔)** icon to save.
4. Press **Escape** or click the **X** icon to cancel changes.

### Completing Tasks
- Click the **Checkbox** icon to the left of any task title to toggle between "Pending" and "Completed". Your productivity health bar will update automatically.

### Deleting Tasks
- **Individual Delete:** Hover over a task and click the **Trash** icon that appears on the right.
- **Bulk Delete (Clear All):** Click the **"Clear All"** button in the Active Tasks header. 
  - *Safety Feature:* You must click twice (Confirm) to finalize the deletion of all tasks.

## 📊 Analytics & Health
- **Productivity Health:** The circular progress bar shows the percentage of tasks you've completed.
- **Task Distribution:** View how many tasks are pending vs. completed at a glance in the stats panel.

---

## 🛠 Technical Documentation

### Tech Stack
- **Frontend:** React 18, Vite, Tailwind CSS, Motion (framer-motion), Lucide React.
- **Backend:** Node.js, Express.
- **Database:** SQLite (Better-SQLite3) for persistent, lightweight storage.
- **Security:** JWT (JSON Web Tokens) for session management.

### API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/auth/login` | `POST` | Authenticates user via email (returns JWT). |
| `/api/tasks` | `GET` | Fetches all tasks for the authenticated user. |
| `/api/tasks` | `POST` | Creates a new task. |
| `/api/tasks/:id` | `PATCH` | Updates a specific task (title/status). |
| `/api/tasks/:id` | `DELETE` | Deletes a specific task. |
| `/api/tasks` | `DELETE` | Deletes all tasks for the current user. |

### Data Model (SQLite)
- **Users Table:** `id`, `email`, `createdAt`
- **Tasks Table:** `id`, `title`, `status`, `userId`, `createdAt`
