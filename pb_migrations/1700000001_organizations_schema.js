migrate((app) => {
  const usersCol = app.findCollectionByNameOrId("users");

  // 1. Organizations Collection
  let orgsCol;
  try {
    orgsCol = app.findCollectionByNameOrId("organizations");
  } catch (e) {
    orgsCol = new Collection({
      name: "organizations",
      type: "base",
      listRule: "owner = @request.auth.id",
      viewRule: "owner = @request.auth.id",
      createRule: "@request.auth.id != '' && owner = @request.auth.id",
      updateRule: "owner = @request.auth.id",
      deleteRule: "owner = @request.auth.id",
      fields: [
        { name: "name", type: "text", required: true },
        { name: "description", type: "text" },
        { name: "owner", type: "relation", collectionId: usersCol.id, cascadeDelete: true, required: true }
      ]
    });
    app.save(orgsCol);
  }

  // 2. Organization Members Collection
  try {
    app.findCollectionByNameOrId("organization_members");
  } catch (e) {
    const orgMembers = new Collection({
      name: "organization_members",
      type: "base",
      listRule: "@request.auth.id = user.id || @request.auth.id = organization.owner.id",
      viewRule: "@request.auth.id = user.id || @request.auth.id = organization.owner.id",
      createRule: "@request.auth.id = user.id",
      updateRule: "@request.auth.id = user.id || @request.auth.id = organization.owner.id",
      deleteRule: "@request.auth.id = user.id || @request.auth.id = organization.owner.id",
      fields: [
        { name: "user", type: "relation", collectionId: usersCol.id, cascadeDelete: true, required: true },
        { name: "organization", type: "relation", collectionId: orgsCol.id, cascadeDelete: true, required: true },
        { name: "role", type: "select", values: ["admin", "member"], required: true }
      ]
    });
    app.save(orgMembers);
  }

  // 3. Modify Projects Collection (add organization relation)
  const projectsCol = app.findCollectionByNameOrId("projects");
  try {
    projectsCol.fields.add(new Field({
      name: "organization",
      type: "relation",
      collectionId: orgsCol.id,
      required: true
    }));
    app.save(projectsCol);
  } catch (e) {}

  // 4. SubProjects Collection
  let subProjectsCol;
  try {
    subProjectsCol = app.findCollectionByNameOrId("sub_projects");
  } catch (e) {
    subProjectsCol = new Collection({
      name: "sub_projects",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != '' && user = @request.auth.id",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "name", type: "text", required: true },
        { name: "description", type: "text" },
        { name: "project", type: "relation", collectionId: projectsCol.id, cascadeDelete: true, required: true },
        { name: "status", type: "select", values: ["active", "in_progress", "completed", "archived"] },
        { name: "user", type: "relation", collectionId: usersCol.id, cascadeDelete: true, required: true }
      ]
    });
    app.save(subProjectsCol);
  }

  // 5. Tasks Collection
  try {
    app.findCollectionByNameOrId("tasks");
  } catch (e) {
    const tasks = new Collection({
      name: "tasks",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != '' && user = @request.auth.id",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "description", type: "text" },
        { name: "sub_project", type: "relation", collectionId: subProjectsCol.id, cascadeDelete: true, required: true },
        { name: "status", type: "select", values: ["todo", "in_progress", "review", "done"] },
        { name: "priority", type: "select", values: ["low", "medium", "high", "urgent"] },
        { name: "assignee", type: "relation", collectionId: usersCol.id },
        { name: "due_date", type: "text" },
        { name: "user", type: "relation", collectionId: usersCol.id, cascadeDelete: true, required: true }
      ]
    });
    app.save(tasks);
  }
}, (app) => {
  // Rollback
});
