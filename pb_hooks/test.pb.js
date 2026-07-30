routerAdd("GET", "/api/hello-world", (e) => {
  return e.json(200, { message: "Hello from hooks!" });
});
