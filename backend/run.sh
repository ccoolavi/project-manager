#!/bin/bash
source ../venv/bin/activate
cd /home/ubuntu/projects/project_manager/backend
exec uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1
