export default [
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Please use src/config/env.ts instead of process.env directly.",
        },
      ],
    },
  },
];
