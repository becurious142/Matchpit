/**
 * Preload script to set DATABASE_URL from TEST_DATABASE_URL before any imports
 */
if (process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

// Also set for imports that might check it
if (!process.env.DATABASE_URL) {
  // Provide a placeholder to prevent the error during test file loading
  // Tests will fail with connection error if no real DB is provided
  process.env.DATABASE_URL = "postgres://placeholder";
}

export {};
