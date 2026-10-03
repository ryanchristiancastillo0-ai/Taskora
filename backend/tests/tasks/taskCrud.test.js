"use strict";

/**
 * /api/tasks — create, read, update, delete.
 *
 * Split in two on purpose:
 *
 *   - One `it` per endpoint, so a failure names the operation that broke.
 *   - One workflow test that walks create → read → update → delete, threading
 *     the id from each response into the next request. No id is hardcoded,
 *     because a hardcoded id only ever proves the store happens to contain it.
 *
 * Everything goes through the real TaskService, including the Redis-backed
 * CacheService. That is deliberate: TaskService.list() caches per user and
 * invalidates on write, so the "list after create" assertions below only pass
 * if cache invalidation actually works.
 */

const { app, request, db, resetState, createUser } = require("../support/harness");

beforeEach(resetState);

/** Creates an owner and returns their agent. */
function owner() {
  return createUser();
}

describe("POST /api/tasks", () => {
  it("should create a task and return it with an id", async () => {
    const { agent, user } = await owner();

    const response = await agent
      .post("/api/tasks")
      .send({ title: "Write the integration report", priority: "HIGH" });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    const { task } = response.body.data;
    expect(task.id).toEqual(expect.any(String));
    expect(task.title).toBe("Write the integration report");
    expect(task.priority).toBe("HIGH");
    // Schema defaults, applied by the database rather than the controller.
    expect(task.status).toBe("TODO");
    // Ownership is taken from the token, never from the body.
    expect(task.userId).toBe(user.id);
  });

  it("should reject a userId supplied in the body rather than let it pass through", async () => {
    const { agent, user } = await owner();
    const other = await owner();

    const response = await agent
      .post("/api/tasks")
      .send({ title: "Not theirs", userId: other.user.id });

    // createTaskSchema is .strict(), so an unexpected key is a 400 rather than a
    // silently dropped field. Either way the task can never be created on
    // someone else's behalf: ownership is set from the token in the controller.
    expect(response.status).toBe(400);

    const retried = await agent.post("/api/tasks").send({ title: "Not theirs" });
    expect(retried.status).toBe(201);
    expect(retried.body.data.task.userId).toBe(user.id);
  });

  it("should reject a task with no title with 400", async () => {
    const { agent } = await owner();

    const response = await agent.post("/api/tasks").send({ priority: "HIGH" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation failed");
    expect(response.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "title" })])
    );
  });

  it("should reject an unknown priority with 400", async () => {
    const { agent } = await owner();

    const response = await agent.post("/api/tasks").send({ title: "Bad", priority: "SUPER_URGENT" });

    expect(response.status).toBe(400);
  });

  it("should set completedAt when created directly as COMPLETED", async () => {
    const { agent } = await owner();

    const response = await agent
      .post("/api/tasks")
      .send({ title: "Already done", status: "COMPLETED" });

    expect(response.status).toBe(201);
    expect(response.body.data.task.completedAt).not.toBeNull();
  });

  it("should reject a project that belongs to someone else with 404", async () => {
    const { agent } = await owner();
    const stranger = await owner();
    const project = db.seed("project", { userId: stranger.user.id, name: "Theirs" });

    const response = await agent
      .post("/api/tasks")
      .send({ title: "Intruding", projectId: project.id });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Project not found");
  });
});

describe("GET /api/tasks", () => {
  it("should return only the caller's own tasks", async () => {
    const me = await owner();
    const stranger = await owner();

    await me.agent.post("/api/tasks").send({ title: "Mine" });
    await stranger.agent.post("/api/tasks").send({ title: "Theirs" });

    const response = await me.agent.get("/api/tasks");

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].title).toBe("Mine");
  });

  it("should report pagination metadata in the shared shape", async () => {
    const { agent } = await owner();
    for (let index = 0; index < 3; index += 1) {
      await agent.post("/api/tasks").send({ title: `Task ${index}` });
    }

    const response = await agent.get("/api/tasks?page=1&limit=2");

    expect(response.body.data.items).toHaveLength(2);
    expect(response.body.data.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
  });

  it("should return a different page rather than repeating the first", async () => {
    const { agent } = await owner();
    for (let index = 0; index < 3; index += 1) {
      await agent.post("/api/tasks").send({ title: `Task ${index}` });
    }

    const first = await agent.get("/api/tasks?page=1&limit=2");
    const second = await agent.get("/api/tasks?page=2&limit=2");

    expect(second.body.data.items).toHaveLength(1);
    const firstIds = first.body.data.items.map((task) => task.id);
    for (const task of second.body.data.items) expect(firstIds).not.toContain(task.id);
  });

  it("should clamp a limit above the maximum instead of trusting it", async () => {
    const { agent } = await owner();

    const response = await agent.get("/api/tasks?limit=5000");

    expect(response.status).toBe(200);
    expect(response.body.data.pagination.limit).toBe(100);
  });

  it("should filter by status", async () => {
    const { agent } = await owner();
    await agent.post("/api/tasks").send({ title: "Open" });
    await agent.post("/api/tasks").send({ title: "Closed", status: "COMPLETED" });

    const response = await agent.get("/api/tasks?status=COMPLETED");

    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].title).toBe("Closed");
  });

  it("should filter by a search term", async () => {
    const { agent } = await owner();
    await agent.post("/api/tasks").send({ title: "Renew passport" });
    await agent.post("/api/tasks").send({ title: "Water the plants" });

    const response = await agent.get("/api/tasks?search=passport");

    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].title).toBe("Renew passport");
  });

  it("should show a task created after the list was cached, which means the cache is invalidated on write", async () => {
    const { agent } = await owner();
    await agent.post("/api/tasks").send({ title: "First" });

    // Populates the cache.
    expect((await agent.get("/api/tasks")).body.data.pagination.total).toBe(1);

    await agent.post("/api/tasks").send({ title: "Second" });

    expect((await agent.get("/api/tasks")).body.data.pagination.total).toBe(2);
  });

  it("should reject an unauthenticated request with 401", async () => {
    const response = await request(app).get("/api/tasks");

    expect(response.status).toBe(401);
  });
});

