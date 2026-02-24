export default [
  {
    files: ["js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        document: "readonly",
        window: "readonly",
        console: "readonly",
        localStorage: "readonly",
        Chart: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        // Browser globals
        requestAnimationFrame: "readonly",
        performance: "readonly",
        Worker: "readonly",
        self: "readonly",
        // Project-specific globals
        saveSettings: "readonly",
        updateHeaderWidths: "readonly",
        renderColumnDropdown: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
      "no-undef": "error"
    }
  }
];
