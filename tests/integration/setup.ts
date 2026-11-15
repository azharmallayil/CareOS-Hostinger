export default async function setup() {
  // Global integration test setup (runs once before all integration tests)
  process.env["NODE_ENV"] = "test";
  process.env["PORT"] = "3001";
  process.env["API_PORT"] = "3001";
  process.env["LOG_LEVEL"] = "silent";
}
