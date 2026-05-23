/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-db-in-routes",
      comment: "Routes should not access the database directly. Use domains/services.",
      severity: "error",
      from: { path: "^src/routes/.*\\.ts$" },
      to: { path: ".*@workspace/db.*" },
    },
    {
      name: "no-cross-domain",
      comment: "Domains should be isolated and not import from each other directly.",
      severity: "error",
      from: { path: "^src/domains/([^/]+)/" },
      to: {
        path: "^src/domains/([^/]+)/",
        pathNot: "^src/domains/$1/",
      },
    },
    {
      name: "no-circular",
      comment: "This project has no circular dependencies.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
  },
};
