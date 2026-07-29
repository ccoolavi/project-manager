migrate((app) => {
  // 1. Update 'users' collection schema
  const usersCol = app.findCollectionByNameOrId("users");
  
  // Add phone, whatsapp_verified, otp_code, and role fields if missing
  try {
    usersCol.fields.add(new Field({
      name: "phone",
      type: "text",
      required: false,
      presentable: true,
    }));
  } catch (e) {}

  try {
    usersCol.fields.add(new Field({
      name: "whatsapp_verified",
      type: "bool",
      required: false,
    }));
  } catch (e) {}

  try {
    usersCol.fields.add(new Field({
      name: "otp_code",
      type: "text",
      required: false,
    }));
  } catch (e) {}

  try {
    usersCol.fields.add(new Field({
      name: "role",
      type: "select",
      values: ["admin", "user"],
      maxSelect: 1,
      required: false,
    }));
  } catch (e) {}

  app.save(usersCol);

  // 2. Projects Collection
  try {
    app.findCollectionByNameOrId("projects");
  } catch (e) {
    const projects = new Collection({
      name: "projects",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != '' && user = @request.auth.id",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "name", type: "text", required: true },
        { name: "description", type: "text" },
        { name: "status", type: "select", values: ["active", "in_progress", "completed", "archived"] },
        { name: "color", type: "text" },
        { name: "user", type: "relation", collectionId: usersCol.id, cascadeDelete: true, required: true }
      ]
    });
    app.save(projects);
  }

  // 3. Kanban Boards / Tasks Collection
  try {
    app.findCollectionByNameOrId("kanban_boards");
  } catch (e) {
    const kanban = new Collection({
      name: "kanban_boards",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != '' && user = @request.auth.id",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "description", type: "text" },
        { name: "status", type: "select", values: ["todo", "in_progress", "review", "done"] },
        { name: "priority", type: "select", values: ["low", "medium", "high"] },
        { name: "due_date", type: "text" },
        { name: "project", type: "relation", collectionId: app.findCollectionByNameOrId("projects").id },
        { name: "user", type: "relation", collectionId: usersCol.id, cascadeDelete: true, required: true }
      ]
    });
    app.save(kanban);
  }

  // 4. Habits Collection
  try {
    app.findCollectionByNameOrId("habits");
  } catch (e) {
    const habits = new Collection({
      name: "habits",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != '' && user = @request.auth.id",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "description", type: "text" },
        { name: "frequency", type: "select", values: ["daily", "weekly"] },
        { name: "target_days", type: "number" },
        { name: "streak", type: "number" },
        { name: "completed_dates", type: "json" },
        { name: "category", type: "text" },
        { name: "user", type: "relation", collectionId: usersCol.id, cascadeDelete: true, required: true }
      ]
    });
    app.save(habits);
  }

  // 5. Kaizen Logs Collection
  try {
    app.findCollectionByNameOrId("kaizen_logs");
  } catch (e) {
    const kaizen = new Collection({
      name: "kaizen_logs",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != '' && user = @request.auth.id",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "reflection", type: "text" },
        { name: "action_item", type: "text" },
        { name: "category", type: "select", values: ["productivity", "mindset", "workflow", "health"] },
        { name: "status", type: "select", values: ["planned", "in_progress", "completed"] },
        { name: "date", type: "text" },
        { name: "user", type: "relation", collectionId: usersCol.id, cascadeDelete: true, required: true }
      ]
    });
    app.save(kaizen);
  }

  // 6. Time Logs Collection
  try {
    app.findCollectionByNameOrId("time_logs");
  } catch (e) {
    const timeLogs = new Collection({
      name: "time_logs",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != '' && user = @request.auth.id",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "task_name", type: "text", required: true },
        { name: "duration_minutes", type: "number", required: true },
        { name: "date", type: "text" },
        { name: "category", type: "text" },
        { name: "project", type: "relation", collectionId: app.findCollectionByNameOrId("projects").id },
        { name: "user", type: "relation", collectionId: usersCol.id, cascadeDelete: true, required: true }
      ]
    });
    app.save(timeLogs);
  }
}, (app) => {
  // Rollback
});
