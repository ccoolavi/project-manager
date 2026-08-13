# 🚀 KaizenPM Quick Start Guide

## 📱 Live Application

**👉 [Open KaizenPM Now](https://avishkarsolat.github.io/project-manager/)**

---

## 🔧 Setup (First Time)

### Option 1: Run Locally (Development)

#### Prerequisites
- Python 3.12+
- Node.js 18+
- Git

#### Backend Setup
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --reload
# Opens http://localhost:8000
```

#### Frontend Setup (in another terminal)
```bash
cd frontend
npm install
npm run dev
# Opens http://localhost:3000
```

---

## 📝 First Time User Flow

### 1. Register
- Go to https://avishkarsolat.github.io/project-manager/
- Click "Sign up"
- Fill in name, email, password (8+ chars)
- Click "Sign Up" → Auto-login to dashboard

### 2. Create Organization
- On dashboard, click "Create Organization"
- Enter org name (e.g., "My Team")
- Dashboard loads with your org

### 3. Invite Team Members
- Click "Add Member" in top nav
- Enter team member's email
- Select role (admin, editor, viewer, member)
- They receive email invite (when SMTP configured)

### 4. Create Projects
- Click "Projects" in sidebar
- Click "New Project"
- Enter project name
- Add sub-projects for organization

### 5. Track Tasks
- Click "Tasks" in sidebar
- Click "New Task"
- Add title, description, priority, due date
- Assign to team member

### 6. Track Habits
- Click "Habits" in sidebar
- Add daily/weekly habits
- Check off completed habits daily
- Watch your streak grow!

---

## 🔑 API Examples

### Register User
```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "confirm_password": "password123"
  }'
```

### Login
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
# Returns: { "access_token": "...", "user": {...} }
```

### List Organizations
```bash
curl -X GET http://localhost:8000/api/orgs \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Create Task
```bash
curl -X POST http://localhost:8000/api/orgs/1/projects/1/tasks/1 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Build feature X",
    "priority": "high",
    "status": "todo"
  }'
```

---

## 🧪 Testing Commands

### Test Backend API
```bash
# Health check
curl http://localhost:8000/api/health

# View API docs (FastAPI auto-generates Swagger UI)
# Open http://localhost:8000/docs in browser
```

### Test Frontend Build
```bash
npm run build
npm run preview
# Opens built app on http://localhost:4173
```

---

## 🌐 Environment Configuration

### Backend (.env file)
```env
DATABASE_URL=sqlite:///./kaizenpm.db
SECRET_KEY=your-secret-key-here
FRONTEND_URL=http://localhost:3000  # Dev: http://localhost:3000
                                    # Prod: https://avishkarsolat.github.io/project-manager/
ENVIRONMENT=development
DEBUG=true
```

### Frontend (.env.local file)
```env
VITE_API_URL=http://localhost:8000  # Dev: http://localhost:8000
                                    # Prod: https://your-backend-url
VITE_APP_NAME=KaizenPM
```

---

## 📊 Database

### View SQLite Data
```bash
# Install sqlite3 CLI if needed
# Linux/Mac: brew install sqlite3
# Windows: Download from https://www.sqlite.org/download.html

# Connect to database
sqlite3 backend/kaizenpm.db

# View tables
.tables

# View users
SELECT id, email, name FROM users;

# View organizations
SELECT id, name, owner_id FROM organizations;
```

---

## 🔐 User Roles & Permissions

| Role | Create Tasks | Create Projects | Manage Members | Delete Org |
|------|-------------|-----------------|---|---|
| Owner | ✅ | ✅ | ✅ | ✅ |
| Admin | ✅ | ✅ | ✅ | ❌ |
| Editor | ✅ | ❌ | ❌ | ❌ |
| Viewer | ❌ | ❌ | ❌ | ❌ |
| Member | ✅ | ❌ | ❌ | ❌ |

---

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check if port 8000 is in use
lsof -i :8000  # Kill with: kill -9 <PID>

# Activate venv
source backend/venv/bin/activate

# Check dependencies
pip list | grep fastapi
```

### Frontend build fails
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Vite cache
rm -rf node_modules/.vite
npm run build
```

### Login fails
- Check .env file has correct FRONTEND_URL
- Verify backend API is running on port 8000
- Clear localStorage: `localStorage.clear()` in browser console

---

## 📚 Documentation

- **API Docs**: http://localhost:8000/docs (interactive Swagger UI)
- **Code Comments**: Check source files for inline documentation
- **Architecture**: See DEPLOYMENT.md for detailed architecture
- **Database Schema**: See backend/models.py for SQLAlchemy models

---

## 🚀 Deployment

### Deploy Backend to Production
```bash
# Using systemd (Linux)
sudo systemctl enable kaizenpm-backend
sudo systemctl start kaizenpm-backend

# Using Docker (recommended)
docker build -t kaizenpm-backend .
docker run -d -p 8000:8000 kaizenpm-backend
```

### Deploy Frontend to GitHub Pages
```bash
# Already deployed! Visit:
# https://avishkarsolat.github.io/project-manager/

# To redeploy after changes:
npm run build
git subtree push --prefix frontend/dist origin gh-pages
```

---

## 📞 Support

- **Issues**: Check GitHub issues
- **Questions**: Review DEPLOYMENT.md and source code
- **Feedback**: Create GitHub issue

---

**Happy using KaizenPM! 🎉**