describe("GET /api/tasks/:id", () => {
  it("should return one task with its subtasks", async () => {
    const { agent } = await owner();
    const created = await agent.post("/api/tasks").send({ title: "With a subtask" });
    const taskId = created.body.data.task.id;

    const subtask = await agent.post(`/api/tasks/${taskId}/subtasks`).send({ title: "Step one" });
    expect(subtask.status).toBe(201);

    const response = await agent.get(`/api/tasks/${taskId}`);

    expect(response.status).toBe(200);
    expect(response.body.data.task.title).toBe("With a subtask");
    expect(response.body.data.task.subtasks).toHaveLength(1);
  });

  it("should return 404 for a task id that does not exist", async () => {
    const { agent } = await owner();

    const response = await agent.get("/api/tasks/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Task not found");
  });
});

describe("PATCH /api/tasks/:id", () => {
  it("should apply the changes and return the updated task", async () => {
    const { agent } = await owner();
    const created = await agent.post("/api/tasks").send({ title: "Draft" });

    const response = await agent
      .patch(`/api/tasks/${created.body.data.task.id}`)
      .send({ title: "Final", status: "IN_PROGRESS" });

    expect(response.status).toBe(200);
    expect(response.body.data.task.title).toBe("Final");
    expect(response.body.data.task.status).toBe("IN_PROGRESS");
  });

  it("should leave untouched fields alone", async () => {
    const { agent } = await owner();
    const created = await agent
      .post("/api/tasks")
      .send({ title: "Keep priority", priority: "URGENT" });

    await agent
      .patch(`/api/tasks/${created.body.data.task.id}`)
      .send({ title: "New title" });

    const reread = await agent.get(`/api/tasks/${created.body.data.task.id}`);
    expect(reread.body.data.task.priority).toBe("URGENT");
  });

  it("should stamp completedAt when the status moves to COMPLETED", async () => {
    const { agent } = await owner();
    const created = await agent.post("/api/tasks").send({ title: "Finish me" });

    const response = await agent
      .patch(`/api/tasks/${created.body.data.task.id}`)
      .send({ status: "COMPLETED" });

    expect(response.body.data.task.completedAt).not.toBeNull();
  });

  it("should reject an invalid status with 400", async () => {
    const { agent } = await owner();
    const created = await agent.post("/api/tasks").send({ title: "Valid" });

    const response = await agent
      .patch(`/api/tasks/${created.body.data.task.id}`)
      .send({ status: "NOT_A_STATUS" });

    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/tasks/:id", () => {
  it("should delete the task and confirm with a message", async () => {
    const { agent } = await owner();
    const created = await agent.post("/api/tasks").send({ title: "Temporary" });

    const response = await agent.delete(`/api/tasks/${created.body.data.task.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, message: "Task deleted" });
    expect((await agent.get(`/api/tasks/${created.body.data.task.id}`)).status).toBe(404);
  });

  it("should return 404 when deleting something that is not there", async () => {
    const { agent } = await owner();

    const response = await agent.delete("/api/tasks/never-existed");

    expect(response.status).toBe(404);
  });

  it("should return 404 for a second delete of the same task", async () => {
    const { agent } = await owner();
    const created = await agent.post("/api/tasks").send({ title: "Delete once" });

    expect((await agent.delete(`/api/tasks/${created.body.data.task.id}`)).status).toBe(200);
    expect((await agent.delete(`/api/tasks/${created.body.data.task.id}`)).status).toBe(404);
  });
});

describe("the create -> read -> update -> delete workflow", () => {
  it("should carry one task through its whole life using the returned id", async () => {
    const { agent, user } = await owner();

    const created = await agent
      .post("/api/tasks")
      .send({ title: "Quarterly report", description: "Draft the numbers", priority: "HIGH" });
    expect(created.status).toBe(201);
    const taskId = created.body.data.task.id;
    expect(taskId).toEqual(expect.any(String));

    const read = await agent.get(`/api/tasks/${taskId}`);
    expect(read.status).toBe(200);
    expect(read.body.data.task).toMatchObject({
      id: taskId,
      title: "Quarterly report",
      description: "Draft the numbers",
      priority: "HIGH",
      status: "TODO",
      userId: user.id,
    });

    const updated = await agent
      .patch(`/api/tasks/${taskId}`)
      .send({ title: "Q3 report", status: "COMPLETED" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.task).toMatchObject({
      id: taskId,
      title: "Q3 report",
      status: "COMPLETED",
    });

    const listed = await agent.get("/api/tasks");
    expect(listed.body.data.pagination.total).toBe(1);
    expect(listed.body.data.items[0].id).toBe(taskId);

    const removed = await agent.delete(`/api/tasks/${taskId}`);
    expect(removed.status).toBe(200);

    expect((await agent.get(`/api/tasks/${taskId}`)).status).toBe(404);
    expect((await agent.get("/api/tasks")).body.data.pagination.total).toBe(0);
    expect(db.findRow("task", taskId)).toBeNull();
  });
});
